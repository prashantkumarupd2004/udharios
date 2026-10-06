/**
 * POST /api/access-requests — Submit an access request (public).
 *
 * Body: { name, businessName, phone, email?, city?, businessType?,
 *         monthlyVolume?, message? }
 *
 * Guards:
 *   - Zod validation
 *   - Rate limit: max 3 submissions per phone per 24h
 *   - Duplicate pending request → 409 already_pending
 *   - Phone already an approved merchant → 409 already_approved
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { normalizePhone, toE164 } from '@/lib/msg91'
import { accessRequestSchema } from '@/validations'

// Simple in-memory rate limit: max 3 submissions per phone per 24h
const submitMap = new Map<string, number[]>()
const WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_PER_WINDOW = 3

function checkRateLimit(phone91: string): boolean {
  const now = Date.now()
  const stamps = (submitMap.get(phone91) ?? []).filter(t => now - t < WINDOW_MS)
  if (stamps.length >= MAX_PER_WINDOW) return false
  stamps.push(now)
  submitMap.set(phone91, stamps)
  return true
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = accessRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'invalid_input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const mobile91 = normalizePhone(parsed.data.phone)
    if (!mobile91) {
      return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })
    }

    if (!checkRateLimit(mobile91)) {
      return NextResponse.json({ ok: false, error: 'too_many_requests' }, { status: 429 })
    }

    const phoneE164 = toE164(mobile91)

    // Already an approved merchant? → just log in
    const existingMerchant = await prisma.merchant.findFirst({
      where: { phone: phoneE164 },
      select: { id: true, isApproved: true },
    })
    if (existingMerchant?.isApproved) {
      return NextResponse.json({ ok: false, error: 'already_approved' }, { status: 409 })
    }

    // Already a pending request?
    const pending = await prisma.accessRequest.findFirst({
      where: { phone: phoneE164, status: 'pending' },
      select: { id: true },
    })
    if (pending) {
      return NextResponse.json({ ok: false, error: 'already_pending' }, { status: 409 })
    }

    const req = await prisma.accessRequest.create({
      data: {
        name: parsed.data.name.trim(),
        businessName: parsed.data.businessName.trim(),
        phone: phoneE164,
        email: parsed.data.email?.trim() || null,
        city: parsed.data.city?.trim() || null,
        businessType: parsed.data.businessType ?? null,
        monthlyVolume: parsed.data.monthlyVolume ?? null,
        message: parsed.data.message?.trim() || null,
      },
      select: { id: true },
    })

    logger.info('Access request submitted', { requestId: req.id, phone: phoneE164 })
    return NextResponse.json({ ok: true, requestId: req.id })
  } catch (err) {
    logger.error('Access request error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
