/**
 * JWT session management using jose
 * Cookie name: udhari_session
 * Expiry: 30 days
 * Payload: { merchantId, userId, role }
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'udhari_session'
const SESSION_EXPIRY = '30d'
const SESSION_EXPIRY_SECONDS = 30 * 24 * 60 * 60

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error('SESSION_SECRET env var is required')
  }
  return new TextEncoder().encode(secret)
}

export interface SessionPayload extends JWTPayload {
  merchantId: string
  userId: string
  role: string
}

export async function createSessionToken(payload: {
  merchantId: string
  userId: string
  role: string
}): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as SessionPayload
  } catch {
    return null
  }
}

/**
 * Set the session cookie on a NextResponse.
 * Call this in route handlers after successful login.
 */
export function setSessionCookie(response: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production'
  const cookieValue = [
    `${COOKIE_NAME}=${token}`,
    `Max-Age=${SESSION_EXPIRY_SECONDS}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    isProd ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')

  response.headers.append('Set-Cookie', cookieValue)
}

/**
 * Clear the session cookie.
 */
export function clearSessionCookie(response: Response): void {
  response.headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`
  )
}

/**
 * Read + verify the session from the current request cookies.
 * Use in server components or route handlers.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export { COOKIE_NAME }
