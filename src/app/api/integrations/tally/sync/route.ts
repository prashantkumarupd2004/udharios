/**
 * POST /api/integrations/tally/sync — Push bills from the Tally sync agent
 * Auth: x-tally-api-key header (key issued via /connect)
 * Body: { companyName?: string, bills: TallyBillInput[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncBillsFromTally, syncCustomersFromTally, verifyTallyApiKey } from '@/lib/tally'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const customerSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(20).optional(),
  address: z.string().max(300).optional(),
  gstin: z.string().max(20).optional(),
})

const billSchema = z.object({
  billRef: z.string().min(1).max(60),
  partyName: z.string().min(1).max(120),
  partyPhone: z.string().max(20).optional(),
  amount: z.number().min(0),
  pendingAmount: z.number().min(0),
  billDate: z.string().min(8),
  dueDate: z.string().optional(),
  voucherType: z.string().max(40).optional(),
  tallyCompany: z.string().max(120).optional(),
})

const schema = z.object({
  companyName: z.string().max(120).optional(),
  bills: z.array(billSchema).max(5000),
  customers: z.array(customerSchema).max(10000).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-tally-api-key') ?? ''
    const conn = await verifyTallyApiKey(apiKey)
    if (!conn) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const data = schema.parse(await request.json())

    // Customer master pehle — taaki bills sahi customers se jud jayein
    let masterSynced = { matched: 0, created: 0 }
    if (data.customers && data.customers.length > 0) {
      masterSynced = await syncCustomersFromTally(conn.merchantId, data.customers)
    }

    const result = await syncBillsFromTally(conn.merchantId, data.bills, 'tally_agent')

    await prisma.tallyConnection.update({
      where: { id: conn.id },
      data: {
        lastSyncAt: new Date(),
        lastBillCount: data.bills.length,
        companyName: data.companyName ?? conn.companyName,
      },
    })

    return NextResponse.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      customersFromMaster: masterSynced,
      ...result,
      customersCreated: result.customersCreated + masterSynced.created,
      customersMatched: result.customersMatched + masterSynced.matched,
    })
  } catch (err) {
    logger.error('POST /api/integrations/tally/sync error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
