/**
 * Inngest: AI Voice Call trigger
 * Listens for 'calls/trigger' events (sent by reminderSend.ts voice stages)
 *
 * Pehle ye event koi sun nahi raha tha — voice stages (day 7, day 10)
 * silently fail ho rahe the. Ab ye function call place karega.
 */

import { inngest } from '@/lib/inngest/client'
import { prisma } from '@/lib/prisma'
import { placeCall } from '@/lib/exotel'
import { isWithinSendingWindow, msUntilSendingWindow } from '@/lib/date-utils'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

export const triggerVoiceCall = inngest.createFunction(
  {
    id: 'trigger-voice-call',
    name: 'Trigger AI Voice Call',
    triggers: [{ event: 'calls/trigger' }],
    concurrency: { limit: 5 },
    retries: 2,
  },
  async ({ event, step }) => {
    const { outstandingId, merchantId, customerId, retryCount } = event.data as {
      outstandingId: string
      merchantId: string
      customerId: string
      retryCount?: number
    }

    // Fetch full context
    const outstanding = await step.run('fetch-outstanding', async () => {
      return prisma.outstanding.findUnique({
        where: { id: outstandingId },
        include: {
          merchant: {
            select: {
              id: true, businessName: true,
              quietStart: true, quietEnd: true,
              isKillSwitched: true,
            },
          },
          customer: {
            select: { id: true, name: true, phone: true, optedOut: true },
          },
        },
      })
    })

    if (!outstanding) {
      return { skipped: true, reason: 'outstanding not found' }
    }

    // Guard: already paid?
    if (!['upcoming', 'overdue'].includes(outstanding.status)) {
      return { skipped: true, reason: `status is ${outstanding.status}` }
    }

    // Guard: opt-out
    if (outstanding.customer.optedOut) {
      return { skipped: true, reason: 'customer opted out' }
    }

    // Guard: kill switch
    if (outstanding.merchant.isKillSwitched) {
      return { skipped: true, reason: 'merchant kill-switched' }
    }

    // Guard: valid phone
    if (!/^\+91\d{10}$/.test(outstanding.customer.phone)) {
      return { skipped: true, reason: 'invalid phone' }
    }

    // Guard: quiet hours — window khulne tak wait karo
    let withinWindow = isWithinSendingWindow(
      outstanding.merchant.quietStart,
      outstanding.merchant.quietEnd
    )
    if (!withinWindow) {
      const waitMs = msUntilSendingWindow(
        outstanding.merchant.quietStart,
        outstanding.merchant.quietEnd
      )
      logger.info('Voice call outside window — sleeping', {
        outstandingId,
        waitMinutes: Math.round(waitMs / 60000),
      })
      await step.sleep('wait-for-window', `${Math.ceil(waitMs / 60000)}m`)
      withinWindow = isWithinSendingWindow(
        outstanding.merchant.quietStart,
        outstanding.merchant.quietEnd
      )
      if (!withinWindow) {
        return { skipped: true, reason: 'still outside sending window' }
      }
    }

    // Call record banao
    const callRecord = await step.run('create-call-record', async () => {
      return prisma.call.create({
        data: {
          merchantId,
          outstandingId,
          customerId,
          exotelSid: `inngest-${Date.now()}-${outstandingId.slice(0, 8)}`,
          status: 'initiated',
        },
      })
    })

    // Exotel se call place karo
    const sid = await step.run('place-call', async () => {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://udharios.vercel.app'
      const res = await placeCall({
        to: outstanding.customer.phone,
        callbackUrl: `${baseUrl}/api/webhooks/exotel?callId=${callRecord.id}`,
        record: true,
        customField: JSON.stringify({
          callId: callRecord.id,
          outstandingId,
          merchantId,
          customerId,
          merchantName: outstanding.merchant.businessName,
          customerName: outstanding.customer.name,
          amountINR: outstanding.amount.toString(),
          retryCount: retryCount ?? 0,
          autoCall: true,
        }),
      })
      await prisma.call.update({
        where: { id: callRecord.id },
        data: { exotelSid: res.Call.Sid },
      })
      return res.Call.Sid
    })

    await step.run('audit-log', async () => {
      await appendAuditLog({
        merchantId,
        actor: 'system:voice-call',
        action: AUDIT_ACTIONS.CALL_PLACED,
        entity: 'outstanding',
        entityId: outstandingId,
        payload: { callId: callRecord.id, exotelSid: sid, retryCount: retryCount ?? 0 },
      }).catch(() => {})
    })

    logger.info('Inngest voice call placed', { outstandingId, callId: callRecord.id, sid })
    return { called: true, callId: callRecord.id, exotelSid: sid }
  }
)
