/**
 * POST /api/webhooks/vobiz — Vobiz call status callbacks.
 * Handles: answered / completed / failed / no-answer / busy.
 * Mirrors /api/webhooks/exotel logic (retry escalation included).
 *
 * Signature: X-Vobiz-Signature-V3 (fail closed — see lib/vobiz.ts note).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { verifyVobizWebhook } from '@/lib/vobiz'

export const dynamic = 'force-dynamic'

function parseBody(raw: string): Record<string, string> {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) out[k] = String(v ?? '')
    return out
  } catch {
    const out: Record<string, string> = {}
    for (const [k, v] of new URLSearchParams(raw)) out[k] = v
    return out
  }
}

/** Vobiz status → hamara normalized status */
function normalizeStatus(raw: string): string {
  const s = raw.toLowerCase().replace(/[_\s]+/g, '-')
  if (['completed', 'answered', 'in-progress', 'ringing'].includes(s)) return s
  if (['no-answer', 'noanswer', 'unanswered', 'cancelled', 'canceled'].includes(s)) return 'no-answer'
  if (['busy'].includes(s)) return 'busy'
  if (['failed', 'error'].includes(s)) return 'failed'
  return s
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.VOBIZ_AUTH_TOKEN) {
      logger.error('Vobiz webhook secret not configured (VOBIZ_AUTH_TOKEN missing)')
      return NextResponse.json(
        { ok: false, error: 'webhook secret not configured' },
        { status: 500 }
      )
    }
    const rawBody = await request.text()
    const signature = request.headers.get('X-Vobiz-Signature-V3')
    if (!verifyVobizWebhook(signature, rawBody)) {
      logger.warn('Vobiz webhook signature invalid — rejecting')
      return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 403 })
    }

    const callId = request.nextUrl.searchParams.get('callId')
    const body = parseBody(rawBody)
    const callUuid = body.CallUUID ?? body.call_uuid ?? body.request_uuid ?? ''
    const status = normalizeStatus(body.Status ?? body.status ?? body.CallStatus ?? '')
    const duration = body.Duration ?? body.duration ?? body.billsec ?? null
    const recordingUrl = body.RecordingUrl ?? body.recording_url ?? null

    logger.info('Vobiz webhook', { callId, callUuid, status })

    if (!callId) {
      logger.warn('Vobiz webhook missing callId')
      return NextResponse.json({ ok: true })
    }

    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        outstanding: {
          include: {
            merchant: { select: { businessName: true } },
            customer: { select: { name: true, phone: true } },
          },
        },
      },
    })

    if (!call) {
      logger.warn('Vobiz webhook for unknown call', { callId })
      return NextResponse.json({ ok: true })
    }

    const updateData: Record<string, unknown> = { status }
    if (callUuid) updateData.exotelSid = callUuid
    if (recordingUrl) updateData.recordingUrl = recordingUrl
    if (duration) updateData.durationSec = parseInt(duration, 10) || undefined

    // No-answer / busy / failed → retry escalation (Exotel jaisa)
    if (['no-answer', 'busy', 'failed'].includes(status)) {
      updateData.outcome = 'no_answer'

      const retryCount = await prisma.call.count({
        where: {
          outstandingId: call.outstandingId,
          status: { in: ['no-answer', 'busy', 'failed'] },
        },
      })

      if (retryCount >= 2) {
        await prisma.merchantNotification.create({
          data: {
            merchantId: call.merchantId,
            type: 'escalation',
            title: `${call.outstanding.customer.name} — No Answer (${retryCount + 1}x)`,
            body: `${call.outstanding.customer.name} ne ${retryCount + 1} baar call nahi uthaya. Aap khud call karein.`,
            entityId: call.outstandingId,
            entityType: 'outstanding',
          },
        })
      }
    }

    await prisma.call.update({ where: { id: callId }, data: updateData })

    if (status === 'completed') {
      await appendAuditLog({
        merchantId: call.merchantId,
        actor: 'webhook:vobiz',
        action: AUDIT_ACTIONS.CALL_COMPLETED,
        entity: 'call',
        entityId: callId,
        payload: { status, durationSec: duration, recordingUrl, provider: 'vobiz' },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error('Vobiz webhook error', { error: String(err) })
    return NextResponse.json({ ok: true }) // Always 200
  }
}
