/**
 * POST /api/admin/merchants/[id]/extend-trial — Extend trial period (admin only).
 * Body: { days: number (1-90) }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireAdmin } from '@/lib/admin'
import { appendAuditLog } from '@/lib/audit'
import { z } from 'zod'

const schema = z.object({
  days: z.number().int().min(1).max(90),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 })
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id },
      select: { trialEndsAt: true },
    })
    if (!merchant) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    }

    const base = merchant.trialEndsAt && merchant.trialEndsAt > new Date()
      ? merchant.trialEndsAt
      : new Date()
    const newTrialEnd = new Date(base.getTime() + parsed.data.days * 24 * 60 * 60 * 1000)

    await prisma.merchant.update({
      where: { id },
      data: { trialEndsAt: newTrialEnd, plan: 'trial' },
    })

    await appendAuditLog({
      merchantId: id,
      actor: admin.email ?? admin.phone ?? 'admin',
      action: 'admin.trial.extended',
      entity: 'merchant',
      entityId: id,
      payload: { days: parsed.data.days, newTrialEndsAt: newTrialEnd.toISOString() },
    })

    logger.info('Trial extended', { merchantId: id, days: parsed.data.days })
    return NextResponse.json({ ok: true, trialEndsAt: newTrialEnd })
  } catch (err) {
    logger.error('Admin extend trial error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
