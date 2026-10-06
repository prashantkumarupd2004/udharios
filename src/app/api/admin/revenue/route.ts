/**
 * GET /api/admin/revenue — Revenue analytics (admin only).
 * Returns: 30-day daily revenue, trial→paid conversion, plan breakdown.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireAdmin } from '@/lib/admin'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [payments, planBreakdown, trialStats, subStats] = await Promise.all([
      prisma.payment.findMany({
        where: { paidAt: { gte: thirtyDaysAgo } },
        select: { amount: true, paidAt: true },
        orderBy: { paidAt: 'asc' },
      }),
      prisma.merchant.groupBy({
        by: ['plan'],
        _count: true,
        where: { isApproved: true },
      }),
      // Trial conversion: trials ended vs converted to paid
      prisma.merchant.aggregate({
        where: { isApproved: true },
        _count: true,
      }),
      prisma.subscription.groupBy({
        by: ['status'],
        _count: true,
      }),
    ])

    // Daily buckets
    const daily: Record<string, number> = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      daily[d.toISOString().slice(0, 10)] = 0
    }
    for (const p of payments) {
      const day = p.paidAt.toISOString().slice(0, 10)
      if (day in daily) daily[day] += Number(p.amount)
    }

    const totalRevenue30d = Object.values(daily).reduce((a, b) => a + b, 0)

    // Conversion: paid plans vs total approved
    const paidCount = planBreakdown
      .filter(p => !['trial', 'free'].includes(p.plan))
      .reduce((a, p) => a + p._count, 0)
    const totalApproved = trialStats._count
    const conversionRate = totalApproved > 0 ? Math.round((paidCount / totalApproved) * 100) : 0

    return NextResponse.json({
      ok: true,
      daily: Object.entries(daily).map(([date, revenue]) => ({ date, revenue: Math.round(revenue) })),
      totalRevenue30d: Math.round(totalRevenue30d),
      conversionRate,
      paidCount,
      totalApproved,
      planBreakdown: planBreakdown.map(p => ({ plan: p.plan, count: p._count })),
      subscriptionStatuses: subStats.map(s => ({ status: s.status, count: s._count })),
    })
  } catch (err) {
    logger.error('Admin revenue error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
