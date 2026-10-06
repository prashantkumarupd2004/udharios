/**
 * ExoML <Record> callback — one ping-pong turn of the AI conversation.
 *
 * Exotel POSTs (form-encoded) after the customer finishes speaking:
 *   RecordingUrl -> we download -> Sarvam STT -> voice-agent turn ->
 *   Sarvam TTS -> <Play> + next <Record>, or <Hangup/> when terminal.
 *
 * The ctx reference (?ctx=callId) is resolved via resolveVoiceCtx.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  processVoiceAgentTurn,
  type VoiceAgentContext,
} from '@/lib/voice-agent'
import { transcribeAudio } from '@/lib/sarvam'
import { uploadVoiceAudio, downloadRecording } from '@/lib/voice-audio'
import { synthesizeAgentResponse } from '@/lib/voice-agent'
import { resolveVoiceCtx } from '@/lib/voice-ctx'
import { traceVoiceCall } from '@/lib/voice-trace'
import { logger } from '@/lib/logger'
import { hangupWith, APP_URL, MAX_TURNS } from '../route'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SILENCE_PROMPT =
  'Maaf kijiye, aapki aawaaz sunaai nahi di. Kripya apna jawab dobara boliye.'

const GRACEFUL_CLOSE =
  'Dhanyavaad! Hum aapse jald sampark karenge. Shubh din!'

function exoml(body: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${body}\n</Response>`
  return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } })
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
  const action = `${APP_URL}/api/voice/exoml/record?ctx=${encodeURIComponent(callId)}&amp;turn=${turn + 1}`
  return exoml(
    `  <Play>${audioUrl}</Play>\n  <Record action="${action}" method="POST" maxLength="10" timeout="5" playBeep="false"/>`
  )
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const ref = url.searchParams.get('ctx') ?? ''
  const turn = parseInt(url.searchParams.get('turn') ?? '1', 10)
  const ctx = await resolveVoiceCtx(ref)

  if (!ctx) {
    logger.error('ExoML record: could not resolve ctx', { ref: ref?.slice(0, 40) })
    return exoml(`  <Hangup/>`)
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

  await traceVoiceCall(ctx.callId, 'record_hit', {
    turn,
    callSid,
    hasRecordingUrl: !!recordingUrl,
    recordingUrlPrefix: recordingUrl.slice(0, 80),
  })

  logger.info('ExoML record callback', { callId: ctx.callId, turn, callSid, hasRecording: !!recordingUrl })

  // Customer stayed silent -> nudge once or twice, then close politely
  if (!recordingUrl) {
    if (turn <= 2) {
      try {
        return await speakAndRecord(SILENCE_PROMPT, ctx.callId, turn)
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
    await traceVoiceCall(ctx.callId, 'record_turn_done', {
      turn,
      customerSpeech: result.customerSpeech?.slice(0, 120),
      agentResponse: result.agentResponse?.slice(0, 120),
      outcome: result.outcome,
    })

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
    return await speakAndRecord(result.agentResponse, ctx.callId, turn)
  } catch (err) {
    logger.error('ExoML turn failed', { callId: ctx.callId, turn, error: String(err) })
    return hangupWith(GRACEFUL_CLOSE, ctx.callId, turn)
  }
}

// Exotel may probe with GET; keep the loop alive only on POST.
export async function GET() {
  return exoml(`  <Hangup/>`)
}

export { APP_URL }
