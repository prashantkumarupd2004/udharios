/**
 * GET /api/promises — List promises
 * POST /api/promises — Create a promise
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createPromiseSchema } from '@/validations'
import { inngest } from '@/lib/inngest/client'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

async function getMerchantId(request: NextRequest): Promise<string | null> {
  const session = await getSession()
    if (!session?.merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const dbUser = await prisma.user.findFirst({
    where: { supabaseId: user.id },
    select: { merchantId: true },
  })
  return session.merchantId ?? null
}

export async function GET(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status') ?? 'open'

    const promises = await prisma.promise.findMany({
      where: { merchantId, status: status as 'open' | 'kept' | 'broken' },
      orderBy: { promisedDate: 'asc' },
      include: {
        outstanding: {
          select: { id: true, amount: true, invoiceNo: true, status: true },
        },
        customer: { select: { id: true, name: true, phone: true } },
      },
    })

    return NextResponse.json({ promises })
  } catch (err) {
    logger.error('GET /api/promises error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const data = createPromiseSchema.parse(body)

    const outstanding = await prisma.outstanding.findFirst({
      where: { id: data.outstandingId, merchantId },
    })

    if (!outstanding) {
      return NextResponse.json({ error: 'Outstanding not found' }, { status: 404 })
    }

    const promise = await prisma.promise.create({
      data: {
        outstandingId: data.outstandingId,
        customerId: outstanding.customerId,
        merchantId,
        promisedDate: new Date(data.promisedDate),
        source: data.source,
        notes: data.notes,
        status: 'open',
      },
    })

    // Update outstanding status to promised
    await prisma.outstanding.update({
      where: { id: data.outstandingId },
      data: { status: 'promised' },
    })

    // Schedule promise follow-up at promised date 10:00 IST
    await inngest.send({
      name: 'promises/follow-up',
      data: {
        outstandingId: data.outstandingId,
        merchantId,
        promiseId: promise.id,
      },
    })

    await appendAuditLog({
      merchantId,
      actor: 'merchant',
      action: AUDIT_ACTIONS.PROMISE_CREATED,
      entity: 'outstanding',
      entityId: data.outstandingId,
      payload: { promisedDate: data.promisedDate, source: data.source },
    })

    return NextResponse.json({ promise }, { status: 201 })
  } catch (err) {
    logger.error('POST /api/promises error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
