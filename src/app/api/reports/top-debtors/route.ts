/**
 * GET /api/reports/top-debtors — Top 5 customers by overdue total.
 *
 * The merchant dashboard previously fetched ALL overdue outstandings
 * (up to the pagination default) with heavy includes and aggregated
 * client-side — slow and only correct for the first page. This endpoint
 * aggregates in SQL and returns just the top 5.
 *
 * Query: limit (default 5, max 20)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const merchantId = session.merchantId

    const limit = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get('limit')) || 5, 1),
      20
    )

    const groups = await prisma.outstanding.groupBy({
      by: ['customerId'],
      where: { merchantId, status: 'overdue' },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: limit,
    })

    if (groups.length === 0) {
      return NextResponse.json({ topDebtors: [] })
    }

    const customers = await prisma.customer.findMany({
      where: { id: { in: groups.map(g => g.customerId) } },
      select: { id: true, name: true },
    })
    const nameById = new Map(customers.map(c => [c.id, c.name]))

    return NextResponse.json({
      topDebtors: groups.map(g => ({
        id: g.customerId,
        name: nameById.get(g.customerId) ?? '—',
        total: Number(g._sum.amount ?? 0),
      })),
    })
  } catch (err) {
    logger.error('GET /api/reports/top-debtors error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
