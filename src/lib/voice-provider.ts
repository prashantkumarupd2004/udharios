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
    const res = await vobizPlaceCall(input) // env missing → clear error throw karta hai
    logger.info('Voice call placed via Vobiz', { merchantId, callId: res.callId })
    return { providerCallId: res.callId, provider }
  }

  const res = await exotelPlaceCall(input)
  return { providerCallId: res.Call.Sid, provider }
}

/** Kya diya gaya provider call karne layak configured hai? (Settings UI hint ke liye) */
export function isVoiceProviderConfigured(provider: VoiceProviderName): boolean {
  if (provider === 'vobiz') return isVobizConfigured()
  return !!(process.env.EXOTEL_SID && process.env.EXOTEL_API_KEY && process.env.EXOTEL_API_TOKEN)
}
