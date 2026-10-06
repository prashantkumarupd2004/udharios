/**
 * GET /api/admin/merchants/[id] — Full merchant detail for support (admin only).
 * Returns profile, stats, recent customers, outstandings, calls, reminders, payments.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireAdmin } from '@/lib/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params

    const merchant = await prisma.merchant.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, name: true, role: true } },
        _count: {
          select: {
            customers: true,
            outstandings: true,
            reminderLogs: true,
            calls: true,
            payments: true,
          },
        },
      },
    })
    if (!merchant) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    }

    const [
      outstandingAgg,
      recentCustomers,
      recentCalls,
      recentReminders,
      recentPayments,
      subscription,
    ] = await Promise.all([
      prisma.outstanding.aggregate({
        where: { merchantId: id, status: { not: 'paid' } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.customer.findMany({
        where: { merchantId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, phone: true, createdAt: true },
      }),
      prisma.call.findMany({
        where: { merchantId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, status: true, durationSec: true, createdAt: true },
      }),
      prisma.reminderLog.findMany({
        where: { merchantId: id },
        orderBy: { sentAt: 'desc' },
        take: 10,
        select: { id: true, channel: true, status: true, sentAt: true, failedReason: true },
      }),
      prisma.payment.findMany({
        where: { merchantId: id },
        orderBy: { paidAt: 'desc' },
        take: 10,
        select: { id: true, amount: true, method: true, paidAt: true },
      }),
      prisma.subscription.findUnique({ where: { merchantId: id } }),
    ])

    return NextResponse.json({
      ok: true,
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        phone: merchant.phone,
        email: merchant.email,
        plan: merchant.plan,
        isApproved: merchant.isApproved,
        isKillSwitched: merchant.isKillSwitched,
        trialEndsAt: merchant.trialEndsAt,
        createdAt: merchant.createdAt,
        users: merchant.users,
        counts: merchant._count,
        pendingDues: Number(outstandingAgg._sum?.amount ?? 0),
        pendingDuesCount: outstandingAgg._count,
        subscription: subscription
          ? { plan: subscription.plan, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd }
          : null,
      },
      recentCustomers,
      recentCalls,
      recentReminders,
      recentPayments: recentPayments.map(p => ({ ...p, amount: Number(p.amount) })),
    })
  } catch (err) {
    logger.error('Admin merchant detail error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
