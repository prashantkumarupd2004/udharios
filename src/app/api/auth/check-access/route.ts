/**
 * POST /api/auth/check-access — Check if a phone number is approved (public).
 * Body: { phone: string }
 * Returns: { ok: true, approved: boolean, hasPendingRequest: boolean }
 *
 * Used by the login page BEFORE sending an OTP — unapproved numbers never
 * receive an OTP (saves MSG91 cost and enforces the access gate).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizePhone, toE164 } from '@/lib/msg91'
import { sendOtpSchema } from '@/validations'
import { isAdminPhone } from '@/lib/admin'
import { checkAndRecordIpRequest } from '@/lib/rateLimit'

/** Best-effort client IP (Vercel sets x-forwarded-for). */
function clientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function POST(request: NextRequest) {
  try {
    // Anti-enumeration: membership lookups are cheap to probe, so cap them
    // per IP (10/min). Raises the cost of scanning phone numbers.
    const ipCheck = checkAndRecordIpRequest(`check-access:${clientIp(request)}`)
    if (!ipCheck.allowed) {
      return NextResponse.json({ ok: false, error: 'too_many_requests' }, { status: 429 })
    }

    const body = await request.json()
    const parsed = sendOtpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })
    }

    const mobile91 = normalizePhone(parsed.data.phone)
    if (!mobile91) {
      return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })
    }
    const phoneE164 = toE164(mobile91)

    // Admin phones always pass the gate
    if (isAdminPhone(phoneE164)) {
      return NextResponse.json({ ok: true, approved: true, hasPendingRequest: false })
    }

    const merchant = await prisma.merchant.findFirst({
      where: { phone: phoneE164 },
      select: { isApproved: true },
    })

    let hasPendingRequest = false
    if (!merchant?.isApproved) {
      const pending = await prisma.accessRequest.findFirst({
        where: { phone: phoneE164, status: 'pending' },
        select: { id: true },
      })
      hasPendingRequest = !!pending
    }

    return NextResponse.json({
      ok: true,
      approved: merchant?.isApproved ?? false,
      hasPendingRequest,
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
