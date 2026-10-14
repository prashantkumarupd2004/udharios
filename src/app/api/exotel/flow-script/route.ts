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
 * SPEED: Audio is pre-generated at call placement time (/api/calls/trigger),
 * so this endpoint usually returns the cached URL instantly (<500ms).
 *
 * Fallback: if TTS fails, returns plain text for Exotel's built-in TTS.
 *
 * Docs: https://support.exotel.com/support/solutions/articles/48285-greeting-using-dynamic-text-or-audio-from-url
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
  buildGreetingScript,
  greetingFilename,
  greetingAudioUrl,
  greetingAudioExists,
  ensureGreetingAudio,
} from '@/lib/tts-greeting'

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
 * GET handler — returns audio URL (premium) or plain text (fallback)
 *
 * Fast path: if audio was pre-generated at call placement, the cache check
 * hits and we return the URL in <500ms (no Exotel timeout).
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

  const script = buildGreetingScript({
    customerName: data.customerName,
    merchantName: data.merchantName,
    amountINR: data.amountINR,
  })

  // Premium: return cached/pre-generated audio URL (fast!)
  if (!forceText) {
    const filename = greetingFilename(script)
    const url = greetingAudioUrl(filename)

    // Fast cache check first — pre-generated audio returns in <500ms
    if (await greetingAudioExists(filename)) {
      logger.info('flow-script cache HIT, returning audio URL instantly', { url })
      return new Response(url, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }

    // Cache miss — generate now (slower, but only happens once per script)
    logger.info('flow-script cache MISS, generating audio now')
    const audioUrl = await ensureGreetingAudio({
      customerName: data.customerName,
      merchantName: data.merchantName,
      amountINR: data.amountINR,
    })
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
