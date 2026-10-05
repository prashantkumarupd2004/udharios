/**
 * Inngest: Send a staged reminder (WhatsApp/SMS/Voice/Escalate)
 */

import { inngest } from '@/lib/inngest/client'
import { prisma } from '@/lib/prisma'
import {
  getWhatsAppProvider,
  buildT1Polite,
  buildT2WithLink,
  buildT3Firm,
  buildT4Final,
  isOptOutMessage,
} from '@/lib/providers/WhatsappProvider'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { isWithinSendingWindow, overdueDays, formatINR, formatIndianDate } from '@/lib/date-utils'

export const sendStagedReminder = inngest.createFunction(
  {
    id: 'send-staged-reminder',
    name: 'Send Staged Reminder',
    triggers: [{ event: 'reminders/send.staged' }],
    concurrency: { limit: 10 },
    retries: 3,
  },
  async ({ event, step }) => {
    const { outstandingId, merchantId, customerId, stageIndex } = event.data

    // Fetch full context
    const outstanding = await step.run('fetch-outstanding', async () => {
      return prisma.outstanding.findUniqueOrThrow({
        where: { id: outstandingId },
        include: {
          merchant: {
            include: { reminderRules: { where: { isDefault: true } } },
          },
          customer: true,
          paymentLink: true,
        },
      })
    })

    // Guard: Check current status (might have been paid since scheduled)
    if (!['upcoming', 'overdue'].includes(outstanding.status)) {
      logger.info('Outstanding no longer active — skipping reminder', {
        outstandingId,
        status: outstanding.status,
      })
      return { skipped: true, reason: `status is ${outstanding.status}` }
    }

    // Guard: Check opt-out
    if (outstanding.customer.optedOut) {
      return { skipped: true, reason: 'customer opted out' }
    }

    // Guard: Check sending window (quiet hours)
    const withinWindow = isWithinSendingWindow(
      outstanding.merchant.quietStart,
      outstanding.merchant.quietEnd
    )

    if (!withinWindow) {
      // Sleep until 09:01 IST
      await step.sleep('wait-for-sending-window', '1h')
      return { skipped: true, reason: 'outside sending window — retried' }
    }

    // Guard: Kill switch
    if (outstanding.merchant.isKillSwitched) {
      return { skipped: true, reason: 'merchant kill-switched' }
    }

    // Get the stage definition
    const rule = outstanding.merchant.reminderRules[0]
    if (!rule) {
      return { skipped: true, reason: 'no reminder rule' }
    }

    const stages = rule.stages as Array<{
      dayOffset: number
      channel: string
      templateName: string | null
    }>
    const stage = stages[stageIndex]
    if (!stage) {
      return { skipped: true, reason: 'stage index out of bounds' }
    }

    const amountINR = formatINR(outstanding.amount.toString())
    const daysOverdue = overdueDays(outstanding.dueDate)

    // ---------------------------------------------------------------------------
    // Execute the send based on channel
    // ---------------------------------------------------------------------------

    let externalMsgId: string | undefined
    let sendStatus: 'sent' | 'failed' = 'sent'
    let failedReason: string | undefined

    if (stage.channel === 'whatsapp') {
      const wa = getWhatsAppProvider()
      const phone = outstanding.customer.phone

      let components: ReturnType<typeof buildT1Polite> = []

      switch (stage.templateName) {
        case 'T1_polite':
          components = buildT1Polite(
            outstanding.customer.name,
            outstanding.merchant.businessName,
            amountINR,
            formatIndianDate(outstanding.dueDate)
          )
          break
        case 'T2_with_link':
          components = buildT2WithLink(
            outstanding.customer.name,
            amountINR,
            outstanding.invoiceNo ?? outstandingId.slice(0, 8),
            outstanding.paymentLink?.url ?? ''
          )
          break
        case 'T3_firm':
          components = buildT3Firm(
            outstanding.customer.name,
            amountINR,
            daysOverdue,
            outstanding.merchant.businessName
          )
          break
        case 'T4_final':
          components = buildT4Final(
            outstanding.customer.name,
            amountINR,
            daysOverdue,
            outstanding.merchant.businessName
          )
          break
        default:
          components = buildT1Polite(
            outstanding.customer.name,
            outstanding.merchant.businessName,
            amountINR,
            formatIndianDate(outstanding.dueDate)
          )
      }

      const result = await step.run('send-whatsapp', async () => {
        return wa.sendTemplate({
          to: phone,
          templateName: stage.templateName ?? 'T1_polite',
          components,
        })
      })

      externalMsgId = result.messageId
      if (result.status === 'failed') {
        sendStatus = 'failed'
        failedReason = result.error
      }
    } else if (stage.channel === 'voice') {
      // Trigger voice call via Inngest event
      await step.sendEvent('trigger-voice-call', {
        name: 'calls/trigger',
        data: { outstandingId, merchantId, customerId, retryCount: 0 },
      })
    } else if (stage.channel === 'escalate') {
      // Final escalation — notify merchant
      await step.sendEvent('trigger-escalation', {
        name: 'escalations/trigger',
        data: {
          outstandingId,
          merchantId,
          customerId,
          reason: `All ${stageIndex} reminder stages completed with no payment`,
        },
      })
    }

    // ---------------------------------------------------------------------------
    // Log the reminder
    // ---------------------------------------------------------------------------

    await step.run('log-reminder', async () => {
      await prisma.reminderLog.create({
        data: {
          merchantId,
          outstandingId,
          customerId,
          stage: stageIndex,
          channel: stage.channel as 'whatsapp' | 'sms' | 'voice' | 'escalate',
          templateName: stage.templateName,
          status: sendStatus,
          externalMsgId,
          failedReason,
        },
      })

      // Advance the stage counter
      if (sendStatus === 'sent') {
        await prisma.outstanding.update({
          where: { id: outstandingId },
          data: { currentStage: { increment: 1 } },
        })
      }

      await appendAuditLog({
        merchantId,
        actor: 'system:reminder-engine',
        action: sendStatus === 'sent' ? AUDIT_ACTIONS.REMINDER_SENT : AUDIT_ACTIONS.REMINDER_FAILED,
        entity: 'outstanding',
        entityId: outstandingId,
        payload: {
          stage: stageIndex,
          channel: stage.channel,
          templateName: stage.templateName,
          externalMsgId,
          failedReason,
        },
      })
    })

    return { sent: sendStatus === 'sent', channel: stage.channel, stage: stageIndex }
  }
)
