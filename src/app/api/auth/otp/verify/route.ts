/**
 * POST /api/auth/otp/verify
 *
 * Accepts the MSG91 Widget access-token sent from the browser
 * after the Widget JS SDK verifies the OTP on the client side.
 *
 * Body: { accessToken: string }
 *
 * Flow:
 *   1. MSG91 Widget JS SDK sends OTP + user enters it → Widget verifies
 *   2. On success, Widget fires callback with { "access-token": "..." }
 *   3. Frontend sends that token here
 *   4. We call MSG91 verifyAccessToken → get mobile number
 *   5. Find/create merchant → set session cookie → return redirectTo
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { msg91VerifyAccessToken, toE164 } from '@/lib/msg91'
import { createSessionToken, setSessionCookie } from '@/lib/session'
import { addDays } from '@/lib/date-utils'
import { z } from 'zod'

const schema = z.object({
  accessToken: z.string().min(8),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 })
    }

    // Verify access-token with MSG91 → get mobile number
    const verifyResult = await msg91VerifyAccessToken(parsed.data.accessToken)
    if (!verifyResult.ok) {
      return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 401 })
    }

    const phoneE164 = toE164(verifyResult.mobile)  // +91XXXXXXXXXX

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
    logger.info('Login successful via Widget', { merchantId: merchant.id, isNewUser })

    const response = NextResponse.json({ ok: true, isNewUser, redirectTo })
    setSessionCookie(response, sessionToken)
    return response
  } catch (err) {
    logger.error('OTP verify error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
