/**
 * POST /api/auth/logout — Clear session cookie
 */

import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/session'

export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response)
  return response
}
