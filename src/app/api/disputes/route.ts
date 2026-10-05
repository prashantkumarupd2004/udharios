/**
 * GET /api/disputes — List disputes
 * POST /api/disputes — Create a dispute
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createDisputeSchema } from '@/validations'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

async function getMerchantId(request: NextRequest): Promise<string | null> {
  const session = await getSession()
    if (!session?.merchantId) return null
return session.merchantId ?? null
}

export async function GET(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status') ?? 'open'

    const disputes = await prisma.dispute.findMany({
      where: { merchantId, status: status as 'open' | 'resolved' | 'withdrawn' },
      orderBy: { createdAt: 'desc' },
      include: {
        outstanding: {
          select: { id: true, amount: true, invoiceNo: true, status: true },
        },
        customer: { select: { id: true, name: true, phone: true } },
      },
    })

    return NextResponse.json({ disputes })
  } catch (err) {
    logger.error('GET /api/disputes error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const data = createDisputeSchema.parse(body)

    const outstanding = await prisma.outstanding.findFirst({
      where: { id: data.outstandingId, merchantId },
    })

    if (!outstanding) {
      return NextResponse.json({ error: 'Outstanding not found' }, { status: 404 })
    }

    const dispute = await prisma.dispute.create({
      data: {
        outstandingId: data.outstandingId,
        customerId: outstanding.customerId,
        merchantId,
        reason: data.reason,
        status: 'open',
      },
    })

    // Mark outstanding as disputed — stop automatic reminders
    await prisma.outstanding.update({
      where: { id: data.outstandingId },
      data: { status: 'disputed' },
    })

    await appendAuditLog({
      merchantId,
      actor: 'merchant',
      action: AUDIT_ACTIONS.DISPUTE_OPENED,
      entity: 'outstanding',
      entityId: data.outstandingId,
      payload: { reason: data.reason },
    })

    return NextResponse.json({ dispute }, { status: 201 })
  } catch (err) {
    logger.error('POST /api/disputes error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
