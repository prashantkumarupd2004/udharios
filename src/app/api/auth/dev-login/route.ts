/**
 * POST /api/auth/dev-login
 * DEV ONLY — bypasses OTP, creates session directly from phone number.
 * Automatically disabled in production (returns 404).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createSessionToken } from '@/lib/session'
import { addDays } from '@/lib/date-utils'
import { z } from 'zod'

const schema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/),
})

export async function POST(request: NextRequest) {
  // Hard block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })

    const phoneE164 = `+91${parsed.data.phone}`

    let merchant = await prisma.merchant.findFirst({
      where: { phone: phoneE164 },
      include: { users: { where: { role: 'owner' } } },
    })

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
      logger.info('[DEV] New merchant created', { merchantId: merchant.id })
    }

    const ownerUser = merchant.users[0]
    if (!ownerUser) return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })

    const token = await createSessionToken({
      merchantId: merchant.id,
      userId: ownerUser.id,
      role: ownerUser.role,
    })

    const redirectTo = !merchant.businessName ? '/onboarding' : '/dashboard'
    logger.info('[DEV] Bypass login', { merchantId: merchant.id, redirectTo })

    const response = NextResponse.json({ ok: true, redirectTo })
    // Use NextResponse.cookies.set for reliable cookie on localhost
    response.cookies.set('udhari_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      secure: false, // dev: no HTTPS needed
    })
    return response
  } catch (err) {
    logger.error('[DEV] Dev login error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
