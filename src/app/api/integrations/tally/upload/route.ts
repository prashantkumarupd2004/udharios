/**
 * POST /api/integrations/tally/upload — Upload Tally XML/CSV export of
 * bill-wise outstanding receivables.
 * Auth: JWT session cookie
 * Form: file (xml/csv), companyName (optional)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { syncBillsFromTally, syncCustomersFromTally } from '@/lib/tally'
import { parseTallyXml, parseTallyCsv, parseTallyLedgers } from '@/lib/tally-parse'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

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

    const text = await file.text()
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
      customersCreated: result.customersCreated + masterSynced.created,
      customersMatched: result.customersMatched + masterSynced.matched,
    })
  } catch (err) {
    logger.error('POST /api/integrations/tally/upload error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
