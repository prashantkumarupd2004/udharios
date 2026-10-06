/**
 * POST /api/admin/access-requests/[id]/reject — Reject a request (admin only).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireAdmin } from '@/lib/admin'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const req = await prisma.accessRequest.findUnique({ where: { id } })
    if (!req) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    }
    if (req.status !== 'pending') {
      return NextResponse.json({ ok: false, error: 'already_reviewed' }, { status: 409 })
    }

    await prisma.accessRequest.update({
      where: { id },
      data: { status: 'rejected', reviewedBy: admin.email ?? admin.phone ?? 'admin', reviewedAt: new Date() },
    })

    logger.info('Access request rejected', { requestId: id })
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error('Admin reject error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
