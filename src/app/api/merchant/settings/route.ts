/**
 * GET /api/merchant/settings — Get merchant settings
 * PATCH /api/merchant/settings — Update merchant settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

async function getMerchantId(request: NextRequest): Promise<string | null> {
  const session = await getSession()
    if (!session?.merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const dbUser = await prisma.user.findFirst({
    where: { supabaseId: user.id },
    select: { merchantId: true },
  })
  return session.merchantId ?? null
}

export async function GET(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        businessName: true,
        category: true,
        upiVpa: true,
        quietStart: true,
        quietEnd: true,
        phone: true,
        plan: true,
        trialEndsAt: true,
        isKillSwitched: true,
      },
    })

    if (!merchant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ merchant })
  } catch (err) {
    logger.error('GET /api/merchant/settings error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { businessName, upiVpa, quietStart, quietEnd } = body

    const merchant = await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        ...(businessName && { businessName }),
        ...(upiVpa !== undefined && { upiVpa }),
        ...(quietStart && { quietStart }),
        ...(quietEnd && { quietEnd }),
      },
    })

    return NextResponse.json({ merchant })
  } catch (err) {
    logger.error('PATCH /api/merchant/settings error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
