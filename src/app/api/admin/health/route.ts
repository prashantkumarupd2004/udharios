/**
 * GET /api/admin/health — System health alerts (admin only).
 * Returns: failed calls, failed reminders, delivery rates (last 24h).
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
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [
      failedCalls,
      failedReminders,
      totalCalls24h,
      totalReminders24h,
      deliveredReminders,
      recentFailures,
    ] = await Promise.all([
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
          id: true,
          channel: true,
          failedReason: true,
          sentAt: true,
          merchant: { select: { businessName: true } },
        },
      }),
    ])

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
    })
  } catch (err) {
    logger.error('Admin health error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
