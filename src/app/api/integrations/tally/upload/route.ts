/**
 * POST /api/integrations/tally/upload — Upload Tally XML/CSV export of
 * bill-wise outstanding receivables.
 * Auth: JWT session cookie
 * Form: file (xml/csv), companyName (optional)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { syncBillsFromTally, syncCustomersFromTally, applyTallyReceipts } from '@/lib/tally'
import { parseTallyXml, parseTallyCsv, parseTallyLedgers, parseTallyReceipts } from '@/lib/tally-parse'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

/**
 * Tally XML export UTF-16LE (BOM FF FE) me hota hai — file.text() use karne se
 * garbage milta hai. BOM dekh kar sahi encoding se decode karo.
 */
async function decodeUploadFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf)
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buf)
  }
  // UTF-8 (BOM ho to strip)
  const text = new TextDecoder('utf-8').decode(buf)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const form = await request.formData()
    const file = form.get('file') as File | null
    const companyName = (form.get('companyName') as string | null)?.trim() || undefined

    if (!file) {
      return NextResponse.json({ error: 'File chahiye' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File 10MB se chhoti honi chahiye' }, { status: 400 })
    }

    const text = await decodeUploadFile(file)
    const name = file.name.toLowerCase()
    const isCsv = name.endsWith('.csv')

    const { bills, warnings } = isCsv
      ? parseTallyCsv(text, companyName)
      : parseTallyXml(text, companyName)

    // Customer master: Tally XML me ledger rows bhi ho sakte hain —
    // jitne Sundry Debtors milenge, sab auto-add honge (bill ho ya na ho)
    let masterSynced = { matched: 0, created: 0 }
    if (!isCsv) {
      const { customers } = parseTallyLedgers(text)
      if (customers.length > 0) {
        masterSynced = await syncCustomersFromTally(session.merchantId, customers)
      }
    }

    if (bills.length === 0 && masterSynced.created + masterSynced.matched === 0) {
      return NextResponse.json(
        { error: warnings[0] ?? 'Koi bill ya customer nahi mila', warnings },
        { status: 400 }
      )
    }

    const result = bills.length > 0
      ? await syncBillsFromTally(session.merchantId, bills, 'tally_xml')
      : { billsUpserted: 0, billsPaid: 0, customersMatched: 0, customersCreated: 0, outstandingsUpserted: 0 }

    // Receipts / Credit Notes / Debit Notes — pending amount adjust karo
    // (Tally me payment entry hote hi outstanding auto-update!)
    let receiptsResult = { receiptsApplied: 0, billsPaidOff: 0 }
    if (!isCsv) {
      const { receipts } = parseTallyReceipts(text, companyName)
      if (receipts.length > 0) {
        receiptsResult = await applyTallyReceipts(session.merchantId, receipts)
      }
    }

    await appendAuditLog({
      merchantId: session.merchantId,
      actor: 'merchant',
      action: AUDIT_ACTIONS.MERCHANT_UPDATED,
      entity: 'tally_upload',
      entityId: session.merchantId,
      payload: { file: file.name, billsFound: bills.length, ...result },
    }).catch(() => {})

    return NextResponse.json({
      ok: true,
      billsFound: bills.length,
      warnings,
      customersFromMaster: masterSynced,
      ...result,
      receiptsApplied: receiptsResult.receiptsApplied,
      billsPaidOff: receiptsResult.billsPaidOff,
      customersCreated: result.customersCreated + masterSynced.created,
      customersMatched: result.customersMatched + masterSynced.matched,
    })
  } catch (err) {
    logger.error('POST /api/integrations/tally/upload error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
