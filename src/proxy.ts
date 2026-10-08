/**
 * proxy.ts — Next.js 16 middleware (renamed from middleware.ts)
 *
 * Protects:
 *   /dashboard/* /onboarding/* /api/* (except /api/auth/* and webhooks)
 *
 * Auth: verifies udhari_session JWT cookie (jose HS256).
 * No Supabase dependency.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const COOKIE_NAME = 'udhari_session'
const ADMIN_COOKIE_NAME = 'ugaahi_admin_session'

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET ?? process.env.JWT_SECRET
  // Fallback to empty bytes if not set — will cause all verifications to fail
  // (safe: no session will be accepted)
  return new TextEncoder().encode(secret ?? '')
}

async function verifyAdminSession(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload.type === 'admin' && typeof payload.email === 'string'
  } catch {
    return false
  }
}

// Paths that do NOT require authentication
const PUBLIC_PATH_PREFIXES = [
  '/',
  '/login',
  '/onboarding',
  '/services',
  '/privacy',
  '/terms',
  '/request-access',
  '/api/auth',
  '/api/access-requests',
  '/api/webhooks',
  '/api/exotel/voicebot-url', // Exotel Voicebot dynamic URL (per-call, no session; called by Exotel servers)
  '/api/voice', // Exotel ExoML callbacks (no session cookie; test-call has x-test-key guard)
  '/api/integrations/tally/sync', // Tally sync agent (x-tally-api-key header auth, no session)
  '/api/integrations/tally/status', // Tally sync status check (same API key auth)
  '/api/inngest',
  '/_next',
  '/favicon',
  '/manifest.json',
  '/sw.js',
  '/icons',
]

async function verifySession(token: string): Promise<{ merchantId: string; userId: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const { merchantId, userId, role } = payload as Record<string, unknown>
    if (
      typeof merchantId === 'string' &&
      typeof userId === 'string' &&
      typeof role === 'string'
    ) {
      return { merchantId, userId, role }
    }
    return null
  } catch {
    return null
  }
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })
  const path = request.nextUrl.pathname

  // Admin routes FIRST — separate email+password auth (ugaahi_admin_session).
  // Public: /admin/login and /api/admin/auth/* (login/logout endpoints).
  // Must run before the merchant-session check below, otherwise /admin/login
  // gets bounced to the merchant OTP /login page.
  if (path.startsWith('/admin') || path.startsWith('/api/admin')) {
    const isAdminPublic =
      path === '/admin/login' ||
      path.startsWith('/api/admin/auth/')
    if (!isAdminPublic) {
      const adminToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value ?? null
      const adminOk = adminToken ? await verifyAdminSession(adminToken) : false
      if (!adminOk) {
        // API → 401 JSON, pages → redirect to admin login
        if (path.startsWith('/api/')) {
          return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
        }
        return NextResponse.redirect(new URL('/admin/login', request.url))
      }
    }
    return response
  }

  // Always allow public paths
  const isPublic = PUBLIC_PATH_PREFIXES.some(p =>
    path === p || path.startsWith(p + '/')
  )

  // Read JWT cookie
  const token = request.cookies.get(COOKIE_NAME)?.value ?? null
  const session = token ? await verifySession(token) : null

  // Redirect unauthenticated users away from protected routes
  if (!session && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', path)
    return NextResponse.redirect(url)
  }

  // Redirect already-authenticated users away from login
  if (session && (path === '/login' || path === '/')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
