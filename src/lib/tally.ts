/**
 * src/lib/tally.ts — Tally integration core
 *
 * Bills synced from Tally (XML upload or sync agent) are stored in the `bills`
 * table and mirrored into `outstandings` (invoiceNo = Tally bill ref) so the
 * entire reminder engine — WhatsApp templates, voice calls, escalation —
 * automatically becomes bill-aware with zero changes to the engine itself.
 */

import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { BillSource } from '@prisma/client'
import { logger } from '@/lib/logger'
import type { TallyReceiptInput } from '@/lib/tally-parse'

export interface TallyBillInput {
  billRef: string
  partyName: string
  partyPhone?: string
  amount: number
  pendingAmount: number
  billDate: string // YYYY-MM-DD
  dueDate?: string // YYYY-MM-DD
  voucherType?: string
  tallyCompany?: string
}

export interface SyncResult {
  billsUpserted: number
  billsPaid: number
  customersMatched: number
  customersCreated: number
  outstandingsUpserted: number
  errors?: string[]
}

export interface TallyCustomerInput {
  name: string
  phone?: string
  address?: string
  gstin?: string
  tallyCompany?: string
}

/**
 * Upsert customer master from Tally (ledger list / debtor master).
 * Matches by phone first, then by name (case-insensitive). Creates missing.
 * Returns { matched, created }.
 */
export async function syncCustomersFromTally(
  merchantId: string,
  customers: TallyCustomerInput[]
): Promise<{ matched: number; created: number }> {
  let matched = 0
  let created = 0

  for (const c of customers) {
    const name = c.name.trim()
    if (!name) continue
    const phone = c.phone?.trim()

    let existing = null
    if (phone) {
      existing = await prisma.customer.findUnique({
        where: { merchantId_phone: { merchantId, phone } },
      })
    }
    if (!existing) {
      existing = await prisma.customer.findFirst({
        where: { merchantId, name: { equals: name, mode: 'insensitive' } },
      })
    }

    if (existing) {
      matched++
      // Fill in missing phone/address from Tally master
      const patch: Record<string, string> = {}
      if (phone && existing.phone.startsWith('tally-')) patch.phone = phone
      if (c.address && !existing.notes?.includes(c.address)) {
        patch.notes = [existing.notes, `Tally address: ${c.address}`].filter(Boolean).join(' | ')
      }
      if (Object.keys(patch).length > 0) {
        await prisma.customer.update({ where: { id: existing.id }, data: patch })
      }
    } else {
      await prisma.customer.create({
        data: {
          merchantId,
          name,
          phone: phone || `tally-ledger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          // Tally ke existing debtors hain — pending dues ke transactional
          // reminders ke liye consent implied hai (business relationship)
          consent: true,
          consentAt: new Date(),
          notes: [
            'Auto-added from Tally customer master',
            c.address ? `Address: ${c.address}` : '',
            c.gstin ? `GSTIN: ${c.gstin}` : '',
          ]
            .filter(Boolean)
            .join(' | '),
        },
      })
      created++
    }
  }

  logger.info('Tally customer master sync complete', { merchantId, matched, created })
  return { matched, created }
}

function parseDate(s?: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Upsert bills from Tally and mirror them into outstandings.
 * Bills with pendingAmount <= 0 are marked paid (and their outstanding too).
 */
export async function syncBillsFromTally(
  merchantId: string,
  bills: TallyBillInput[],
  source: BillSource
): Promise<SyncResult> {
  // Hamesha bulk fast path use karo (chhoti files ke liye bhi tez hai)
  // Pehle 100+ pe tha, lekin 29 bills bhi sequential me slow the → timeout!
  return syncBillsFromTallyBulk(merchantId, bills, source)
}

async function syncOneBill(
  merchantId: string,
  b: TallyBillInput,
  source: BillSource,
  today: Date,
  result: SyncResult
): Promise<void> {
    const billRef = b.billRef.trim()
    const partyName = b.partyName.trim()
    if (!billRef || !partyName) return

    const pending = Math.max(0, Number(b.pendingAmount) || 0)
    const amount = Number(b.amount) || pending
    const billDate = parseDate(b.billDate) ?? today
    const dueDate = parseDate(b.dueDate)

    // --- match or create customer -------------------------------------------
    let customer = null
    if (b.partyPhone) {
      customer = await prisma.customer.findUnique({
        where: { merchantId_phone: { merchantId, phone: b.partyPhone.trim() } },
      })
    }
    if (!customer) {
      customer = await prisma.customer.findFirst({
        where: { merchantId, name: { equals: partyName, mode: 'insensitive' } },
      })
    }
    if (customer) {
      result.customersMatched++
    } else {
      customer = await prisma.customer.create({
        data: {
          merchantId,
          name: partyName,
          phone: b.partyPhone?.trim() || `tally-${billRef}`,
          // Bill wala existing debtor — transactional reminders ke liye consent implied
          consent: true,
          consentAt: new Date(),
          notes: `Auto-created from Tally bill ${billRef}`,
        },
      })
      result.customersCreated++
    }

    // --- upsert bill ---------------------------------------------------------
    const bill = await prisma.bill.upsert({
      where: {
        merchantId_billRef_partyName: { merchantId, billRef, partyName },
      },
      update: {
        customerId: customer.id,
        partyPhone: b.partyPhone?.trim() || undefined,
        amount,
        pendingAmount: pending,
        billDate,
        dueDate,
        voucherType: b.voucherType,
        tallyCompany: b.tallyCompany,
        source,
        syncedAt: new Date(),
      },
      create: {
        merchantId,
        customerId: customer.id,
        billRef,
        partyName,
        partyPhone: b.partyPhone?.trim(),
        amount,
        pendingAmount: pending,
        billDate,
        dueDate,
        voucherType: b.voucherType,
        tallyCompany: b.tallyCompany,
        source,
      },
    })
    result.billsUpserted++

    // --- mirror into outstandings so reminders go bill-aware -----------------
    const existing = await prisma.outstanding.findFirst({
      where: { merchantId, invoiceNo: billRef },
    })

    if (pending <= 0) {
      // Bill fully paid in Tally — close the outstanding
      if (existing && existing.status !== 'paid') {
        await prisma.outstanding.update({
          where: { id: existing.id },
          data: { status: 'paid', paidAt: new Date() },
        })
        result.billsPaid++
      }
      return
    }

    const status = dueDate && dueDate < today ? 'overdue' : 'upcoming'
    const outstandingData = {
      merchantId,
      customerId: customer.id,
      invoiceNo: billRef,
      amount: pending,
      dueDate: dueDate ?? billDate,
      status: existing ? existing.status : status,
      notes: `Synced from Tally${b.tallyCompany ? ` (${b.tallyCompany})` : ''} — bill ${billRef}`,
    }

    if (existing) {
      await prisma.outstanding.update({ where: { id: existing.id }, data: outstandingData })
    } else {
      await prisma.outstanding.create({ data: outstandingData })
    }
    result.outstandingsUpserted++
}

// ---------------------------------------------------------------------------
// Receipts / Credit Notes / Debit Notes — pending amount adjust karo
// ---------------------------------------------------------------------------

export interface ReceiptSyncResult {
  receiptsApplied: number
  billsPaidOff: number
  errors?: string[]
}

/**
 * Tally se aaye Receipt / Credit Note / Debit Note ko bills pe apply karo.
 * - Receipt / Credit Note → pending amount KAM hota hai
 * - Debit Note → pending amount BADHTA hai
 * - Agar pending 0 ho jaye → outstanding 'paid' mark, call band!
 *
 * WATERFALL: ek receipt ka amount ek se zyada bills pe lag sakta hai.
 * Sabse purane pending bill se shuru karo; jo bache use agle bill pe lagao.
 * (Pehle wala code bacha hua amount gira deta tha — bills galat outstanding dikhte the.)
 */
export async function applyTallyReceipts(
  merchantId: string,
  receipts: TallyReceiptInput[]
): Promise<ReceiptSyncResult> {
  const result: ReceiptSyncResult = { receiptsApplied: 0, billsPaidOff: 0 }
  const errors: string[] = []

  // Party-wise group karo — alag parties parallel, same party sequential (waterfall sahi rahe)
  const byParty = new Map<string, TallyReceiptInput[]>()
  for (const r of receipts) {
    const key = r.partyName.trim().toLowerCase()
    if (!byParty.has(key)) byParty.set(key, [])
    byParty.get(key)!.push(r)
  }

  const groups = [...byParty.values()]
  // 5 groups ek saath parallel
  for (let i = 0; i < groups.length; i += 5) {
    const batch = groups.slice(i, i + 5)
    const results = await Promise.all(
      batch.map((group) => applyReceiptGroup(merchantId, group))
    )
    for (const r of results) {
      result.receiptsApplied += r.receiptsApplied
      result.billsPaidOff += r.billsPaidOff
      errors.push(...r.errors)
    }
  }

  logger.info('Tally receipts applied', { merchantId, ...result, errors: errors.length })
  return { ...result, errors }
}

/** Ek party ke receipts sequential apply karo (waterfall correctness ke liye) */
async function applyReceiptGroup(
  merchantId: string,
  receipts: TallyReceiptInput[]
): Promise<ReceiptSyncResult & { errors: string[] }> {
  const result: ReceiptSyncResult = { receiptsApplied: 0, billsPaidOff: 0 }
  const errors: string[] = []

  for (const r of receipts) {
    try {
      const partyName = r.partyName.trim()
      if (!partyName || r.amount <= 0) continue

      const isIncrease = r.voucherType === 'Debit Note'
      let remaining = Math.round(r.amount * 100) / 100
      let appliedAny = false
      let guard = 0

      // Pehle specific bill (agar billRef diya hai aur match karta hai), phir FIFO waterfall
      const billOrder: { id: string }[] = []
      if (r.billRef) {
        const specific = await prisma.bill.findFirst({
          where: { merchantId, billRef: r.billRef.trim(), pendingAmount: { gt: 0 } },
          select: { id: true },
        })
        if (specific) billOrder.push(specific)
      }

      while (remaining > 0.005 && guard < 500) {
        guard++
        let bill = null
        if (billOrder.length > 0) {
          const next = billOrder.shift()!
          bill = await prisma.bill.findFirst({
            where: { id: next.id, pendingAmount: { gt: 0 } },
          })
        }
        if (!bill) {
          // Party ka sabse purana pending bill (FIFO)
          bill = await prisma.bill.findFirst({
            where: {
              merchantId,
              partyName: { equals: partyName, mode: 'insensitive' },
              pendingAmount: { gt: 0 },
            },
            orderBy: { billDate: 'asc' },
          })
        }
        if (!bill) break // koi pending bill nahi — bacha amount ignore

        const billPending = Math.round(Number(bill.pendingAmount) * 100) / 100
        const applied = Math.min(billPending, remaining)
        if (applied <= 0) break
        const newPending = Math.round((billPending - applied) * 100) / 100

        await prisma.bill.update({
          where: { id: bill.id },
          data: { pendingAmount: isIncrease ? billPending + r.amount : newPending, syncedAt: new Date() },
        })
        // Note: Debit Note pura amount ek bill pe lagta hai (increase), waterfall nahi
        const thisApplied = isIncrease ? r.amount : applied

        // Outstanding bhi update karo
        const outstanding = await prisma.outstanding.findFirst({
          where: { merchantId, invoiceNo: bill.billRef, status: { not: 'paid' } },
        })
        if (outstanding) {
          const outPending = isIncrease
            ? Math.round((Number(outstanding.amount) + r.amount) * 100) / 100
            : newPending
          if (!isIncrease && newPending <= 0) {
            await prisma.outstanding.update({
              where: { id: outstanding.id },
              data: { status: 'paid', paidAt: new Date() },
            })
            result.billsPaidOff++
          } else {
            await prisma.outstanding.update({
              where: { id: outstanding.id },
              data: { amount: outPending },
            })
          }

          // Payment record banao (Tally receipt se)
          await prisma.payment.create({
            data: {
              razorpayPaymentId: `tally_${r.voucherType.replace(/\s/g, '_')}_${r.receiptRef}_${Date.now()}_${guard}`,
              merchantId,
              outstandingId: outstanding.id,
              amount: thisApplied,
              method: r.voucherType === 'Receipt' ? 'tally_receipt' : r.voucherType === 'Credit Note' ? 'credit_note' : 'debit_note',
              paidAt: new Date(r.receiptDate),
              raw: {
                source: 'tally',
                voucherType: r.voucherType,
                receiptRef: r.receiptRef,
                billRef: bill.billRef,
              },
            },
          })
        }

        appliedAny = true
        if (isIncrease) break // debit note: ek bill pe pura increase, waterfall nahi
        remaining = Math.round((remaining - applied) * 100) / 100
      }

      if (appliedAny) result.receiptsApplied++
    } catch (err) {
      const msg = `Receipt ${r.receiptRef} fail: ${err instanceof Error ? err.message : String(err)}`
      logger.error('Tally receipt apply failed', { merchantId, receiptRef: r.receiptRef, error: String(err) })
      errors.push(msg)
    }
  }

  return { ...result, errors }
}

// ---------------------------------------------------------------------------
// Sync-agent API key helpers (key shown once, only hash stored)
// ---------------------------------------------------------------------------

export function generateTallyApiKey(): { key: string; hash: string } {
  const key = `tally_${randomBytes(24).toString('hex')}`
  const hash = createHash('sha256').update(key).digest('hex')
  return { key, hash }
}

export async function verifyTallyApiKey(key: string) {
  if (!key.startsWith('tally_')) return null
  const hash = createHash('sha256').update(key).digest('hex')
  const conn = await prisma.tallyConnection.findFirst({
    where: { apiKeyHash: hash, status: 'active' },
  })
  return conn
}

/**
 * BULK sync — 100+ bills ke liye fast path.
 * Per-bill sequential queries ki jagah batch operations.
 * 4000 bills: ~20,000 queries → ~50 queries
 */
export async function syncBillsFromTallyBulk(
  merchantId: string,
  bills: TallyBillInput[],
  source: BillSource
): Promise<SyncResult> {
  const result: SyncResult = {
    billsUpserted: 0,
    billsPaid: 0,
    customersMatched: 0,
    customersCreated: 0,
    outstandingsUpserted: 0,
  }
  const errors: string[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Deduplicate by billRef (last wins)
  const billMap = new Map<string, TallyBillInput>()
  for (const b of bills) {
    const ref = b.billRef?.trim()
    if (ref && b.partyName?.trim()) billMap.set(ref, b)
  }
  const uniqueBills = [...billMap.values()]
  if (uniqueBills.length === 0) return { ...result, errors }

  try {
    // --- STEP 1: Customers (bulk) ---
    const partyNames = [...new Set(uniqueBills.map(b => b.partyName.trim()))]
    // Existing customers dhoondho (exact name match)
    const existingCustomers = await prisma.customer.findMany({
      where: { merchantId, name: { in: partyNames } },
      select: { id: true, name: true },
    })
    const customerByName = new Map<string, string>(existingCustomers.map((c: any) => [c.name.toLowerCase(), c.id] as [string, string]))
    result.customersMatched = existingCustomers.length

    // Missing customers banao — BULK (createMany + re-fetch IDs)
    const missingNames = partyNames.filter(n => !customerByName.has(n.toLowerCase()))
    if (missingNames.length > 0) {
      const now = new Date()
      const toCreate = missingNames.map((name) => {
        const bill = uniqueBills.find(b => b.partyName.trim() === name)
        return {
          merchantId,
          name,
          phone: bill?.partyPhone?.trim() || `tally-${bill?.billRef || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          consent: true,
          consentAt: now,
          notes: 'Auto-created from Tally bulk import',
        }
      })
      // Batches me createMany (500 ek saath)
      for (let i = 0; i < toCreate.length; i += 500) {
        await prisma.customer.createMany({
          data: toCreate.slice(i, i + 500),
          skipDuplicates: true,
        })
      }
      // IDs wapas lao
      const created = await prisma.customer.findMany({
        where: { merchantId, name: { in: missingNames } },
        select: { id: true, name: true },
      })
      for (const c of created) {
        customerByName.set((c as any).name.toLowerCase(), (c as any).id)
      }
      result.customersCreated = created.length
    }

    // --- STEP 2: Bills (bulk upsert) ---
    const billRefs = uniqueBills.map(b => b.billRef.trim())
    const existingBills = await prisma.bill.findMany({
      where: { merchantId, billRef: { in: billRefs } },
      select: { id: true, billRef: true },
    })
    const billIdByRef = new Map<string, string>(existingBills.map((b: any) => [b.billRef, b.id] as [string, string]))

    const billsToCreate: any[] = []
    const billsToUpdate: { id: string; data: any }[] = []

    for (const b of uniqueBills) {
      const ref = b.billRef.trim()
      const pending = Math.max(0, Number(b.pendingAmount) || 0)
      const amount = Number(b.amount) || pending
      const customerId = customerByName.get(b.partyName.trim().toLowerCase())
      const billDate = parseDate(b.billDate) ?? today
      const dueDate = parseDate(b.dueDate)

      const data = {
        merchantId,
        customerId: customerId ?? null,
        billRef: ref,
        partyName: b.partyName.trim(),
        partyPhone: b.partyPhone?.trim() || null,
        amount,
        pendingAmount: pending,
        billDate,
        dueDate,
        voucherType: b.voucherType || null,
        source,
        tallyCompany: b.tallyCompany || null,
      }

      const existingId = billIdByRef.get(ref)
      if (existingId) {
        billsToUpdate.push({ id: existingId, data: data as any })
      } else {
        billsToCreate.push(data as any)
      }
    }

    // Bulk create (batches of 500)
    for (let i = 0; i < billsToCreate.length; i += 500) {
      const batch = billsToCreate.slice(i, i + 500)
      await prisma.bill.createMany({ data: batch, skipDuplicates: true })
      result.billsUpserted += batch.length
    }
    // Updates (parallel batches of 50)
    for (let i = 0; i < billsToUpdate.length; i += 50) {
      const batch = billsToUpdate.slice(i, i + 50)
      await Promise.all(batch.map(({ id, data }) =>
        prisma.bill.update({ where: { id }, data }).catch((e: any) => errors.push(`Bill update ${id}: ${e.message}`))
      ))
      result.billsUpserted += batch.length
    }

    // --- STEP 3: Outstandings (bulk upsert) ---
    // Bill IDs chahiye (newly created ke liye phir se fetch)
    const allBills = await prisma.bill.findMany({
      where: { merchantId, billRef: { in: billRefs } },
      select: { id: true, billRef: true, customerId: true, pendingAmount: true, dueDate: true, partyName: true },
    })
    const billByRef = new Map(allBills.map((b: any) => [b.billRef, b]))

    const existingOs = await prisma.outstanding.findMany({
      where: { merchantId, invoiceNo: { in: billRefs } },
      select: { id: true, invoiceNo: true },
    })
    const osIdByRef = new Map<string, string>(existingOs.map((o: any) => [o.invoiceNo, o.id] as [string, string]))

    const osToCreate: any[] = []
    const osToUpdate: { id: string; data: any }[] = []

    for (const b of uniqueBills) {
      const ref = b.billRef.trim()
      const bill = billByRef.get(ref)
      if (!bill) continue
      const pending = Math.max(0, Number(b.pendingAmount) || 0)
      const dueDate = parseDate(b.dueDate) ?? parseDate(b.billDate) ?? today
      const status = pending <= 0 ? 'paid' : (dueDate < today ? 'overdue' : 'upcoming')

      const data = {
        merchantId,
        customerId: bill.customerId,
        billId: bill.id,
        invoiceNo: ref,
        amount: Number(b.amount) || pending,
        pendingAmount: pending,
        dueDate,
        status,
        source,
      }

      const existingId = osIdByRef.get(ref)
      if (existingId) {
        osToUpdate.push({ id: existingId, data: data as any })
      } else {
        osToCreate.push(data as any)
      }
      if (pending <= 0) result.billsPaid++
    }

    for (let i = 0; i < osToCreate.length; i += 500) {
      const batch = osToCreate.slice(i, i + 500)
      await prisma.outstanding.createMany({ data: batch, skipDuplicates: true })
      result.outstandingsUpserted += batch.length
    }
    for (let i = 0; i < osToUpdate.length; i += 50) {
      const batch = osToUpdate.slice(i, i + 50)
      await Promise.all(batch.map(({ id, data }) =>
        prisma.outstanding.update({ where: { id }, data }).catch((e: any) => errors.push(`OS update ${id}: ${e.message}`))
      ))
      result.outstandingsUpserted += batch.length
    }

    logger.info('Tally bulk sync complete', { merchantId, source, ...result, errors: errors.length })
  } catch (err) {
    const msg = `Bulk sync failed: ${err instanceof Error ? err.message : String(err)}`
    logger.error(msg, { merchantId })
    errors.push(msg)
  }

  return { ...result, errors }
}
