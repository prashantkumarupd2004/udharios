/**
 * GET /api/auth/google/callback — Google OAuth callback.
 *
 * Exchanges the code for the user's Google profile, then:
 *   - Approved merchant with matching email → create session → dashboard
 *   - Admin email (ADMIN_EMAILS) → auto-provision → dashboard
 *   - No match / not approved → redirect to /request-access
 *
 * GATED ACCESS: Google login never auto-creates client merchants.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getGoogleProfile } from '@/lib/google-oauth'
import { createSessionToken, setSessionCookie } from '@/lib/session'
import { provisionMerchant } from '@/lib/merchant'

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function safeRedirectTo(state: string | null): string {
  try {
    if (!state) return '/dashboard'
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString()) as {
      redirectTo?: string
    }
    const r = parsed.redirectTo ?? '/dashboard'
    return r.startsWith('/') && !r.startsWith('//') ? r : '/dashboard'
  } catch {
    return '/dashboard'
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const redirectTo = safeRedirectTo(url.searchParams.get('state'))

  if (error || !code) {
    logger.warn('Google OAuth cancelled or missing code', { error })
    return NextResponse.redirect(new URL('/login?error=google_cancelled', request.url))
  }

  const profile = await getGoogleProfile(code)
  if (!profile) {
    return NextResponse.redirect(new URL('/login?error=google_failed', request.url))
  }
  // Email normalize — Google kabhi-kabhi case alag bhejta hai
  const email = profile.email.trim().toLowerCase()

  // Admin emails bypass the gate (auto-provision like admin phones).
  // Pehle check karo: kya is email ka ASLI merchant pehle se hai?
  // Agar hai to usi me login karo — nakli google: merchant mat banao.
  if (adminEmails().includes(email)) {
    const existing = await prisma.merchant.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, NOT: { phone: { startsWith: 'google:' } } },
      include: { users: { where: { role: 'owner' } } },
    })
    logger.info('Admin Google login match', { email, matchedMerchant: existing?.id ?? null })
    const merchant = existing ?? await provisionMerchant({
      phone: `google:${email}`,
      businessName: profile.name || 'Ugaahi Admin',
      ownerName: profile.name,
      email,
    })
    const owner = merchant.users[0]
    if (!owner) {
      return NextResponse.redirect(new URL('/login?error=server_error', request.url))
    }
    const token = await createSessionToken({
      merchantId: merchant.id,
      userId: owner.id,
      role: owner.role,
    })
    const res = NextResponse.redirect(new URL('/admin/access-requests', request.url))
    setSessionCookie(res, token)
    logger.info('Admin Google login', { email })
    return res
  }

  // GATED: merchant must exist AND be approved
  const merchant = await prisma.merchant.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { users: { where: { role: 'owner' } } },
  })

  if (!merchant || !merchant.isApproved) {
    logger.info('Google login blocked: email not approved', { email })
    // Send them to request access, pre-filling what we know
    const reqUrl = new URL('/request-access', request.url)
    reqUrl.searchParams.set('email', email)
    reqUrl.searchParams.set('name', profile.name)
    return NextResponse.redirect(reqUrl)
  }

  const ownerUser = merchant.users[0]
  if (!ownerUser) {
    return NextResponse.redirect(new URL('/login?error=server_error', request.url))
  }

  const sessionToken = await createSessionToken({
    merchantId: merchant.id,
    userId: ownerUser.id,
    role: ownerUser.role,
  })

  logger.info('Google login successful', { merchantId: merchant.id, email })
  const response = NextResponse.redirect(new URL(redirectTo, request.url))
  setSessionCookie(response, sessionToken)
  return response
}
