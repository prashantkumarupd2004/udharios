/**
 * POST /api/merchant/onboard — Complete merchant onboarding profile
 * Auth: JWT session cookie (udhari_session)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { onboardingSchema } from '@/validations'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    // Verify JWT session
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = onboardingSchema.parse(body)

    const merchant = await prisma.merchant.update({
      where: { id: session.merchantId },
      data: {
        businessName: data.businessName,
        category:     data.category,
        upiVpa:       data.upiVpa,
        quietStart:   data.quietStart,
        quietEnd:     data.quietEnd,
      },
    })

    await appendAuditLog({
      merchantId: merchant.id,
      actor:      'merchant',
      action:     AUDIT_ACTIONS.MERCHANT_UPDATED,
      entity:     'merchant',
      entityId:   merchant.id,
      payload:    { businessName: data.businessName, category: data.category },
    })

    logger.info('Merchant onboarding complete', { merchantId: merchant.id })
    return NextResponse.json({ merchant })
  } catch (err) {
    logger.error('POST /api/merchant/onboard error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
