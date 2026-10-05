/**
 * POST /api/auth/otp/retry-voice — Retry OTP via voice call
 * Body: { phone }
 */
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { normalizePhone, msg91RetryVoice } from '@/lib/msg91'
import { z } from 'zod'

const schema = z.object({
  phone: z.string().regex(/^(\+91|91)?[6-9]\d{9}$/),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 })

    const mobile91 = normalizePhone(parsed.data.phone)
    if (!mobile91) return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })

    const result = await msg91RetryVoice(mobile91)
    if (!result.ok) return NextResponse.json({ ok: false, error: 'send_failed' }, { status: 502 })

    logger.info('Voice OTP retry sent')
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error('Voice retry error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
