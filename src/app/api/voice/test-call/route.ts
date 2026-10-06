/**
 * POST /api/voice/test-call — trigger a live AI test call.
 *
 * Body: { to, customerName?, amountINR?, daysOverdue?, billRef?, merchantName? }
 * Guarded by x-test-key header === SESSION_SECRET (never expose publicly).
 *
 * Places an Exotel call whose answered-flow is our ExoML endpoint,
 * so the caller hears the Hindi AI agent mention the bill details.
 */
import { NextRequest, NextResponse } from 'next/server'
import { placeCall } from '@/lib/exotel'
import type { VoiceAgentContext } from '@/lib/voice-agent'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://udharios1.vercel.app').replace(/\/+$/, '')

function encodeCtx(ctx: VoiceAgentContext): string {
  return Buffer.from(JSON.stringify(ctx), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function POST(req: NextRequest) {
  const testKey = req.headers.get('x-test-key') ?? ''
  if (!process.env.SESSION_SECRET || testKey !== process.env.SESSION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const to = String(body.to ?? '').trim()
  if (!to) {
    return NextResponse.json({ error: 'Missing "to" phone number' }, { status: 400 })
  }

  const callId = `test-${Date.now()}`
  const ctx: VoiceAgentContext = {
    callId,
    outstandingId: 'test-outstanding',
    merchantId: 'test-merchant',
    customerId: 'test-customer',
    merchantName: String(body.merchantName ?? 'Sharma General Store'),
    customerName: String(body.customerName ?? 'Prashant ji'),
    amountINR: String(body.amountINR ?? '5,400'),
    daysOverdue: Number(body.daysOverdue ?? 12),
    billRef: String(body.billRef ?? 'INV-1023'),
  }

  const flowUrl = `${APP_URL}/api/voice/exoml?ctx=${encodeCtx(ctx)}`
  const callbackUrl = `${APP_URL}/api/webhooks/exotel?callId=${callId}`

  try {
    const result = await placeCall({
      to,
      callbackUrl,
      flowUrl,
      timeLimit: 300,
      timeOut: 60,
      record: true,
      customField: callId,
    })
    logger.info('Test AI call placed', { callId, sid: result.Call.Sid, to })
    return NextResponse.json({
      ok: true,
      callId,
      exotelSid: result.Call.Sid,
      status: result.Call.Status,
    })
  } catch (err) {
    logger.error('Test AI call failed', { error: String(err) })
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 })
  }
}
