/**
 * Google OAuth 2.0 — manual implementation (no NextAuth).
 * Integrates with the existing custom JWT session system.
 *
 * Flow:
 *   1. GET /api/auth/google → redirect to Google consent screen
 *   2. Google → GET /api/auth/google/callback?code=...
 *   3. Exchange code → tokens → fetch user profile (email, name)
 *   4. Find APPROVED merchant by email → create session → redirect
 *
 * Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 * Redirect URI registered in Google Cloud Console:
 *   https://udharios.vercel.app/api/auth/google/callback
 */

import { logger } from '@/lib/logger'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

function getClientId(): string {
  return process.env.GOOGLE_CLIENT_ID ?? ''
}

function getClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? ''
}

function getRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  return `${base.replace(/\/$/, '')}/api/auth/google/callback`
}

export function isGoogleConfigured(): boolean {
  return !!getClientId() && !!getClientSecret()
}

/** Build the Google consent-screen URL. `state` carries the post-login redirect. */
export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export interface GoogleProfile {
  email: string
  name: string
  picture?: string
}

/** Exchange authorization code → tokens → user profile. Returns null on failure. */
export async function getGoogleProfile(code: string): Promise<GoogleProfile | null> {
  try {
    // 1. Code → tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: getClientId(),
        client_secret: getClientSecret(),
        redirect_uri: getRedirectUri(),
        grant_type: 'authorization_code',
      }).toString(),
    })

    if (!tokenRes.ok) {
      logger.error('Google token exchange failed', { status: tokenRes.status })
      return null
    }

    const tokens = (await tokenRes.json()) as { access_token?: string }
    if (!tokens.access_token) {
      logger.error('Google token response missing access_token')
      return null
    }

    // 2. Tokens → profile
    const profileRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!profileRes.ok) {
      logger.error('Google userinfo failed', { status: profileRes.status })
      return null
    }

    const profile = (await profileRes.json()) as {
      email?: string
      name?: string
      picture?: string
      verified_email?: boolean
    }

    if (!profile.email) {
      logger.error('Google profile missing email')
      return null
    }

    return {
      email: profile.email.toLowerCase(),
      name: profile.name ?? '',
      picture: profile.picture,
    }
  } catch (err) {
    logger.error('Google OAuth error', { error: String(err) })
    return null
  }
}
