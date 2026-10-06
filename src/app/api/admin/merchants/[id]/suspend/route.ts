/**
 * POST /api/admin/merchants/[id]/suspend — Toggle kill switch (admin only).
 * Body: { suspended: boolean, reason?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireAdmin } from '@/lib/admin'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { z } from 'zod'

const schema = z.object({
  suspended: z.boolean(),
  reason: z.string().max(500).optional(),
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

    const merchant = await prisma.merchant.update({
      where: { id },
      data: { isKillSwitched: parsed.data.suspended },
      select: { id: true, businessName: true, isKillSwitched: true },
    })

    await appendAuditLog({
      merchantId: id,
      actor: admin.email ?? admin.phone ?? 'admin',
      action: parsed.data.suspended
        ? AUDIT_ACTIONS.KILL_SWITCH_ACTIVATED
        : AUDIT_ACTIONS.KILL_SWITCH_DEACTIVATED,
      entity: 'merchant',
      entityId: id,
      payload: { reason: parsed.data.reason ?? null },
    })

    logger.info('Merchant suspend toggled', { merchantId: id, suspended: parsed.data.suspended })
    return NextResponse.json({ ok: true, isKillSwitched: merchant.isKillSwitched })
  } catch (err) {
    logger.error('Admin suspend error', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
