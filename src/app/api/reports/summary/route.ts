/**
 * GET /api/reports/summary — Dashboard KPIs
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { startOfWeekIST, nowIST } from '@/lib/date-utils'

async function getMerchantId(request: NextRequest): Promise<string | null> {
  const session = await getSession()
    if (!session?.merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const dbUser = await prisma.user.findFirst({
    where: { supabaseId: user.id },
    select: { merchantId: true },
  })
  return session.merchantId ?? null
}

export async function GET(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const weekStart = startOfWeekIST()
    const monthStart = new Date(nowIST().getFullYear(), nowIST().getMonth(), 1)

    const [
      totalOutstanding,
      totalOverdue,
      totalPaid,
      collectedThisWeek,
      collectedThisMonth,
      openPromises,
      openDisputes,
      overdueCount,
    ] = await Promise.all([
      // Total outstanding (not paid, not written off)
      prisma.outstanding.aggregate({
        where: { merchantId, status: { notIn: ['paid', 'written_off'] } },
        _sum: { amount: true },
        _count: true,
      }),

      // Total overdue amount
      prisma.outstanding.aggregate({
        where: { merchantId, status: 'overdue' },
        _sum: { amount: true },
        _count: true,
      }),

      // Total paid all-time
      prisma.outstanding.aggregate({
        where: { merchantId, status: 'paid' },
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

      // Overdue count
      prisma.outstanding.count({
        where: { merchantId, status: 'overdue' },
      }),
    ])

    const totalOutstandingAmount = Number(totalOutstanding._sum.amount ?? 0)
    const totalPaidAmount = Number(totalPaid._sum.amount ?? 0)
    const collectionRate =
      totalPaidAmount + totalOutstandingAmount > 0
        ? Math.round(
            (totalPaidAmount / (totalPaidAmount + totalOutstandingAmount)) * 100
          )
        : 0

    return NextResponse.json({
      totalOutstanding: {
        amount: totalOutstandingAmount,
        count: totalOutstanding._count,
      },
      totalOverdue: {
        amount: Number(totalOverdue._sum.amount ?? 0),
        count: totalOverdue._count,
      },
      collectedThisWeek: Number(collectedThisWeek._sum.amount ?? 0),
      collectedThisMonth: Number(collectedThisMonth._sum.amount ?? 0),
      totalPaid: {
        amount: totalPaidAmount,
        count: totalPaid._count,
      },
      openPromises,
      openDisputes,
      overdueCount,
      collectionRate,
    })
  } catch (err) {
    logger.error('GET /api/reports/summary error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
