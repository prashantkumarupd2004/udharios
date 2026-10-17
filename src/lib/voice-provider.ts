/**
 * Voice call provider abstraction — Vobiz (primary) + Exotel (backup).
 *
 * Har merchant ka active provider `merchants.voice_provider` me hota hai
 * (default 'exotel' — existing behavior zero change until merchant toggles).
 * Settings page se one-click switch hota hai.
 *
 * NOTE: voice_provider column ko $queryRaw/$executeRaw se access karte hain
 * taaki prisma generate ke bina bhi type-check clean rahe.
 */

import { prisma } from '@/lib/prisma'
import { placeCall as exotelPlaceCall, type PlaceCallInput } from '@/lib/exotel'
import { placeCall as vobizPlaceCall, isVobizConfigured } from '@/lib/vobiz'
import { prepareVobizCallAudio, type DtmfCallContent, type VobizCallAudioUrls } from '@/lib/voice-dtmf'
import { resolveVoiceCtx, saveVoiceCtx } from '@/lib/voice-ctx'
import { overdueDays, formatINR } from '@/lib/date-utils'
import { logger } from '@/lib/logger'

export type VoiceProviderName = 'exotel' | 'vobiz'

export interface VoiceCallResult {
  /** Provider-side call ID (Exotel SID ya Vobiz request_uuid) — calls.exotelSid me store hota hai */
  providerCallId: string
  provider: VoiceProviderName
}

/** Merchant ka active voice provider. Kuch gadbad ho to safe default 'exotel'. */
export async function getVoiceProvider(merchantId: string): Promise<VoiceProviderName> {
  try {
    const rows = await prisma.$queryRaw<{ voice_provider: string | null }[]>`
      SELECT "voice_provider" FROM "merchants" WHERE "id" = ${merchantId}::uuid LIMIT 1
    `
    return rows[0]?.voice_provider === 'vobiz' ? 'vobiz' : 'exotel'
  } catch (err) {
    logger.error('getVoiceProvider failed — defaulting to exotel', { merchantId, error: String(err) })
    return 'exotel'
  }
}

/** Active provider se call place karo. Vobiz env missing ho to fail fast (clear error). */
export async function placeVoiceCall(
  merchantId: string,
  input: PlaceCallInput
): Promise<VoiceCallResult> {
  const provider = await getVoiceProvider(merchantId)

  if (provider === 'vobiz') {
    // Vobiz: Sarvam Hindi audio PEHLE generate karo (fast <Play>, achha voice).
    // URLs query params me jayenge — answer/gather webhooks ko DB query nahi karni padegi (tez!).
    const audioUrls = await prepareVobizAudio(input).catch((err) => {
      logger.error('Vobiz audio pre-gen failed — fallback to <Speak>', { error: String(err) })
      return undefined
    })
    const res = await vobizPlaceCall({ ...input, vobizAudioUrls: audioUrls })
    logger.info('Voice call placed via Vobiz', { merchantId, callId: res.callId })
    return { providerCallId: res.callId, provider }
  }

  const res = await exotelPlaceCall(input)
  return { providerCallId: res.Call.Sid, provider }
}

/**
 * Vobiz call ke liye personalized Sarvam Hindi audio pre-generate karke
 * voice_call_sessions me save karo. Answer/gather webhooks <Play> se bajayenge.
 * Fail ho to silently skip — webhooks <Speak> fallback use karenge.
 */
async function prepareVobizAudio(input: PlaceCallInput): Promise<VobizCallAudioUrls> {
  let cf: Record<string, unknown> = {}
  try {
    cf = JSON.parse(input.customField ?? '{}') as Record<string, unknown>
  } catch { /* ignore */ }
  const callId = String(cf.callId ?? '')
  const outstandingId = String(cf.outstandingId ?? '')
  if (!callId || !outstandingId) {
    logger.warn('prepareVobizAudio: callId/outstandingId missing in customField — skipping')
    throw new Error('callId/outstandingId missing')
  }

  const outstanding = await prisma.outstanding.findUnique({
    where: { id: outstandingId },
    include: {
      merchant: { select: { businessName: true } },
      customer: { select: { name: true } },
    },
  })
  if (!outstanding) {
    logger.warn('prepareVobizAudio: outstanding not found', { outstandingId })
    throw new Error('outstanding not found')
  }

  const content: DtmfCallContent = {
    customerName: String(cf.customerName ?? outstanding.customer.name),
    merchantName: String(cf.merchantName ?? outstanding.merchant.businessName),
    amountINR: formatINR(outstanding.amount.toNumber()),
    daysOverdue: overdueDays(outstanding.dueDate),
    billRef: outstanding.invoiceNo ?? '',
  }
  const isPromiseReminder = Boolean(cf.promiseReminder)
  const urls = await prepareVobizCallAudio(callId, content, isPromiseReminder)

  // Existing ctx ke saath merge karo (overwrite nahi)
  const existing = await resolveVoiceCtx(callId).catch(() => null)
  const merged = {
    ...(existing ?? {
      callId,
      outstandingId,
      merchantId: String(cf.merchantId ?? ''),
      customerId: String(cf.customerId ?? ''),
      merchantName: content.merchantName,
      customerName: content.customerName,
      amountINR: content.amountINR,
      daysOverdue: content.daysOverdue,
      billRef: content.billRef,
    }),
    vobizAudio: urls,
  }
  await saveVoiceCtx(callId, merged)
  logger.info('Vobiz audio URLs saved to voice ctx', { callId })
  return urls
}

/** Kya diya gaya provider call karne layak configured hai? (Settings UI hint ke liye) */
export function isVoiceProviderConfigured(provider: VoiceProviderName): boolean {
  if (provider === 'vobiz') return isVobizConfigured()
  return !!(process.env.EXOTEL_SID && process.env.EXOTEL_API_KEY && process.env.EXOTEL_API_TOKEN)
}
