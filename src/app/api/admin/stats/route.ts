/**
 * GET /api/admin/stats — Admin dashboard statistics.
 * Requires admin session (email+password login).
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
      prisma.payment.aggregate({
        _sum: { amount: true },
      }),
      prisma.merchant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          businessName: true,
          phone: true,
          email: true,
          plan: true,
          isApproved: true,
          createdAt: true,
        },
      }),
      prisma.accessRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          name: true,
          businessName: true,
          phone: true,
          city: true,
          status: true,
          createdAt: true,
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
        _count: {
          select: { reminderLogs: true, calls: true, customers: true },
        },
      },
      orderBy: { reminderLogs: { _count: 'desc' } },
    })

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
    })
  } catch (err) {
    logger.error('Admin stats error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
