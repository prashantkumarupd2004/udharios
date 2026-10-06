/**
 * Separate admin authentication — email + password.
 * Completely independent from merchant OTP/Google login.
 *
 * Credentials come from env vars (never hardcoded):
 *   ADMIN_EMAIL          e.g. admin@ugaahi.com
 *   ADMIN_PASSWORD_HASH  bcrypt hash of the admin password
 *
 * Session: signed JWT in `ugaahi_admin_session` cookie (7 days).
 */

import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'
import { logger } from '@/lib/logger'

export const ADMIN_COOKIE_NAME = 'ugaahi_admin_session'
const SESSION_DAYS = 7

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? 'dev-secret-change-me'
  return new TextEncoder().encode(secret)
}

export function isAdminAuthConfigured(): boolean {
  return !!process.env.ADMIN_EMAIL && !!process.env.ADMIN_PASSWORD_HASH
}

/** Verify email + password against env vars. Constant-time-ish via bcrypt. */
export async function verifyAdminCredentials(
  email: string,
  password: string
): Promise<boolean> {
  const adminEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
  const hash = process.env.ADMIN_PASSWORD_HASH ?? ''
  if (!adminEmail || !hash) {
    logger.error('Admin auth not configured (ADMIN_EMAIL / ADMIN_PASSWORD_HASH missing)')
    return false
  }
  if (email.trim().toLowerCase() !== adminEmail) return false
  try {
    return await bcrypt.compare(password, hash)
  } catch (err) {
    logger.error('Admin password compare failed', { error: String(err) })
    return false
  }
}

export async function createAdminSessionToken(email: string): Promise<string> {
  return new SignJWT({ email, role: 'superadmin', type: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret())
}

export function setAdminSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  })
}

export interface AdminSession {
  email: string
}

/** Read + verify the admin session from cookies. Returns null if invalid. */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, getSecret())
    if (payload.type !== 'admin' || typeof payload.email !== 'string') return null
    return { email: payload.email }
  } catch {
    return null
  }
}
