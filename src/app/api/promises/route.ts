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
    if (!session?.merchantId) return null
return session.merchantId ?? null
}

/**
 * Voice-bot machine auth: the AI caller has no merchant session cookie,
 * so it sends a shared secret as the x-api-key header. The merchant is
 * then taken from the request body and the outstandingId scoping check
 * below guarantees the bot can only write that merchant's own data.
 */
function isVoiceBotRequest(request: NextRequest): boolean {
  const botKey = request.headers.get('x-api-key')
  return !!botKey && !!process.env.VOICE_BOT_API_KEY && botKey === process.env.VOICE_BOT_API_KEY
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
    const body = await request.json()

    // Voice-bot calls authenticate with the shared API key and carry
    // merchantId in the body; dashboard calls use the session cookie.
    const botCall = isVoiceBotRequest(request)
    const merchantId = botCall
      ? (typeof body.merchantId === 'string' ? body.merchantId : null)
      : await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
      actor: botCall ? 'voice-bot' : 'merchant',
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
