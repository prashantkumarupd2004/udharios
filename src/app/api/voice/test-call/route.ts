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
import {
  processVoiceAgentTurn,
  synthesizeAgentResponse,
  type VoiceAgentContext,
} from '@/lib/voice-agent'
import { saveVoiceCtx } from '@/lib/voice-ctx'
import { uploadVoiceAudio } from '@/lib/voice-audio'
import { prepareDtmfCallAudio } from '@/lib/voice-dtmf'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://udharios1.vercel.app').replace(/\/+$/, '')

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

  // NOTE: no flowUrl override — Url must be the Exotel app/flow URL
  // (my.exotel.com/.../start_voice/{APP_ID}). The app's Passthru applet
  // calls our /api/voice/exoml, and Exotel forwards CustomField to it,
  // so the call context travels in CustomField.
  const callbackUrl = `${APP_URL}/api/webhooks/exotel?callId=${callId}`

  try {
    // Pre-synthesize the greeting BEFORE placing the call, so the ExoML
    // entry can answer instantly (Exotel hangs up if the first response
    // takes too long).
    const turn0 = await processVoiceAgentTurn(null, ctx, 0)
    const greetingAudio = await synthesizeAgentResponse(turn0.agentResponse)
    ctx.greetingUrl = await uploadVoiceAudio(
      greetingAudio,
      `call-${callId}-greeting-${Date.now()}.wav`
    )
    logger.info('Test call greeting ready', { callId, greetingUrl: ctx.greetingUrl })

    // Also prepare the DTMF flow-builder audio set (personalized Hindi
    // greeting + 3 option responses) at static URLs, so the Exotel flow
    // (Greeting applet -> Gather) can play them without ExoML.
    const dtmfUrls = await prepareDtmfCallAudio({
      customerName: ctx.customerName,
      merchantName: ctx.merchantName,
      amountINR: ctx.amountINR,
      daysOverdue: ctx.daysOverdue,
      billRef: ctx.billRef ?? 'INV-1023',
    })
    logger.info('Test call DTMF audio ready', { callId, dtmfUrls })

    // Exotel truncates CustomField (~400 chars), so the full ctx is stored
    // in voice_call_sessions and only the short callId travels via CustomField.
    await saveVoiceCtx(callId, ctx)

    const result = await placeCall({
      to,
      callbackUrl,
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
      dtmfUrls,
    })
  } catch (err) {
    logger.error('Test AI call failed', { error: String(err) })
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 })
  }
}
