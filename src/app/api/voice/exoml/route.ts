/**
 * ExoML voice endpoint — the AI collection agent's live call loop.
 *
 * Exotel's "Udhari AI Voice" app has a Passthru applet pointing here.
 * When the customer answers an outbound call, the flow hits this URL
 * (GET) with the API CustomField (= our callId). We resolve the full
 * VoiceAgentContext from voice_call_sessions and reply with ExoML:
 *   1. <Play> the pre-synthesized Sarvam greeting (Supabase Storage URL)
 *   2. <Record> the customer's reply -> POSTs to /api/voice/exoml/record
 *
 * The record handler transcribes with Sarvam STT, runs the voice-agent
 * turn, speaks the next line, and loops until the outcome is terminal.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  processVoiceAgentTurn,
  synthesizeAgentResponse,
} from '@/lib/voice-agent'
import { uploadVoiceAudio } from '@/lib/voice-audio'
import { resolveVoiceCtx } from '@/lib/voice-ctx'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://udharios.vercel.app').replace(/\/+$/, '')
const MAX_TURNS = 8

function exoml(body: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${body}\n</Response>`
  return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } })
}

function recordVerb(callId: string, turn: number): string {
  const action = `${APP_URL}/api/voice/exoml/record?ctx=${encodeURIComponent(callId)}&turn=${turn}`
  return `<Record action="${action}" method="POST" maxLength="10" timeout="5" playBeep="false"/>`
}

async function speakAndRecord(
  text: string,
  callId: string,
  turn: number
): Promise<NextResponse> {
  const audio = await synthesizeAgentResponse(text)
  const audioUrl = await uploadVoiceAudio(
    audio,
    `call-${callId}-turn-${turn}-${Date.now()}.wav`
  )
  logger.info('ExoML speak', { callId, turn, audioUrl })
  return exoml(`  <Play>${audioUrl}</Play>\n  ${recordVerb(callId, turn + 1)}`)
}

async function hangupWith(text: string | null, callId: string, turn: number): Promise<NextResponse> {
  if (!text) return exoml(`  <Hangup/>`)
  const audio = await synthesizeAgentResponse(text)
  const audioUrl = await uploadVoiceAudio(
    audio,
    `call-${callId}-bye-${turn}-${Date.now()}.wav`
  )
  return exoml(`  <Play>${audioUrl}</Play>\n  <Hangup/>`)
}

async function handleEntry(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)

  // ctx reference arrives as CustomField (forwarded by the Passthru applet),
  // either as query param (GET) or form field (POST).
  let ref =
    url.searchParams.get('ctx') ??
    url.searchParams.get('CustomField') ??
    url.searchParams.get('customfield') ??
    ''
  if (!ref && req.method === 'POST') {
    try {
      const form = await req.formData()
      ref =
        (form.get('CustomField') as string) ||
        (form.get('customfield') as string) ||
        ''
    } catch {
      /* ignore */
    }
  }

  const ctx = await resolveVoiceCtx(ref)
  if (!ctx) {
    logger.error('ExoML entry: could not resolve ctx', { ref: ref?.slice(0, 40) })
    return exoml(`  <Hangup/>`)
  }

  logger.info('ExoML call answered', { callId: ctx.callId, customer: ctx.customerName })

  // Fast path: greeting was pre-synthesized when the call was placed.
  if (ctx.greetingUrl) {
    return exoml(`  <Play>${ctx.greetingUrl}</Play>\n  ${recordVerb(ctx.callId, 1)}`)
  }

  try {
    // Fallback: synthesize inline (slower; Exotel may hang up if too slow)
    const turnResult = await processVoiceAgentTurn(null, ctx, 0)
    return await speakAndRecord(turnResult.agentResponse, ctx.callId, 0)
  } catch (err) {
    logger.error('ExoML entry failed', { callId: ctx.callId, error: String(err) })
    return exoml(`  <Hangup/>`)
  }
}

export async function GET(req: NextRequest) {
  return handleEntry(req)
}

export async function POST(req: NextRequest) {
  return handleEntry(req)
}

export { MAX_TURNS, APP_URL, hangupWith }
