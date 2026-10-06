/**
 * GET /api/admin/merchants — Search/list merchants (admin only).
 * Query: ?search= (matches business name, phone, email) &limit=
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireAdmin } from '@/lib/admin'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const search = request.nextUrl.searchParams.get('search')?.trim() ?? ''
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '20'), 100)

    const where = search
      ? {
          OR: [
            { businessName: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}

    const [merchants, total] = await Promise.all([
      prisma.merchant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          businessName: true,
          phone: true,
          email: true,
          plan: true,
          isApproved: true,
          isKillSwitched: true,
          trialEndsAt: true,
          createdAt: true,
          _count: {
            select: { customers: true, reminderLogs: true, calls: true },
          },
        },
      }),
      prisma.merchant.count({ where }),
    ])

    return NextResponse.json({
      ok: true,
      total,
      merchants: merchants.map(m => ({
        id: m.id,
        businessName: m.businessName,
        phone: m.phone,
        email: m.email,
        plan: m.plan,
        isApproved: m.isApproved,
        isKillSwitched: m.isKillSwitched,
        trialEndsAt: m.trialEndsAt,
        createdAt: m.createdAt,
        customers: m._count.customers,
        reminders: m._count.reminderLogs,
        calls: m._count.calls,
      })),
    })
  } catch (err) {
    logger.error('Admin merchants list error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
