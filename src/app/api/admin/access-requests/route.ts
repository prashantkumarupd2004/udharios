/**
 * GET /api/admin/access-requests — List access requests (admin only).
 * Query: ?status=pending|approved|rejected|all (default: pending)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireAdmin } from '@/lib/admin'

const VALID = ['pending', 'approved', 'rejected', 'all'] as const

export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const status = request.nextUrl.searchParams.get('status') ?? 'pending'
    if (!(VALID as readonly string[]).includes(status)) {
      return NextResponse.json({ ok: false, error: 'invalid_status' }, { status: 400 })
    }

    const requests = await prisma.accessRequest.findMany({
      where: status === 'all' ? {} : { status: status as 'pending' | 'approved' | 'rejected' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    const counts = await prisma.accessRequest.groupBy({
      by: ['status'],
      _count: { status: true },
    })

    return NextResponse.json({
      ok: true,
      requests,
      counts: Object.fromEntries(counts.map(c => [c.status, c._count.status])),
    })
  } catch (err) {
    logger.error('Admin list access requests error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
