/**
 * GET /api/merchant/voice-provider — current voice provider + config status
 * PATCH /api/merchant/voice-provider — one-click switch { provider: 'vobiz' | 'exotel' }
 *
 * voice_provider column ko raw SQL se access karte hain taaki
 * prisma generate ke bina bhi type-check clean rahe.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { isVoiceProviderConfigured, type VoiceProviderName } from '@/lib/voice-provider'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

async function getMerchantId(): Promise<string | null> {
  const session = await getSession()
  if (!session?.merchantId) return null
  return session.merchantId ?? null
}

function validProvider(p: unknown): p is VoiceProviderName {
  return p === 'vobiz' || p === 'exotel'
}

export async function GET() {
  try {
    const merchantId = await getMerchantId()
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rows = await prisma.$queryRaw<{ voice_provider: string | null }[]>`
      SELECT "voice_provider" FROM "merchants" WHERE "id" = ${merchantId}::uuid LIMIT 1
    `
    const provider: VoiceProviderName =
      rows[0]?.voice_provider === 'vobiz' ? 'vobiz' : 'exotel'

    return NextResponse.json({
      provider,
      vobizConfigured: isVoiceProviderConfigured('vobiz'),
      exotelConfigured: isVoiceProviderConfigured('exotel'),
    })
  } catch (err) {
    logger.error('GET /api/merchant/voice-provider error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const merchantId = await getMerchantId()
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const provider = body.provider
    if (!validProvider(provider)) {
      return NextResponse.json(
        { error: 'provider "vobiz" ya "exotel" hona chahiye' },
        { status: 400 }
      )
    }

    // Vobiz select kiya lekin credentials nahi hain → mana karo (fail fast)
    if (provider === 'vobiz' && !isVoiceProviderConfigured('vobiz')) {
      return NextResponse.json(
        { error: 'Vobiz credentials setup nahi hain — pehle VOBIZ_AUTH_ID, VOBIZ_AUTH_TOKEN, VOBIZ_FROM_NUMBER env vars add karo' },
        { status: 400 }
      )
    }

    await prisma.$executeRaw`
      UPDATE "merchants"
      SET "voice_provider" = ${provider}, "updated_at" = NOW()
      WHERE "id" = ${merchantId}::uuid
    `

    await appendAuditLog({
      merchantId,
      actor: 'merchant',
      action: AUDIT_ACTIONS.MERCHANT_UPDATED,
      entity: 'merchant',
      entityId: merchantId,
      payload: { voiceProvider: provider },
    }).catch(() => {})

    logger.info('Voice provider switched', { merchantId, provider })
    return NextResponse.json({ provider })
  } catch (err) {
    logger.error('PATCH /api/merchant/voice-provider error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
