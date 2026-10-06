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

export async function POST(request: NextRequest) {
  try {
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
