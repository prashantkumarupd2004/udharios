/**
 * GET /api/reports/summary — Dashboard KPIs
 *
 * Perf notes:
 * - The 4 outstanding aggregates (total / overdue / paid / overdue-count)
 *   are a single GROUP BY status instead of 4 separate round-trips.
 * - Response cached in-memory for 30s per merchant (dashboard polls this).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { startOfWeekIST, nowIST } from '@/lib/date-utils'

async function getMerchantId(request: NextRequest): Promise<string | null> {
  const session = await getSession()
    if (!session?.merchantId) return null
return session.merchantId ?? null
}

// Short per-merchant TTL cache — KPIs change slowly; the dashboard polls
// this endpoint every 60s. Per-instance best-effort. Never caches errors.
const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_TTL_MS = 30_000

export async function GET(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const cached = cache.get(merchantId)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json(cached.data)
    }

    const weekStart = startOfWeekIST()
    const monthStart = new Date(nowIST().getFullYear(), nowIST().getMonth(), 1)

    const [
      statusGroups,
      collectedThisWeek,
      collectedThisMonth,
      openPromises,
      openDisputes,
    ] = await Promise.all([
      // One GROUP BY replaces 4 separate outstanding aggregates/counts
      prisma.outstanding.groupBy({
        by: ['status'],
        where: { merchantId },
        _sum: { amount: true },
        _count: true,
      }),

      // Collected this week
      prisma.payment.aggregate({
        where: { merchantId, paidAt: { gte: weekStart }, needsReview: false },
        _sum: { amount: true },
      }),

      // Collected this month
      prisma.payment.aggregate({
        where: { merchantId, paidAt: { gte: monthStart }, needsReview: false },
        _sum: { amount: true },
      }),

      // Open promises count
      prisma.promise.count({
        where: { merchantId, status: 'open' },
      }),

      // Open disputes count
      prisma.dispute.count({
        where: { merchantId, status: 'open' },
      }),
    ])

    const sumFor = (statuses: string[]) =>
      statusGroups
        .filter(g => statuses.includes(g.status))
        .reduce((a, g) => a + Number(g._sum.amount ?? 0), 0)
    const countFor = (statuses: string[]) =>
      statusGroups
        .filter(g => statuses.includes(g.status))
        .reduce((a, g) => a + g._count, 0)

    const ACTIVE = ['upcoming', 'overdue', 'promised', 'disputed']
    const totalOutstandingAmount = sumFor(ACTIVE)
    const totalOutstandingCount = countFor(ACTIVE)
    const overdueAmount = sumFor(['overdue'])
    const overdueCount = countFor(['overdue'])
    const totalPaidAmount = sumFor(['paid'])
    const totalPaidCount = countFor(['paid'])

    const collectionRate =
      totalPaidAmount + totalOutstandingAmount > 0
        ? Math.round(
            (totalPaidAmount / (totalPaidAmount + totalOutstandingAmount)) * 100
          )
        : 0

    const data = {
      totalOutstanding: {
        amount: totalOutstandingAmount,
        count: totalOutstandingCount,
      },
      totalOverdue: {
        amount: overdueAmount,
        count: overdueCount,
      },
      collectedThisWeek: Number(collectedThisWeek._sum.amount ?? 0),
      collectedThisMonth: Number(collectedThisMonth._sum.amount ?? 0),
      totalPaid: {
        amount: totalPaidAmount,
        count: totalPaidCount,
      },
      openPromises,
      openDisputes,
      overdueCount,
      collectionRate,
    }

    cache.set(merchantId, { data, ts: Date.now() })
    // Bound memory: drop entries older than 5 min on each write
    if (cache.size > 500) {
      const cutoff = Date.now() - 5 * 60_000
      for (const [k, v] of cache) if (v.ts < cutoff) cache.delete(k)
    }

    return NextResponse.json(data)
  } catch (err) {
    logger.error('GET /api/reports/summary error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
