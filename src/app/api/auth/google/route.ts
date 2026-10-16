/**
 * GET /api/auth/google — Start Google OAuth login.
 * Redirects to Google's consent screen.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAuthUrl, isGoogleConfigured, signOAuthState } from '@/lib/google-oauth'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) {
    logger.error('Google OAuth not configured (missing env vars)')
    return NextResponse.redirect(new URL('/login?error=google_not_configured', request.url))
  }

  const redirectTo = request.nextUrl.searchParams.get('redirectTo') ?? '/dashboard'
  // state = where to go after login (HMAC-signed; verified on callback)
  const state = signOAuthState({ redirectTo })

  return NextResponse.redirect(getGoogleAuthUrl(state))
}
