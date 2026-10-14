/**
 * Exotel Dynamic TTS Script Endpoint — PREMIUM VOICE
 *
 * Exotel's Greeting applet calls this URL (configured as "Read text like a robot" URL)
 * Exotel sends: CallSid, From, To, DialWhomNumber, CustomField (our JSON)
 *
 * PREMIUM MODE: We synthesize the script with Sarvam AI (Bulbul v3, Hindi,
 * natural 'priya' voice, 8kHz telephony) and return the audio file URL.
 * Exotel fetches the audio and plays it — MUCH better than built-in TTS.
 *
 * Fallback: if TTS fails, returns plain text for Exotel's built-in TTS.
 *
 * Docs: https://support.exotel.com/support/solutions/articles/48285-greeting-using-dynamic-text-or-audio-from-url
 */

import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { synthesizeSpeech } from '@/lib/sarvam'
import { uploadVoiceAudio } from '@/lib/voice-audio'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface CustomFieldData {
  callId?: string
  outstandingId?: string
  merchantId?: string
  customerId?: string
  merchantName?: string
  customerName?: string
  amountINR?: string
  retryCount?: number
  autoCall?: boolean
}

/**
 * Format amount for TTS — "4500" -> "4,500 rupees"
 */
function formatAmountForTTS(amountStr: string): string {
  const num = parseFloat(amountStr.replace(/[^0-9.]/g, ''))
  if (isNaN(num)) return `${amountStr} rupees`
  const formatted = num.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  return `${formatted} rupees`
}

/**
 * Build the TTS script from call data
 */
function buildScript(data: CustomFieldData): string {
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
 * Parse CustomField JSON safely
 */
function parseCustomField(raw: string | null): CustomFieldData {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as CustomFieldData
  } catch {
    return {}
  }
}

/**
 * Look up call data from DB by our internal call UUID
 */
async function lookupByCallId(callId: string): Promise<CustomFieldData | null> {
  try {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        merchant: { select: { businessName: true } },
        customer: { select: { name: true } },
        outstanding: { select: { amount: true } },
      },
    })
    if (!call) return null
    return {
      callId: call.id,
      merchantName: call.merchant?.businessName,
      customerName: call.customer?.name,
      amountINR: call.outstanding?.amount?.toString(),
    }
  } catch (err) {
    logger.error('flow-script DB lookup failed', { callId, err })
    return null
  }
}

/**
 * Generate premium TTS audio via Sarvam, upload, return public URL.
 * Uses deterministic filename (hash of script) for caching.
 */
async function generatePremiumAudio(script: string): Promise<string | null> {
  try {
    const hash = createHash('md5').update(script).digest('hex').slice(0, 12)
    const filename = `tts-greeting-${hash}.wav`

    logger.info('Generating premium TTS audio', { hash, scriptLen: script.length })

    // Sarvam Bulbul v3, Hindi female voice 'priya', 8kHz for telephony
    const { audioBase64 } = await synthesizeSpeech(script, 'priya', 'hi-IN', 1.0)
    const audioBuffer = Buffer.from(audioBase64, 'base64')

    const publicUrl = await uploadVoiceAudio(audioBuffer, filename, 'audio/wav')

    logger.info('Premium TTS audio ready', { publicUrl })
    return publicUrl
  } catch (err) {
    logger.error('Premium TTS generation failed, falling back to text', { error: String(err) })
    return null
  }
}

/**
 * GET handler — returns audio URL (premium) or plain text (fallback)
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const customFieldRaw = params.get('CustomField')
  const callSid = params.get('CallSid')
  const forceText = params.get('mode') === 'text' // ?mode=text to skip premium

  logger.info('flow-script hit', { callSid, hasCustomField: !!customFieldRaw, forceText })

  let data = parseCustomField(customFieldRaw)

  if (!data.customerName && data.callId) {
    const dbData = await lookupByCallId(data.callId)
    if (dbData) data = { ...data, ...dbData }
  }

  const script = buildScript(data)

  // Premium: generate high-quality audio
  if (!forceText) {
    const audioUrl = await generatePremiumAudio(script)
    if (audioUrl) {
      logger.info('flow-script returning audio URL', { audioUrl })
      return new Response(audioUrl, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }
  }

  // Fallback: plain text for Exotel built-in TTS
  logger.info('flow-script returning plain text fallback', { script: script.slice(0, 80) })
  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}

/**
 * HEAD handler — Exotel requires HEAD support
 */
export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}
