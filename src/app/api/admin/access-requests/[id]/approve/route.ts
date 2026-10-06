/**
 * POST /api/admin/access-requests/[id]/approve — Approve a request (admin only).
 *
 * Marks the request approved and provisions the merchant (approved + trial),
 * so the client can log in via OTP immediately.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireAdmin } from '@/lib/admin'
import { provisionMerchant } from '@/lib/merchant'
import { appendAuditLog } from '@/lib/audit'

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

    const merchant = await provisionMerchant({
      phone: req.phone,
      businessName: req.businessName,
      ownerName: req.name,
      email: req.email ?? undefined,
    })

    await prisma.accessRequest.update({
      where: { id },
      data: { status: 'approved', reviewedBy: admin.phone, reviewedAt: new Date() },
    })

    logger.info('Access request approved', { requestId: id, merchantId: merchant.id })

    await appendAuditLog({
      merchantId: merchant.id,
      actor: admin.email ?? admin.phone ?? 'admin',
      action: 'admin.access_request.approved',
      entity: 'access_request',
      entityId: id,
      payload: { businessName: req.businessName, phone: req.phone },
    })

    return NextResponse.json({ ok: true, merchantId: merchant.id })
  } catch (err) {
    logger.error('Admin approve error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
