/**
 * GET /api/admin/audit — Recent audit log entries (admin only).
 * Query: ?limit= (max 100), ?action= (filter by action prefix)
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
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '50'), 100)
    const actionFilter = request.nextUrl.searchParams.get('action')?.trim()

    const logs = await prisma.auditLog.findMany({
      where: actionFilter ? { action: { startsWith: actionFilter } } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        actor: true,
        action: true,
        entity: true,
        entityId: true,
        payload: true,
        createdAt: true,
        merchant: { select: { businessName: true, phone: true } },
      },
    })

    return NextResponse.json({
      ok: true,
      logs: logs.map(l => ({
        id: l.id,
        actor: l.actor,
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        payload: l.payload,
        createdAt: l.createdAt,
        merchantName: l.merchant.businessName,
        merchantPhone: l.merchant.phone,
      })),
    })
  } catch (err) {
    logger.error('Admin audit error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
