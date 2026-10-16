/**
 * POST /api/outstandings/[id]/pause
 * Merchant manually pauses/resumes automated reminders for ONE outstanding.
 * Paused → nightly engine, crons, voice calls, manual trigger all skip it.
 * Resume → continues from the existing currentStage (no reset).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const pauseSchema = z.object({
  paused: z.boolean(),
  reason: z.string().max(300).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const merchantId = session.merchantId
    const { id } = await params

    const body = pauseSchema.parse(await request.json())

    // Outstanding merchant ka hi hona chahiye
    const outstanding = await prisma.outstanding.findFirst({
      where: { id, merchantId },
      select: { id: true, remindersPaused: true, status: true },
    })
    if (!outstanding) {
      return NextResponse.json({ error: 'Outstanding not found' }, { status: 404 })
    }

    const updated = await prisma.outstanding.update({
      where: { id },
      data: {
        remindersPaused: body.paused,
        pausedAt: body.paused ? new Date() : null,
      },
      select: { id: true, remindersPaused: true, pausedAt: true },
    })

    await appendAuditLog({
      merchantId,
      actor: 'merchant',
      action: body.paused ? AUDIT_ACTIONS.OUTSTANDING_PAUSED : AUDIT_ACTIONS.OUTSTANDING_RESUMED,
      entity: 'outstanding',
      entityId: id,
      payload: { paused: body.paused, reason: body.reason ?? null },
    }).catch(() => {})

    logger.info(body.paused ? 'Reminders paused for outstanding' : 'Reminders resumed for outstanding', {
      merchantId,
      outstandingId: id,
    })

    return NextResponse.json({
      success: true,
      outstanding: {
        id: updated.id,
        remindersPaused: updated.remindersPaused,
        pausedAt: updated.pausedAt,
      },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.issues }, { status: 400 })
    }
    logger.error('POST /api/outstandings/[id]/pause error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
