/**
 * GET /api/integrations/tally/status — Tally connection status + bill stats
 * Auth: JWT session cookie
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const conn = await prisma.tallyConnection.findUnique({
      where: { merchantId: session.merchantId },
    })

    if (!conn) {
      return NextResponse.json({ connected: false })
    }

    const [totalBills, pendingBills, pendingSum] = await Promise.all([
      prisma.bill.count({ where: { merchantId: session.merchantId } }),
      prisma.bill.count({ where: { merchantId: session.merchantId, pendingAmount: { gt: 0 } } }),
      prisma.bill.aggregate({
        where: { merchantId: session.merchantId, pendingAmount: { gt: 0 } },
        _sum: { pendingAmount: true },
      }),
    ])

    return NextResponse.json({
      connected: true,
      companyName: conn.companyName,
      status: conn.status,
      lastSyncAt: conn.lastSyncAt,
      lastBillCount: conn.lastBillCount,
      totalBills,
      pendingBills,
      pendingAmount: Number(pendingSum._sum.pendingAmount ?? 0),
    })
  } catch (err) {
    logger.error('GET /api/integrations/tally/status error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
