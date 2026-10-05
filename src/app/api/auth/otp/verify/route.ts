/**
 * POST /api/auth/otp/verify — Verify OTP via MSG91 v5 API (server-side flow)
 *
 * Body: { phone: string, otp: string }
 *
 * Flow:
 *   1. Frontend collects 6-digit OTP from user (/login/otp page)
 *   2. We call MSG91 /otp/verify with { mobile, otp }
 *   3. On success → find/create merchant → set JWT session cookie → return redirectTo
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { normalizePhone, toE164, msg91VerifyOtp } from '@/lib/msg91'
import { createSessionToken, setSessionCookie } from '@/lib/session'
import { addDays } from '@/lib/date-utils'
import { verifyOtpSchema } from '@/validations'
import { checkAndRecordVerify } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = verifyOtpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 })
    }

    const mobile91 = normalizePhone(parsed.data.phone)
    if (!mobile91) {
      return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })
    }

    // Our-side verify attempt limiting (MSG91 has its own too)
    const rateCheck = checkAndRecordVerify(mobile91)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: 'too_many_attempts',
          ...(rateCheck.reason === 'cooldown' ? { retryAfterSec: rateCheck.retryAfterSec } : {}),
        },
        { status: 429 }
      )
    }

    // Verify OTP with MSG91
    const verifyResult = await msg91VerifyOtp(mobile91, parsed.data.otp)
    if (!verifyResult.ok) {
      const error = verifyResult.error === 'expired' ? 'otp_expired' : 'wrong_otp'
      return NextResponse.json({ ok: false, error }, { status: 401 })
    }

    const phoneE164 = toE164(mobile91) // +91XXXXXXXXXX

    // Find or create merchant
    let merchant = await prisma.merchant.findFirst({
      where: { phone: phoneE164 },
      include: { users: { where: { role: 'owner' } } },
    })
    let isNewUser = false

    if (!merchant) {
      merchant = await prisma.merchant.create({
        data: {
          phone: phoneE164,
          businessName: '',
          plan: 'trial',
          trialEndsAt: addDays(new Date(), 14),
          users: { create: { role: 'owner', name: '' } },
        },
        include: { users: { where: { role: 'owner' } } },
      })
      await prisma.reminderRule.create({
        data: {
          merchantId: merchant.id,
          name: 'Default',
          isDefault: true,
          stages: [
            { dayOffset: 1,  channel: 'whatsapp', templateName: 'T1_polite' },
            { dayOffset: 3,  channel: 'whatsapp', templateName: 'T2_with_link' },
            { dayOffset: 5,  channel: 'whatsapp', templateName: 'T3_firm' },
            { dayOffset: 7,  channel: 'voice',    templateName: null },
            { dayOffset: 10, channel: 'voice',    templateName: null },
            { dayOffset: 14, channel: 'whatsapp', templateName: 'T4_final' },
            { dayOffset: 15, channel: 'escalate', templateName: null },
          ],
        },
      })
      isNewUser = true
      logger.info('New merchant created', { merchantId: merchant.id })
    }

    const ownerUser = merchant.users[0]
    if (!ownerUser) {
      return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
    }

    const sessionToken = await createSessionToken({
      merchantId: merchant.id,
      userId: ownerUser.id,
      role: ownerUser.role,
    })

    const redirectTo = !merchant.businessName ? '/onboarding' : '/dashboard'
    logger.info('Login successful via OTP', { merchantId: merchant.id, isNewUser })

    const response = NextResponse.json({ ok: true, isNewUser, redirectTo })
    setSessionCookie(response, sessionToken)
    return response
  } catch (err) {
    logger.error('OTP verify error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
