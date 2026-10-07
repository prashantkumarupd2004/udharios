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
  const result: SyncResult = {
    billsUpserted: 0,
    billsPaid: 0,
    customersMatched: 0,
    customersCreated: 0,
    outstandingsUpserted: 0,
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const b of bills) {
    const billRef = b.billRef.trim()
    const partyName = b.partyName.trim()
    if (!billRef || !partyName) continue

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
      continue
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

  logger.info('Tally bill sync complete', { merchantId, source, ...result })
  return result
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
