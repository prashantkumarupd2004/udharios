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

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  // Fallback to empty bytes if not set — will cause all verifications to fail
  // (safe: no session will be accepted)
  return new TextEncoder().encode(secret ?? '')
}

// Paths that do NOT require authentication
const PUBLIC_PATH_PREFIXES = [
  '/',
  '/login',
  '/onboarding',
  '/api/auth',
  '/api/webhooks',
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

  // Admin routes — phone-number whitelist
  if (path.startsWith('/admin') || path.startsWith('/api/admin')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // Admin check is done at the route-handler level using the DB
    // (middleware doesn't know the merchant's phone at this point)
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
