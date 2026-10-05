/**
 * POST /api/auth/otp/send — Send OTP via MSG91 standard API
 * Body: { phone }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendOtpSchema } from '@/validations'
import { logger } from '@/lib/logger'
import { normalizePhone, msg91SendOtp } from '@/lib/msg91'
import { checkAndRecordSend } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = sendOtpSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })

    const mobile91 = normalizePhone(parsed.data.phone)
    if (!mobile91) return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })

    const rateCheck = checkAndRecordSend(mobile91)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { ok: false, error: rateCheck.reason, ...(rateCheck.reason === 'cooldown' ? { retryAfterSec: rateCheck.retryAfterSec } : {}) },
        { status: 429 }
      )
    }

    const result = await msg91SendOtp(mobile91)
    if (!result.ok) return NextResponse.json({ ok: false, error: 'send_failed' }, { status: 502 })

    logger.info('OTP sent', { phone: `91*****${mobile91.slice(-4)}` })
    return NextResponse.json({ ok: true, expiresIn: 300 })
  } catch (err) {
    logger.error('OTP send error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
