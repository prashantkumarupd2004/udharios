/**
 * POST /api/auth/dev-login
 * DEV ONLY — bypasses OTP, creates session directly from phone number.
 * Automatically disabled in production (returns 404).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createSessionToken } from '@/lib/session'
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

    // GATED: dev login also requires an approved merchant
    const merchant = await prisma.merchant.findFirst({
      where: { phone: phoneE164, isApproved: true },
      include: { users: { where: { role: 'owner' } } },
    })

    if (!merchant) {
      return NextResponse.json({ ok: false, error: 'not_approved' }, { status: 403 })
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
