/**
 * GET /api/admin/dashboard — Combined dashboard data (admin only).
 *
 * Merges stats + revenue + health into ONE serverless invocation so the
 * admin panel loads with a single cold start instead of three.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getAdminSession } from '@/lib/admin-auth'

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const [
      totalMerchants,
      approvedMerchants,
      trialMerchants,
      pendingRequests,
      totalRequests,
      totalCalls,
      totalReminders,
      whatsappSent,
      smsSent,
      voiceSent,
      activeSubscriptions,
      totalPayments,
      revenueAgg,
      recentMerchants,
      recentRequests,
      payments30d,
      planBreakdown,
      subStatusBreakdown,
      failedCalls,
      failedReminders,
      totalCalls24h,
      totalReminders24h,
      deliveredReminders,
      recentFailures,
    ] = await Promise.all([
      prisma.merchant.count(),
      prisma.merchant.count({ where: { isApproved: true } }),
      prisma.merchant.count({ where: { plan: 'trial', isApproved: true } }),
      prisma.accessRequest.count({ where: { status: 'pending' } }),
      prisma.accessRequest.count(),
      prisma.call.count(),
      prisma.reminderLog.count(),
      prisma.reminderLog.count({ where: { channel: 'whatsapp' } }),
      prisma.reminderLog.count({ where: { channel: 'sms' } }),
      prisma.reminderLog.count({ where: { channel: 'voice' } }),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.payment.count(),
      prisma.payment.aggregate({ _sum: { amount: true } }),
      prisma.merchant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true, businessName: true, phone: true, email: true,
          plan: true, isApproved: true, createdAt: true,
        },
      }),
      prisma.accessRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true, name: true, businessName: true, phone: true,
          city: true, status: true, createdAt: true,
        },
      }),
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
      prisma.subscription.groupBy({ by: ['status'], _count: true }),
      prisma.call.count({
        where: { createdAt: { gte: dayAgo }, status: { in: ['failed', 'no-answer', 'busy'] } },
      }),
      prisma.reminderLog.count({
        where: { sentAt: { gte: dayAgo }, status: 'failed' },
      }),
      prisma.call.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.reminderLog.count({ where: { sentAt: { gte: dayAgo } } }),
      prisma.reminderLog.count({
        where: { sentAt: { gte: dayAgo }, status: { in: ['delivered', 'read', 'sent'] } },
      }),
      prisma.reminderLog.findMany({
        where: { sentAt: { gte: dayAgo }, status: 'failed' },
        orderBy: { sentAt: 'desc' },
        take: 10,
        select: {
          id: true, channel: true, failedReason: true, sentAt: true,
          merchant: { select: { businessName: true } },
        },
      }),
    ])

    // Per-merchant usage (top 10 by reminders sent)
    const topMerchants = await prisma.merchant.findMany({
      take: 10,
      select: {
        id: true,
        businessName: true,
        phone: true,
        plan: true,
        _count: { select: { reminderLogs: true, calls: true, customers: true } },
      },
      orderBy: { reminderLogs: { _count: 'desc' } },
    })

    // 30-day daily revenue buckets
    const daily: Record<string, number> = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      daily[d.toISOString().slice(0, 10)] = 0
    }
    for (const p of payments30d) {
      const day = p.paidAt.toISOString().slice(0, 10)
      if (day in daily) daily[day] += Number(p.amount)
    }
    const totalRevenue30d = Object.values(daily).reduce((a, b) => a + b, 0)

    const paidCount = planBreakdown
      .filter(p => !['trial', 'free'].includes(p.plan))
      .reduce((a, p) => a + p._count, 0)
    const totalApproved = approvedMerchants
    const conversionRate = totalApproved > 0 ? Math.round((paidCount / totalApproved) * 100) : 0

    // Health alerts
    const callSuccessRate =
      totalCalls24h > 0 ? Math.round(((totalCalls24h - failedCalls) / totalCalls24h) * 100) : 100
    const msgDeliveryRate =
      totalReminders24h > 0 ? Math.round((deliveredReminders / totalReminders24h) * 100) : 100

    const alerts: { level: 'critical' | 'warning'; message: string }[] = []
    if (failedCalls > 10) {
      alerts.push({ level: 'critical', message: `${failedCalls} calls failed in last 24h — Exotel check karo.` })
    } else if (failedCalls > 0) {
      alerts.push({ level: 'warning', message: `${failedCalls} calls failed in last 24h.` })
    }
    if (msgDeliveryRate < 80 && totalReminders24h > 0) {
      alerts.push({ level: 'critical', message: `Message delivery ${msgDeliveryRate}% — MSG91/WhatsApp check karo.` })
    } else if (failedReminders > 0) {
      alerts.push({ level: 'warning', message: `${failedReminders} messages failed in last 24h.` })
    }

    return NextResponse.json({
      ok: true,
      stats: {
        totalMerchants,
        approvedMerchants,
        trialMerchants,
        pendingRequests,
        totalRequests,
        totalCalls,
        totalReminders,
        whatsappSent,
        smsSent,
        voiceSent,
        activeSubscriptions,
        totalPayments,
        totalRevenue: Number(revenueAgg._sum?.amount ?? 0),
      },
      recentMerchants,
      recentRequests,
      topMerchants: topMerchants.map(m => ({
        id: m.id,
        businessName: m.businessName,
        phone: m.phone,
        plan: m.plan,
        reminders: m._count.reminderLogs,
        calls: m._count.calls,
        customers: m._count.customers,
      })),
      revenue: {
        daily: Object.entries(daily).map(([date, revenue]) => ({ date, revenue })),
        totalRevenue30d,
        conversionRate,
        planBreakdown: planBreakdown.map(p => ({ plan: p.plan, count: p._count })),
        subStatus: subStatusBreakdown.map(s => ({ status: s.status, count: s._count })),
      },
      health: {
        alerts,
        calls: { total24h: totalCalls24h, failed24h: failedCalls, successRate: callSuccessRate },
        messages: { total24h: totalReminders24h, failed24h: failedReminders, deliveryRate: msgDeliveryRate },
        recentFailures: recentFailures.map(f => ({
          id: f.id,
          channel: f.channel,
          reason: f.failedReason,
          merchant: f.merchant.businessName,
          sentAt: f.sentAt,
        })),
      },
    })
  } catch (err) {
    logger.error('Admin dashboard error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
