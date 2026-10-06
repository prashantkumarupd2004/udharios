/**
 * POST /api/admin/auth/logout — Clear admin session.
 */
import { NextResponse } from 'next/server'
import { clearAdminSessionCookie } from '@/lib/admin-auth'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  clearAdminSessionCookie(response)
  return response
}
