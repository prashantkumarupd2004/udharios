/**
 * ExoML voice endpoint — the AI collection agent's live call loop.
 *
 * Exotel hits this URL when the customer answers (via the call's flow Url
 * or a Passthru applet). We reply with ExoML:
 *   1. <Play> the Sarvam-TSS greeting (hosted on Supabase Storage)
 *   2. <Record> the customer's reply -> POSTs to /api/voice/exoml/record
 *
 * The record handler transcribes with Sarvam STT, runs the voice-agent
 * turn, speaks the next line, and loops until the outcome is terminal.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  processVoiceAgentTurn,
  synthesizeAgentResponse,
  type VoiceAgentContext,
} from '@/lib/voice-agent'
import { uploadVoiceAudio } from '@/lib/voice-audio'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://udharios1.vercel.app').replace(/\/+$/, '')
const MAX_TURNS = 8

function decodeCtx(raw: string | null): VoiceAgentContext | null {
  if (!raw) return null
  try {
    const json = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json) as VoiceAgentContext
  } catch {
    return null
  }
}

function exoml(body: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${body}\n</Response>`
  return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } })
}

function recordVerb(ctxParam: string, turn: number): string {
  const action = `${APP_URL}/api/voice/exoml/record?ctx=${ctxParam}&turn=${turn}`
  return `<Record action="${action}" method="POST" maxLength="10" timeout="5" playBeep="false"/>`
}

async function speakAndRecord(
  text: string,
  callId: string,
  turn: number,
  ctxParam: string
): Promise<NextResponse> {
  const audio = await synthesizeAgentResponse(text)
  const audioUrl = await uploadVoiceAudio(
    audio,
    `call-${callId}-turn-${turn}-${Date.now()}.wav`
  )
  logger.info('ExoML speak', { callId, turn, audioUrl })
  return exoml(`  <Play>${audioUrl}</Play>\n  ${recordVerb(ctxParam, turn + 1)}`)
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

  // ctx can arrive three ways:
  // 1. ?ctx= query param (direct flowUrl use)
  // 2. ?CustomField= query param (Passthru applet forwards API CustomField)
  // 3. POST form field CustomField (Passthru applet POST)
  let ctxParam =
    url.searchParams.get('ctx') ??
    url.searchParams.get('CustomField') ??
    url.searchParams.get('customfield') ??
    ''
  if (!ctxParam && req.method === 'POST') {
    try {
      const form = await req.formData()
      ctxParam =
        (form.get('CustomField') as string) ||
        (form.get('customfield') as string) ||
        ''
    } catch {
      /* ignore body parse errors */
    }
  }
  const ctx = decodeCtx(ctxParam)

  if (!ctx) {
    logger.error('ExoML entry: bad ctx')
    return exoml(`  <Hangup/>`)
  }

  logger.info('ExoML call answered', { callId: ctx.callId, customer: ctx.customerName })

  // Fast path: greeting was pre-synthesized when the call was placed,
  // so Exotel gets ExoML back in milliseconds (no TTS wait -> no hangup).
  if (ctx.greetingUrl) {
    return exoml(`  <Play>${ctx.greetingUrl}</Play>\n  ${recordVerb(ctxParam, 1)}`)
  }

  try {
    // Turn 0: opening greeting (mentions bill + amount)
    const turnResult = await processVoiceAgentTurn(null, ctx, 0)
    return await speakAndRecord(turnResult.agentResponse, ctx.callId, 0, ctxParam)
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

export { MAX_TURNS, decodeCtx, speakAndRecord, hangupWith, APP_URL }
