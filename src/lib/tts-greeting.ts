/**
 * Shared TTS greeting audio generation for Exotel flows.
 *
 * Used by:
 * - /api/exotel/flow-script (on-demand, with cache check)
 * - /api/calls/trigger (pre-generation at call placement)
 *
 * The filename is deterministic (MD5 of script) so pre-generated audio
 * is instantly found by flow-script when Exotel asks for it.
 */

import { createHash } from 'crypto'
import { logger } from '@/lib/logger'
import { synthesizeSpeech } from '@/lib/sarvam'
import { uploadVoiceAudio } from '@/lib/voice-audio'

export interface GreetingData {
  customerName?: string
  merchantName?: string
  amountINR?: string
}

/**
 * Format amount for TTS — "4500" -> "4,500 rupees"
 */
export function formatAmountForTTS(amountStr: string): string {
  const num = parseFloat(amountStr.replace(/[^0-9.]/g, ''))
  if (isNaN(num)) return `${amountStr} rupees`
  const formatted = num.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  return `${formatted} rupees`
}

/**
 * Build the greeting script from call data.
 * MUST match the script built in flow-script/route.ts.
 */
export function buildGreetingScript(data: GreetingData): string {
  const customerName = data.customerName || 'ji'
  const merchantName = data.merchantName || 'Ugaahi'
  const amount = data.amountINR ? formatAmountForTTS(data.amountINR) : null

  const firstName = customerName.split(' ')[0]

  let script = `Namaste ${firstName} ji! Main ${merchantName} ki taraf se bol rahi hun. `

  if (amount) {
    script += `Aapka ${amount} ka bhugtan baaki hai. `
  } else {
    script += `Aapka kuch bhugtan baaki hai. `
  }

  script += `Kripya jald se jald settle karein. Dhanyavaad!`

  return script
}

/**
 * Deterministic filename for a greeting script (cache key).
 */
export function greetingFilename(script: string): string {
  const hash = createHash('md5').update(script).digest('hex').slice(0, 12)
  return `tts-greeting-${hash}.wav`
}

/**
 * Public URL for a greeting audio file (without generating).
 */
export function greetingAudioUrl(filename: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://udharios.vercel.app').replace(/\/+$/, '')
  return `${base}/api/voice/audio/${filename}`
}

/**
 * Check if greeting audio already exists (fast, no generation).
 */
export async function greetingAudioExists(filename: string): Promise<boolean> {
  try {
    const res = await fetch(greetingAudioUrl(filename), {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Generate premium TTS audio and upload. Returns public URL or null on failure.
 * Skips generation if the file already exists (cache hit).
 */
export async function ensureGreetingAudio(data: GreetingData): Promise<string | null> {
  try {
    const script = buildGreetingScript(data)
    const filename = greetingFilename(script)
    const url = greetingAudioUrl(filename)

    // Cache check — if already generated, return immediately
    if (await greetingAudioExists(filename)) {
      logger.info('Greeting audio cache HIT', { filename })
      return url
    }

    logger.info('Greeting audio cache MISS, generating', { filename })

    // Sarvam Bulbul v3, Hindi female voice 'priya', 8kHz for telephony
    const { audioBase64 } = await synthesizeSpeech(script, 'priya', 'hi-IN', 1.0)
    const audioBuffer = Buffer.from(audioBase64, 'base64')

    await uploadVoiceAudio(audioBuffer, filename, 'audio/wav')

    logger.info('Greeting audio generated', { url })
    return url
  } catch (err) {
    logger.error('Greeting audio generation failed', { error: String(err) })
    return null
  }
}

/**
 * Fire-and-forget pre-generation. Call this right after placing an Exotel call
 * so the audio is ready when Exotel's flow hits /api/exotel/flow-script.
 */
export function pregenerateGreetingAudio(data: GreetingData): void {
  // Don't await — let it run in background while Exotel sets up the call
  ensureGreetingAudio(data).catch((err) =>
    logger.error('Background greeting pre-generation failed', { error: String(err) })
  )
}
