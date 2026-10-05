/**
 * Inngest: Promise Follow-Up Function (M8)
 * When a customer promises to pay by a date:
 * 1. Reminders are paused until that date
 * 2. At 10:00 IST on the promise date, if still unpaid → resume reminders + mark promise broken
 */

import { inngest } from '@/lib/inngest/client'
import { prisma } from '@/lib/prisma'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { formatINR } from '@/lib/date-utils'

export const promiseFollowUp = inngest.createFunction(
  {
    id: 'promise-follow-up',
    name: 'Promise Follow-Up',
    triggers: [{ event: 'promises/follow-up' }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { outstandingId, merchantId, promiseId } = event.data as {
      outstandingId: string
      merchantId: string
      promiseId: string
    }

    // Fetch current state
    const [promise, outstanding] = await step.run('fetch-state', async () => {
      return Promise.all([
        prisma.promise.findUniqueOrThrow({ where: { id: promiseId } }),
        prisma.outstanding.findUniqueOrThrow({
          where: { id: outstandingId },
          include: {
            customer: { select: { name: true, phone: true } },
            merchant: { select: { businessName: true, quietStart: true, quietEnd: true } },
          },
        }),
      ])
    })

    // If already paid — mark promise kept and stop
    if (outstanding.status === 'paid') {
      await step.run('mark-promise-kept', async () => {
        await prisma.promise.update({
          where: { id: promiseId },
          data: { status: 'kept' },
        })
        await appendAuditLog({
          merchantId,
          actor: 'system:promise-engine',
          action: AUDIT_ACTIONS.PROMISE_KEPT,
          entity: 'promise',
          entityId: promiseId,
          payload: { outstandingId, outcome: 'paid_before_follow_up' },
        })
      })
      return { outcome: 'promise_kept' }
    }

    // Calculate delay until promised date 10:00 IST (00:30 UTC + offset for IST)
    const promisedDate = new Date(promise.promisedDate)
    const followUpTime = new Date(promisedDate)
    followUpTime.setUTCHours(4, 30, 0, 0) // 10:00 IST = 04:30 UTC

    const now = Date.now()
    const delayMs = followUpTime.getTime() - now

    // Wait until the promise date if it's in the future
    if (delayMs > 60_000) {
      await step.sleep('wait-until-promise-date', delayMs)
    }

    // Re-check payment status after waiting
    const refreshedOutstanding = await step.run('check-payment-status', async () => {
      return prisma.outstanding.findUniqueOrThrow({ where: { id: outstandingId } })
    })

    if (refreshedOutstanding.status === 'paid') {
      await step.run('mark-promise-kept-late', async () => {
        await prisma.promise.update({
          where: { id: promiseId },
          data: { status: 'kept' },
        })
        await appendAuditLog({
          merchantId,
          actor: 'system:promise-engine',
          action: AUDIT_ACTIONS.PROMISE_KEPT,
          entity: 'promise',
          entityId: promiseId,
          payload: { outstandingId },
        })
      })
      return { outcome: 'promise_kept' }
    }

    // Promise broken — mark it and resume reminders
    await step.run('mark-promise-broken', async () => {
      await Promise.all([
        prisma.promise.update({
          where: { id: promiseId },
          data: { status: 'broken' },
        }),
        prisma.outstanding.update({
          where: { id: outstandingId },
          data: { status: 'overdue' },
        }),
      ])

      // Notify merchant
      const amountINR = formatINR(outstanding.amount.toString())
      await prisma.merchantNotification.create({
        data: {
          merchantId,
          type: 'promise_broken',
          title: `💔 Promise toot gaya — ${outstanding.customer.name}`,
          body: `${outstanding.customer.name} ne ${amountINR} dene ka promise kiya tha, lekin payment abhi tak nahi aayi.`,
          entityId: outstandingId,
          entityType: 'outstanding',
        },
      })

      await appendAuditLog({
        merchantId,
        actor: 'system:promise-engine',
        action: AUDIT_ACTIONS.PROMISE_BROKEN,
        entity: 'promise',
        entityId: promiseId,
        payload: { outstandingId, promisedDate: promise.promisedDate.toString() },
      })

      logger.warn('Promise broken', { promiseId, outstandingId, merchantId })
    })

    return { outcome: 'promise_broken' }
  }
)
