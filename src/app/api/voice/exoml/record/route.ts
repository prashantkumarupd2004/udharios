/**
 * ExoML <Record> callback — one ping-pong turn of the AI conversation.
 *
 * Exotel POSTs (form-encoded) after the customer finishes speaking:
 *   RecordingUrl -> we download -> Sarvam STT -> voice-agent turn ->
 *   Sarvam TTS -> <Play> + next <Record>, or <Hangup/> when terminal.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  processVoiceAgentTurn,
  synthesizeAgentResponse,
  type VoiceAgentContext,
} from '@/lib/voice-agent'
import { transcribeAudio } from '@/lib/sarvam'
import { uploadVoiceAudio, downloadRecording } from '@/lib/voice-audio'
import { logger } from '@/lib/logger'
import { decodeCtx, speakAndRecord, hangupWith, APP_URL, MAX_TURNS } from '../route'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SILENCE_PROMPT =
  'Maaf kijiye, aapki aawaaz sunaai nahi di. Kripya apna jawab dobara boliye.'

const GRACEFUL_CLOSE =
  'Dhanyavaad! Hum aapse jald sampark karenge. Shubh din!'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const ctxParam = url.searchParams.get('ctx') ?? ''
  const turn = parseInt(url.searchParams.get('turn') ?? '1', 10)
  const ctx = decodeCtx(ctxParam)

  if (!ctx) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Hangup/>\n</Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }

  // Safety valve: never loop forever
  if (turn > MAX_TURNS) {
    logger.info('ExoML max turns reached', { callId: ctx.callId })
    return hangupWith(GRACEFUL_CLOSE, ctx.callId, turn)
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    form = new FormData()
  }
  const recordingUrl = (form.get('RecordingUrl') as string) || ''
  const callSid = (form.get('CallSid') as string) || ''

  logger.info('ExoML record callback', { callId: ctx.callId, turn, callSid, hasRecording: !!recordingUrl })

  // Customer stayed silent -> nudge once or twice, then close politely
  if (!recordingUrl) {
    if (turn <= 2) {
      try {
        return await speakAndRecord(SILENCE_PROMPT, ctx.callId, turn, ctxParam)
      } catch (err) {
        logger.error('ExoML silence prompt failed', { error: String(err) })
      }
    }
    return hangupWith(GRACEFUL_CLOSE, ctx.callId, turn)
  }

  try {
    // 1. Download + transcribe customer speech
    const audioBuffer = await downloadRecording(recordingUrl)
    const stt = await transcribeAudio(audioBuffer, 'audio/wav')
    logger.info('ExoML customer said', { callId: ctx.callId, turn, speech: stt.transcript })

    // 2. Agent brain decides the next line + outcome
    const result = await processVoiceAgentTurn(audioBuffer, ctx as VoiceAgentContext, turn)

    // 3. Terminal outcome -> speak closing line, hang up
    if (result.outcome && result.outcome !== 'ongoing') {
      logger.info('ExoML terminal outcome', {
        callId: ctx.callId,
        outcome: result.outcome,
        promisedDate: result.promisedDate,
      })
      return await hangupWith(result.agentResponse, ctx.callId, turn)
    }

    // 4. Ongoing -> speak + keep listening
    return await speakAndRecord(result.agentResponse, ctx.callId, turn, ctxParam)
  } catch (err) {
    logger.error('ExoML turn failed', { callId: ctx.callId, turn, error: String(err) })
    return hangupWith(GRACEFUL_CLOSE, ctx.callId, turn)
  }
}

// Exotel may probe with GET; keep the loop alive only on POST.
export async function GET() {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Hangup/>\n</Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

export { APP_URL }
