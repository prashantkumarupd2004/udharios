/**
 * Inngest: Escalation function
 * Triggered when a customer has been unreachable through all reminder stages
 */

import { inngest } from '@/lib/inngest/client'
import { prisma } from '@/lib/prisma'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { formatINR, overdueDays } from '@/lib/date-utils'
import { logger } from '@/lib/logger'

export const escalateToMerchant = inngest.createFunction(
  {
    id: 'escalate-to-merchant',
    name: 'Escalate to Merchant',
    triggers: [{ event: 'outstandings/escalate' }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { outstandingId, merchantId, customerId, daysOverdue } = event.data as {
      outstandingId: string
      merchantId: string
      customerId: string
      daysOverdue: number
    }

    const outstanding = await step.run('fetch-outstanding', async () => {
      return prisma.outstanding.findUniqueOrThrow({
        where: { id: outstandingId },
        include: {
          customer: { select: { name: true, phone: true } },
          merchant: { select: { businessName: true, phone: true } },
        },
      })
    })

    await step.run('create-merchant-notification', async () => {
      await prisma.merchantNotification.create({
        data: {
          merchantId,
          type: 'escalation',
          title: `🚨 Escalation: ${outstanding.customer.name}`,
          body: `${outstanding.customer.name} ne ${formatINR(outstanding.amount.toString())} ka ${daysOverdue} din se payment nahi diya. Aap khud follow-up karein. 📞 ${outstanding.customer.phone}`,
          entityId: outstandingId,
          entityType: 'outstanding',
        },
      })
    })

    await step.run('mark-escalated', async () => {
      await prisma.outstanding.update({
        where: { id: outstandingId },
        data: { status: 'overdue' }, // stays overdue but reminders stop (stage exhausted)
      })
    })

    await appendAuditLog({
      merchantId,
      actor: 'system:escalation',
      action: AUDIT_ACTIONS.ESCALATION_TRIGGERED,
      entity: 'outstanding',
      entityId: outstandingId,
      payload: { daysOverdue, customerPhone: outstanding.customer.phone },
    })

    logger.info('Escalation triggered', { outstandingId, merchantId, daysOverdue })
  }
)
