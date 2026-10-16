/**
 * GET /api/admin/dashboard — Combined dashboard data (admin only).
 *
 * Merges stats + revenue + health into ONE serverless invocation so the
 * admin panel loads with a single cold start instead of three.
 *
 * Perf notes:
 * - Counts are consolidated into a handful of GROUP BY queries instead of
 *   ~25 separate round-trips (each round-trip costs 20–100ms on serverless).
 * - "Top merchants" no longer does a full-table relation-count sort
 *   (orderBy: { reminderLogs: { _count } } forces Postgres to COUNT every
 *   merchant's logs before sorting). It now aggregates reminder_logs once
 *   in SQL and fetches details for just the top 10.
 * - 30-day revenue buckets are aggregated in SQL (DATE + SUM) instead of
 *   pulling every payment row into JS.
 * - Response is cached in-memory for 60s (aggregate stats change slowly).
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getAdminSession } from '@/lib/admin-auth'

// Short in-memory TTL cache — aggregate stats change slowly. Per-instance
// best-effort (same pattern as the OTP rate limiter). Never caches errors.
let cache: { data: unknown; ts: number } | null = null
const CACHE_TTL_MS = 60_000

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data)
  }

  try {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const [
      merchantGroups,
      requestGroups,
      channelGroups,
      subGroups,
      msg24hGroups,
      call24hGroups,
      totalCalls,
      totalPayments,
      revenueAgg,
      recentMerchants,
      recentRequests,
      revenueRows,
      topMerchantIds,
      recentFailures,
    ] = await Promise.all([
      // Merchants: one GROUP BY instead of 3 separate counts
      prisma.merchant.groupBy({ by: ['plan', 'isApproved'], _count: true }),
      // Access requests: one GROUP BY instead of 2 counts
      prisma.accessRequest.groupBy({ by: ['status'], _count: true }),
      // Reminder logs by channel: one GROUP BY instead of 4 counts
      prisma.reminderLog.groupBy({ by: ['channel'], _count: true }),
      // Subscriptions: one GROUP BY gives both active count and breakdown
      prisma.subscription.groupBy({ by: ['status'], _count: true }),
      // Last-24h reminder logs by status: one GROUP BY instead of 3 counts
      prisma.reminderLog.groupBy({
        by: ['status'],
        where: { sentAt: { gte: dayAgo } },
        _count: true,
      }),
      // Last-24h calls by status: one GROUP BY instead of 2 counts
      prisma.call.groupBy({
        by: ['status'],
        where: { createdAt: { gte: dayAgo } },
        _count: true,
      }),
      prisma.call.count(),
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
      // 30-day revenue aggregated in SQL — no more pulling every payment row
      prisma.$queryRaw<{ day: Date; revenue: number }[]>`
        SELECT DATE(paid_at) AS day, SUM(amount)::float AS revenue
        FROM payments
        WHERE paid_at >= ${thirtyDaysAgo}
        GROUP BY 1
        ORDER BY 1`,
      // Top 10 merchants by reminder volume — single aggregate in SQL.
      // (The old orderBy: { reminderLogs: { _count: 'desc' } } made Postgres
      // COUNT every merchant's logs before sorting — the slowest query here.)
      prisma.$queryRaw<{ merchant_id: string; reminders: number }[]>`
        SELECT merchant_id, COUNT(*)::int AS reminders
        FROM reminder_logs
        GROUP BY merchant_id
        ORDER BY reminders DESC
        LIMIT 10`,
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

    // ---- Derive the same numbers the UI expects ----

    const totalMerchants = merchantGroups.reduce((a, g) => a + g._count, 0)
    const approvedMerchants = merchantGroups
      .filter(g => g.isApproved)
      .reduce((a, g) => a + g._count, 0)
    const trialMerchants = merchantGroups
      .filter(g => g.isApproved && g.plan === 'trial')
      .reduce((a, g) => a + g._count, 0)
    const planBreakdown = merchantGroups
      .filter(g => g.isApproved)
      .map(g => ({ plan: g.plan, count: g._count }))

    const pendingRequests = requestGroups.find(g => g.status === 'pending')?._count ?? 0
    const totalRequests = requestGroups.reduce((a, g) => a + g._count, 0)

    const countByChannel = (c: string) =>
      channelGroups.find(g => g.channel === c)?._count ?? 0
    const totalReminders = channelGroups.reduce((a, g) => a + g._count, 0)

    const activeSubscriptions = subGroups.find(g => g.status === 'active')?._count ?? 0

    const count24h = (s: string) =>
      msg24hGroups.find(g => g.status === s)?._count ?? 0
    const failedReminders = count24h('failed')
    const deliveredReminders = count24h('delivered') + count24h('read') + count24h('sent')
    const totalReminders24h = msg24hGroups.reduce((a, g) => a + g._count, 0)

    const callCount24h = (s: string) =>
      call24hGroups.find(g => g.status === s)?._count ?? 0
    const failedCalls = callCount24h('failed') + callCount24h('no-answer') + callCount24h('busy')
    const totalCalls24h = call24hGroups.reduce((a, g) => a + g._count, 0)

    // Details for just the top 10 (cheap: 10 rows, not a full-table sort)
    const topMerchants = await (async () => {
      if (topMerchantIds.length === 0) return []
      const merchants = await prisma.merchant.findMany({
        where: { id: { in: topMerchantIds.map(r => r.merchant_id) } },
        select: {
          id: true, businessName: true, phone: true, plan: true,
          _count: { select: { calls: true, customers: true } },
        },
      })
      const byId = new Map(merchants.map(m => [m.id, m]))
      return topMerchantIds.flatMap(r => {
        const m = byId.get(r.merchant_id)
        if (!m) return []
        return [{
          id: m.id,
          businessName: m.businessName,
          phone: m.phone,
          plan: m.plan,
          reminders: r.reminders,
          calls: m._count.calls,
          customers: m._count.customers,
        }]
      })
    })()

    // 30-day daily revenue buckets (zero-filled)
    const daily: Record<string, number> = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      daily[d.toISOString().slice(0, 10)] = 0
    }
    for (const r of revenueRows) {
      const day = new Date(r.day).toISOString().slice(0, 10)
      if (day in daily) daily[day] = r.revenue
    }
    const totalRevenue30d = Object.values(daily).reduce((a, b) => a + b, 0)

    const paidCount = planBreakdown
      .filter(p => !['trial', 'free'].includes(p.plan))
      .reduce((a, p) => a + p.count, 0)
    const conversionRate = approvedMerchants > 0 ? Math.round((paidCount / approvedMerchants) * 100) : 0

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

    const data = {
      ok: true,
      stats: {
        totalMerchants,
        approvedMerchants,
        trialMerchants,
        pendingRequests,
        totalRequests,
        totalCalls,
        totalReminders,
        whatsappSent: countByChannel('whatsapp'),
        smsSent: countByChannel('sms'),
        voiceSent: countByChannel('voice'),
        activeSubscriptions,
        totalPayments,
        totalRevenue: Number(revenueAgg._sum?.amount ?? 0),
      },
      recentMerchants,
      recentRequests,
      topMerchants,
      revenue: {
        daily: Object.entries(daily).map(([date, revenue]) => ({ date, revenue })),
        totalRevenue30d,
        conversionRate,
        planBreakdown,
        subStatus: subGroups.map(s => ({ status: s.status, count: s._count })),
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
    }

    cache = { data, ts: Date.now() }
    return NextResponse.json(data)
  } catch (err) {
    logger.error('Admin dashboard error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
