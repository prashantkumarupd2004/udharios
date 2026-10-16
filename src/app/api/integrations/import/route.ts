/**
 * POST /api/integrations/import — Universal Bill Import (Vyapar & others)
 *
 * Non-Tally merchants apne bills PDF / Excel / CSV me upload karte hain.
 * Do-step flow (auto-import KABHI nahi — merchant preview dekh kar confirm karta hai):
 *
 *   1. action=preview — file parse karo, bills + warnings wapas bhejo (NO db writes)
 *   2. action=import  — merchant-reviewed bills[] JSON bhejo → DB me likho
 *
 * Auth: JWT session cookie (tally upload route jaisa)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import {
  syncBillsFromTally,
  applyTallyReceipts,
  type TallyBillInput,
} from '@/lib/tally'
import type { TallyReceiptInput } from '@/lib/tally-parse'
import { BillSource } from '@prisma/client'
import {
  parsePdfText,
  parseExcelRows,
  type ParsedBill,
} from '@/lib/universal-import'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_SIZE = 10 * 1024 * 1024

interface PreviewResult {
  bills: ParsedBill[]
  fileKind: string
  warnings: string[]
}

async function parseUploadedFile(file: File): Promise<PreviewResult> {
  const name = file.name.toLowerCase()
  const warnings: string[] = []

  if (name.endsWith('.pdf')) {
    const buf = Buffer.from(await file.arrayBuffer())
    // Dynamic import — pdf-parse Node-only hai, build-time edge issues avoid karo.
    // NOTE: 'pdf-parse' ka main entry (index.js) me debug code hai jo bundled
    // env (Vercel/Next.js) me './test/data/05-versions-space.pdf' dhoondta hai
    // aur ENOENT deta hai — isliye seedha lib/pdf-parse.js import karo.
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as (
      b: Buffer
    ) => Promise<{ text: string }>
    const data = await pdfParse(buf)
    const text = data.text?.trim() ?? ''
    if (!text) {
      return {
        bills: [],
        fileKind: 'pdf',
        warnings: [
          'PDF se text nahi nikla — ye scanned image PDF ho sakta hai. Excel/CSV try karein',
        ],
      }
    }
    const { bills, warnings: w } = parsePdfText(text)
    return { bills, fileKind: 'pdf', warnings: [...warnings, ...w] }
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
    let rows: unknown[][]
    if (name.endsWith('.csv')) {
      const text = await file.text()
      const wb = XLSX.read(text, { type: 'string' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
    } else {
      const buf = Buffer.from(await file.arrayBuffer())
      const wb = XLSX.read(buf, { type: 'buffer' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
    }
    const { bills, warnings: w } = parseExcelRows(rows)
    return { bills, fileKind: name.endsWith('.csv') ? 'csv' : 'excel', warnings: [...warnings, ...w] }
  }

  throw new Error('Sirf PDF, Excel (.xlsx/.xls) ya CSV file chalegi')
}

const RECEIPT_TYPE: Record<string, string> = {
  credit_note: 'Credit Note',
  debit_note: 'Debit Note',
  receipt: 'Receipt',
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const merchantId = session.merchantId

    const form = await request.formData()
    const action = (form.get('action') as string) || 'preview'

    // ---- Step 1: preview (koi DB write nahi) ----
    if (action === 'preview') {
      const file = form.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'File chahiye' }, { status: 400 })
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: 'File 10MB se chhoti honi chahiye' }, { status: 400 })
      }

      let parsed: PreviewResult
      try {
        parsed = await parseUploadedFile(file)
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'File parse nahi hui' },
          { status: 400 }
        )
      }

      return NextResponse.json({
        ok: true,
        bills: parsed.bills,
        fileKind: parsed.fileKind,
        warnings: parsed.warnings,
      })
    }

    // ---- Step 2: import (merchant ne preview confirm kiya) ----
    if (action === 'import') {
      const billsRaw = form.get('bills') as string | null
      if (!billsRaw) {
        return NextResponse.json({ error: 'Bills missing hain' }, { status: 400 })
      }
      let bills: ParsedBill[]
      try {
        bills = JSON.parse(billsRaw)
      } catch {
        return NextResponse.json({ error: 'Bills JSON invalid hai' }, { status: 400 })
      }
      if (!Array.isArray(bills) || bills.length === 0) {
        return NextResponse.json({ error: 'Import karne ke liye koi bill nahi' }, { status: 400 })
      }

      const invoiceKinds = new Set(['invoice', 'ledger'])
      const adjustKinds = new Set(['credit_note', 'debit_note', 'receipt'])

      // Pehle invoices/ledger sync karo, PHIR credit/debit/receipt apply karo
      // (adjustments ko apply hone ke liye bill pehle DB me hona chahiye)
      const billInputs: TallyBillInput[] = []
      const receiptInputs: TallyReceiptInput[] = []
      let skipped = 0
      const errors: string[] = []

      for (const b of bills) {
        if (!b || typeof b !== 'object') {
          skipped++
          continue
        }
        if (invoiceKinds.has(b.kind)) {
          if (!b.partyName?.trim() || !(b.amount > 0 || b.pendingAmount > 0)) {
            skipped++
            errors.push(`Row skip: naam/amount missing (${b.billRef || '?'})`)
            continue
          }
          billInputs.push({
            billRef: (b.billRef || `IMP-${Date.now().toString(36)}`).trim(),
            partyName: b.partyName.trim(),
            partyPhone: b.partyPhone?.trim() || undefined,
            amount: Number(b.amount) || Number(b.pendingAmount) || 0,
            pendingAmount: Number(b.pendingAmount) || 0,
            billDate: b.billDate || new Date().toISOString().slice(0, 10),
            dueDate: b.dueDate,
            voucherType: b.kind === 'ledger' ? 'Ledger Balance' : 'File Import',
          })
        } else if (adjustKinds.has(b.kind)) {
          if (!b.partyName?.trim() || !(b.amount > 0)) {
            skipped++
            errors.push(`Row skip: naam/amount missing (${b.billRef || '?'})`)
            continue
          }
          receiptInputs.push({
            receiptRef: (b.billRef || `IMP-${Date.now().toString(36)}`).trim(),
            partyName: b.partyName.trim(),
            amount: Number(b.amount) || 0,
            receiptDate: b.billDate || new Date().toISOString().slice(0, 10),
            // billRef nahi bhejte — file import me pata nahi receipt kis bill ke against hai;
            // applyTallyReceipts FIFO waterfall se sabse purane pending bill pe lagayega
            billRef: undefined,
            voucherType: RECEIPT_TYPE[b.kind] ?? 'Receipt',
          })
        } else {
          skipped++ // unknown — merchant ne review me rakha to bhi import nahi karenge
        }
      }

      const source = 'file_import' as BillSource

      // Replace mode: purana file_import data hatao taaki dobara import clean ho.
      // (Purane buggy import ka galat pending/outstanding data saaf ho jayega.)
      // Sirf file_import source ka data delete hota hai — manual/Tally ka nahi.
      // Customer record rehne do (dobara match ho jayega).
      let replaced = 0
      if ((form.get('replace') as string) === 'true') {
        const oldBills = await prisma.bill.findMany({
          where: { merchantId, source: 'file_import' },
          select: { billRef: true },
        })
        const oldRefs = oldBills.map((b) => b.billRef)
        if (oldRefs.length > 0) {
          const oldOutstandings = await prisma.outstanding.findMany({
            where: { merchantId, invoiceNo: { in: oldRefs } },
            select: { id: true },
          })
          const oldOutIds = oldOutstandings.map((o) => o.id)
          if (oldOutIds.length > 0) {
            // Sirf tally/file-import se bani payment records hatao (manual payments safe)
            await prisma.payment.deleteMany({
              where: { outstandingId: { in: oldOutIds }, razorpayPaymentId: { startsWith: 'tally_' } },
            })
            await prisma.outstanding.deleteMany({ where: { id: { in: oldOutIds } } })
          }
          await prisma.bill.deleteMany({ where: { merchantId, source: 'file_import' } })
        }
        replaced = oldBills.length
      }

      const billResult =
        billInputs.length > 0
          ? await syncBillsFromTally(merchantId, billInputs, source)
          : { billsUpserted: 0, billsPaid: 0, customersMatched: 0, customersCreated: 0, outstandingsUpserted: 0, errors: [] as string[] }

      const receiptResult =
        receiptInputs.length > 0
          ? await applyTallyReceipts(merchantId, receiptInputs)
          : { receiptsApplied: 0, billsPaidOff: 0, errors: [] as string[] }

      const allErrors = [...(billResult.errors ?? []), ...(receiptResult.errors ?? []), ...errors]

      await appendAuditLog({
        merchantId,
        actor: 'merchant',
        action: AUDIT_ACTIONS.MERCHANT_UPDATED,
        entity: 'file_import',
        entityId: merchantId,
        payload: {
          billsReviewed: bills.length,
          billsUpserted: billResult.billsUpserted,
          receiptsApplied: receiptResult.receiptsApplied,
          skipped,
        },
      }).catch(() => {})

      return NextResponse.json({
        ok: true,
        imported: billResult.billsUpserted + receiptResult.receiptsApplied,
        replaced,
        outstandingsUpserted: billResult.outstandingsUpserted,
        billsPaidOff: billResult.billsPaid + receiptResult.billsPaidOff,
        customersCreated: billResult.customersCreated,
        customersMatched: billResult.customersMatched,
        skipped,
        errors: allErrors.slice(0, 20),
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    logger.error('POST /api/integrations/import error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
