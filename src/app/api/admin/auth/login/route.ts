/**
 * POST /api/admin/auth/login — Admin email+password login.
 * Body: { email, password }
 * Sets ugaahi_admin_session cookie on success.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  verifyAdminCredentials,
  createAdminSessionToken,
  setAdminSessionCookie,
  isAdminAuthConfigured,
} from '@/lib/admin-auth'
import { logger } from '@/lib/logger'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
})

// Simple in-memory brute-force guard: 10 attempts / 15 min per IP
const attempts = new Map<string, { count: number; resetAt: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const rec = attempts.get(ip)
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 })
    return false
  }
  rec.count += 1
  return rec.count > 10
}

export async function POST(request: NextRequest) {
  try {
    if (!isAdminAuthConfigured()) {
      return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 500 })
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    if (rateLimited(ip)) {
      return NextResponse.json({ ok: false, error: 'too_many_attempts' }, { status: 429 })
    }

    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 })
    }

    const ok = await verifyAdminCredentials(parsed.data.email, parsed.data.password)
    if (!ok) {
      logger.warn('Failed admin login attempt', { ip })
      // Generic message — don't reveal whether email or password was wrong
      return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 })
    }

    const token = await createAdminSessionToken(parsed.data.email.trim().toLowerCase())
    const response = NextResponse.json({ ok: true, redirectTo: '/admin' })
    setAdminSessionCookie(response, token)
    logger.info('Admin login successful', { email: parsed.data.email.trim().toLowerCase() })
    return response
  } catch (err) {
    logger.error('Admin login error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
