/**
 * POST /api/disputes/[id]/resolve
 * Auth: JWT session cookie (udhari_session)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveDisputeSchema } from '@/validations'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { resolution } = resolveDisputeSchema.parse(body)

    const dispute = await prisma.dispute.findFirst({
      where: { id: params.id, merchantId: session.merchantId },
    })

    if (!dispute) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })
    if (dispute.status !== 'open') {
      return NextResponse.json({ error: 'Dispute already resolved' }, { status: 400 })
    }

    await prisma.dispute.update({
      where: { id: params.id },
      data: { status: 'resolved', resolution, resolvedAt: new Date() },
    })

    await prisma.outstanding.update({
      where: { id: dispute.outstandingId },
      data: { status: 'overdue' },
    })

    await appendAuditLog({
      merchantId: session.merchantId,
      actor: 'merchant',
      action: AUDIT_ACTIONS.DISPUTE_RESOLVED,
      entity: 'dispute',
      entityId: params.id,
      payload: { resolution },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error('POST /api/disputes/[id]/resolve error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
