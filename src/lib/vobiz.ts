/**
 * Vobiz integration for Udhari OS — alternative voice call provider (Exotel backup).
 *
 * Outbound: POST https://api.vobiz.ai/api/v1/Account/{auth_id}/Call/
 * Answer flow: Vobiz POSTs to answer_url (From, To, CallUUID) -> we return Voice XML.
 * Webhooks: X-Vobiz-Signature-V3 header (HMAC — see verifyVobizWebhook note).
 *
 * Env: VOBIZ_AUTH_ID, VOBIZ_AUTH_TOKEN, VOBIZ_FROM_NUMBER
 */

import { logger } from '@/lib/logger'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PlaceCallInput } from '@/lib/exotel'
import type { VobizCallAudioUrls } from '@/lib/voice-dtmf'

/** Vobiz placeCall input — exotel shape + pre-generated audio URLs (query params me jayenge). */
export interface VobizPlaceCallInput extends PlaceCallInput {
  vobizAudioUrls?: VobizCallAudioUrls
}

const VOBIZ_AUTH_ID = process.env.VOBIZ_AUTH_ID ?? ''
const VOBIZ_AUTH_TOKEN = process.env.VOBIZ_AUTH_TOKEN ?? ''
const VOBIZ_FROM_NUMBER = process.env.VOBIZ_FROM_NUMBER ?? ''
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://udharios.vercel.app').replace(/\/+$/, '')

export interface VobizCallResponse {
  /** Vobiz request_uuid — CallUUID ke naam se har webhook me aata hai */
  callId: string
  raw: Record<string, unknown>
}

/** True jab Vobiz credentials set hain (VOBIZ_AUTH_ID + TOKEN + FROM_NUMBER). */
export function isVobizConfigured(): boolean {
  return !!(process.env.VOBIZ_AUTH_ID && process.env.VOBIZ_AUTH_TOKEN && process.env.VOBIZ_FROM_NUMBER)
}

/**
 * Place an outbound call via Vobiz.
 * callId: input.customField me JSON ({ callId }) ya plain callId string se nikalta hai —
 * dono callers (Inngest voiceCall + manual trigger) customField me callId bhejte hain.
 * Usi se answer_url / hangup_url banta hai.
 */
export async function placeCall(input: VobizPlaceCallInput): Promise<VobizCallResponse> {
  if (!isVobizConfigured()) {
    const err = 'Vobiz credentials configured nahi hain — VOBIZ_AUTH_ID, VOBIZ_AUTH_TOKEN, VOBIZ_FROM_NUMBER env vars set karo'
    logger.error('Vobiz placeCall aborted: credentials missing')
    throw new Error(err)
  }

  const to = normalizePhoneForVobiz(input.to)

  // callRecordId nikalo (answer_url me embed karne ke liye)
  let callRecordId = ''
  const cf = (input.customField ?? '').trim()
  if (cf) {
    if (cf.startsWith('{')) {
      try {
        callRecordId = JSON.parse(cf).callId ?? ''
      } catch {
        /* ignore */
      }
    } else {
      callRecordId = cf
    }
  }
  const q = callRecordId ? `?callId=${encodeURIComponent(callRecordId)}` : ''
  // Pre-generated audio URLs seedha query params me — answer/gather webhooks ko
  // DB query nahi karni padegi (tez response, kam delay).
  const audioQ = input.vobizAudioUrls
    ? `&ag=${encodeURIComponent(input.vobizAudioUrls.greeting)}` +
      `&a1=${encodeURIComponent(input.vobizAudioUrls.opt1)}` +
      `&a2=${encodeURIComponent(input.vobizAudioUrls.opt2)}` +
      `&a3=${encodeURIComponent(input.vobizAudioUrls.opt3)}`
    : ''
  const answerUrl = `${APP_URL}/api/voice/vobiz/answer${q}${audioQ}`
  // callbackUrl (status webhook) caller de to wahi, warna hamara vobiz webhook
  const hangupUrl = input.callbackUrl || `${APP_URL}/api/webhooks/vobiz${q}`

  const url = `https://api.vobiz.ai/api/v1/Account/${VOBIZ_AUTH_ID}/Call/`
  const body = {
    from: VOBIZ_FROM_NUMBER,
    to,
    answer_url: answerUrl,
    answer_method: 'POST',
    hangup_url: hangupUrl,
    hangup_method: 'POST',
    // NOTE: machine_detection hataya — AMD se ~10 sec delay ho raha tha
    // (pehle human/machine detect, phir answer_url). Ab turant bolega.
    time_limit: input.timeLimit ?? 300,
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Auth-ID': VOBIZ_AUTH_ID,
      'X-Auth-Token': VOBIZ_AUTH_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('Vobiz call placement failed', { status: response.status, error, to })
    throw new Error(`Vobiz API error ${response.status}: ${error}`)
  }

  const data = (await response.json()) as Record<string, unknown>
  const callId =
    (data.request_uuid as string) ??
    (data.call_uuid as string) ??
    (data.uuid as string) ??
    ''
  if (!callId) {
    logger.error('Vobiz response missing request_uuid', { data })
    throw new Error('Vobiz API response me request_uuid nahi mila')
  }

  logger.info('Vobiz call placed', { callId, to, answerUrl })
  return { callId, raw: data }
}

/**
 * Normalize phone to E.164 (+91XXXXXXXXXX) for Vobiz.
 */
export function normalizePhoneForVobiz(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return '+91' + digits
  if (digits.startsWith('91') && digits.length === 12) return '+' + digits
  if (digits.startsWith('0') && digits.length === 11) return '+91' + digits.slice(1)
  return phone.startsWith('+') ? phone : '+' + digits
}

/**
 * Verify a Vobiz webhook signature.
 *
 * Header: X-Vobiz-Signature-V3.
 * ASSUMPTION (Vobiz ka exact signing scheme publicly documented nahi mila):
 * Hum multiple common schemes try karte hain — jo match kare wo accept.
 * Har attempt log hota hai taaki actual scheme diagnose ho sake.
 *
 * Returns: { ok, scheme } — scheme batata hai kaunsa match hua (ya 'none').
 */
export function verifyVobizWebhook(signature: string | null, rawBody: string): { ok: boolean; scheme: string } {
  const secret = process.env.VOBIZ_AUTH_TOKEN
  const sig = (signature ?? '').trim()
  if (!secret || !sig) {
    logger.warn('Vobiz webhook: signature header missing', { hasSecret: !!secret, bodyLen: rawBody.length })
    return { ok: false, scheme: 'missing' }
  }

  const schemes: Array<{ name: string; expected: string }> = [
    { name: 'hmac-sha256-hex', expected: createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex') },
    { name: 'hmac-sha256-b64', expected: createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64') },
    { name: 'hmac-sha1-hex', expected: createHmac('sha1', secret).update(rawBody, 'utf8').digest('hex') },
  ]
  for (const s of schemes) {
    try {
      const a = Buffer.from(s.expected, 'utf8')
      const b = Buffer.from(sig, 'utf8')
      if (a.length === b.length && timingSafeEqual(a, b)) {
        return { ok: true, scheme: s.name }
      }
    } catch { /* continue */ }
  }
  logger.warn('Vobiz webhook: signature mismatch (all schemes)', {
    receivedPrefix: sig.slice(0, 12),
    bodyLen: rawBody.length,
    bodyPrefix: rawBody.slice(0, 80),
  })
  return { ok: false, scheme: 'none' }
}

/** Legacy boolean wrapper — strict check. */
export function isVobizWebhookValid(signature: string | null, rawBody: string): boolean {
  return verifyVobizWebhook(signature, rawBody).ok
}
