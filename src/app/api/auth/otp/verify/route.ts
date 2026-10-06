/**
 * POST /api/auth/otp/verify — Verify OTP via MSG91 v5 API (server-side flow)
 *
 * Body: { phone: string, otp: string }
 *
 * Flow:
 *   1. Frontend collects 6-digit OTP from user (/login/otp page)
 *   2. We call MSG91 /otp/verify with { mobile, otp }
 *   3. On success → merchant must EXIST and be APPROVED (no auto-create;
 *      access is granted only via admin-approved AccessRequest)
 *      → set JWT session cookie → return redirectTo
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { normalizePhone, toE164, msg91VerifyOtp } from '@/lib/msg91'
import { createSessionToken, setSessionCookie } from '@/lib/session'
import { verifyOtpSchema } from '@/validations'
import { checkAndRecordVerify } from '@/lib/rateLimit'
import { isAdminPhone } from '@/lib/admin'
import { provisionMerchant } from '@/lib/merchant'

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

    // GATED ACCESS: merchant must exist AND be approved by admin.
    // No auto-provisioning here — approval happens via AccessRequest flow.
    // Exception: admin phones (ADMIN_PHONE_NUMBERS) are auto-provisioned so
    // the admin can always log in to review requests.
    let merchant = await prisma.merchant.findFirst({
      where: { phone: phoneE164 },
      include: { users: { where: { role: 'owner' } } },
    })

    if (!merchant && isAdminPhone(phoneE164)) {
      merchant = await provisionMerchant({ phone: phoneE164, businessName: 'Ugaahi Admin' })
    }

    if (!merchant || !merchant.isApproved) {
      logger.info('Login blocked: number not approved', { phone: phoneE164 })
      return NextResponse.json({ ok: false, error: 'not_approved' }, { status: 403 })
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
    logger.info('Login successful via OTP', { merchantId: merchant.id })

    const response = NextResponse.json({ ok: true, isNewUser: false, redirectTo })
    setSessionCookie(response, sessionToken)
    return response
  } catch (err) {
    logger.error('OTP verify error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
