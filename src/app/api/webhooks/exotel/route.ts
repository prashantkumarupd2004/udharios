/**
 * POST /api/webhooks/exotel — Exotel call status and audio callback
 * Handles: call answered, call completed, recording available
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { processVoiceAgentTurn, VoiceAgentContext } from '@/lib/voice-agent'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { overdueDays, formatINR } from '@/lib/date-utils'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const callId = searchParams.get('callId')

    const body = await request.formData()
    const status = body.get('Status') as string
    const callSid = body.get('CallSid') as string
    const recordingUrl = body.get('RecordingUrl') as string | null
    const duration = body.get('Duration') as string | null

    logger.info('Exotel webhook', { callId, status, callSid })

    if (!callId) {
      logger.warn('Exotel webhook missing callId')
      return NextResponse.json({ ok: true })
    }

    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        outstanding: {
          include: {
            merchant: { select: { businessName: true } },
            customer: { select: { name: true, phone: true } },
            paymentLink: { select: { url: true } },
          },
        },
      },
    })

    if (!call) {
      logger.warn('Exotel webhook for unknown call', { callId })
      return NextResponse.json({ ok: true })
    }

    const outstanding = call.outstanding

    // Update call status
    const updateData: Record<string, unknown> = { status }
    if (recordingUrl) updateData.recordingUrl = recordingUrl
    if (duration) updateData.durationSec = parseInt(duration)

    // If call was answered — run the voice agent
    if (status === 'in-progress' || status === 'completed') {
      const ctx: VoiceAgentContext = {
        callId,
        outstandingId: call.outstandingId,
        merchantId: call.merchantId,
        customerId: call.customerId,
        merchantName: outstanding.merchant.businessName,
        customerName: outstanding.customer.name,
        amountINR: formatINR(outstanding.amount.toNumber()),
        daysOverdue: overdueDays(outstanding.dueDate),
        paymentLinkUrl: outstanding.paymentLink?.url,
      }

      // Determine turn index from existing transcript length
      const existingTranscript = (call.transcript as unknown[]) ?? []
      const turnIndex = existingTranscript.length

      // Process turn (audio buffer = null for status-only calls; real audio comes from Sarvam STT)
      const turn = await processVoiceAgentTurn(null, ctx, turnIndex)

      // Append to transcript
      const newTranscript = [
        ...existingTranscript,
        {
          turnIndex,
          customerSpeech: turn.customerSpeech,
          agentResponse: turn.agentResponse,
          outcome: turn.outcome,
          timestamp: new Date().toISOString(),
        },
      ]

      updateData.transcript = newTranscript

      if (turn.outcome && turn.outcome !== 'ongoing') {
        updateData.outcome = turn.outcome
      }
    }

    // Handle no-answer → retry logic
    if (status === 'no-answer' || status === 'busy' || status === 'failed') {
      updateData.outcome = 'no_answer'

      const retryCount = (
        await prisma.call.count({
          where: {
            outstandingId: call.outstandingId,
            status: { in: ['no-answer', 'busy', 'failed'] },
          },
        })
      )

      // After 2 retries → escalate
      if (retryCount >= 2) {
        await prisma.merchantNotification.create({
          data: {
            merchantId: call.merchantId,
            type: 'escalation',
            title: `${outstanding.customer.name} — No Answer (${retryCount + 1}x)`,
            body: `${outstanding.customer.name} ne ${retryCount + 1} baar call nahi uthaya. Aap khud call karein.`,
            entityId: call.outstandingId,
            entityType: 'outstanding',
          },
        })
      }
    }

    await prisma.call.update({
      where: { id: callId },
      data: updateData,
    })

    // Audit log on completion
    if (status === 'completed') {
      await appendAuditLog({
        merchantId: call.merchantId,
        actor: 'webhook:exotel',
        action: AUDIT_ACTIONS.CALL_COMPLETED,
        entity: 'call',
        entityId: callId,
        payload: {
          status,
          outcome: updateData.outcome,
          durationSec: duration,
          recordingUrl,
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error('Exotel webhook error', { error: String(err) })
    return NextResponse.json({ ok: true }) // Always 200
  }
}
