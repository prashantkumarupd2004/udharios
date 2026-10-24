/**
 * Inngest: Send a staged reminder (WhatsApp/SMS/Voice/Escalate)
 */

import { inngest } from '@/lib/inngest/client'
import { prisma } from '@/lib/prisma'
import {
  getWhatsAppProvider,
  buildT1Polite,
  buildT2WithUpiOrBank,
  buildMerchantPaymentInfo,
  isOptOutMessage,
} from '@/lib/providers/WhatsappProvider'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { msg91SendSms } from '@/lib/msg91'
import { isWithinSendingWindow, overdueDays, formatINR, formatIndianDate, msUntilSendingWindow } from '@/lib/date-utils'

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

    // Guard: Merchant ne is ledger ke reminders manually pause kiye hain
    if (outstanding.remindersPaused) {
      logger.info('Reminders paused by merchant — skipping reminder', { outstandingId })
      return { skipped: true, reason: 'reminders paused by merchant' }
    }

    // Guard: Check opt-out
    if (outstanding.customer.optedOut) {
      return { skipped: true, reason: 'customer opted out' }
    }

    // Guard: Check sending window (quiet hours)
    // Agar quiet hours me hai to window khulne tak sleep karo, phir dobara check karo.
    // Pehle ye 1h sleep karke "skipped" return karta tha — reminder kabhi nahi bheja jata tha!
    let withinWindow = isWithinSendingWindow(
      outstanding.merchant.quietStart,
      outstanding.merchant.quietEnd
    )

    if (!withinWindow) {
      const waitMs = msUntilSendingWindow(
        outstanding.merchant.quietStart,
        outstanding.merchant.quietEnd
      )
      logger.info('Outside sending window — sleeping until window opens', {
        outstandingId,
        waitMinutes: Math.round(waitMs / 60000),
      })
      await step.sleep('wait-for-sending-window', `${Math.ceil(waitMs / 60000)}m`)
      withinWindow = isWithinSendingWindow(
        outstanding.merchant.quietStart,
        outstanding.merchant.quietEnd
      )
    }

    if (!withinWindow) {
      return { skipped: true, reason: 'still outside sending window after wait' }
    }

    // Guard: Kill switch
    if (outstanding.merchant.isKillSwitched) {
      return { skipped: true, reason: 'merchant kill-switched' }
    }

    // Guard: Valid phone (tally-xxx ya invalid format wale skip)
    const digitsOnly = outstanding.customer.phone.replace(/\D/g, '')
    if (!/^91[6-9]\d{9}$/.test(digitsOnly)) {
      logger.warn('Invalid customer phone — skipping reminder', {
        outstandingId,
        phone: outstanding.customer.phone.slice(0, 6) + '****',
      })
      return { skipped: true, reason: 'invalid phone number' }
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
    // WhatsApp me bheja gaya actual template naam (sirf approved templates)
    let resolvedTemplateName = stage.templateName ?? 't1_polite'

    if (stage.channel === 'whatsapp') {
      const wa = getWhatsAppProvider()
      const phone = outstanding.customer.phone

      let components: ReturnType<typeof buildT1Polite> = []


      // Sirf 2 templates: t1_polite aur T2_upi_bank (merchant ka saved
      // UPI/bank). Link wala template hata diya (user order).
      switch (stage.templateName) {
        case 't1_polite':
          components = buildT1Polite(
            outstanding.customer.name,
            outstanding.merchant.businessName,
            amountINR,
            formatIndianDate(outstanding.dueDate)
          )
          break
        case 'T2_upi_bank': {
          const paymentInfo = buildMerchantPaymentInfo(outstanding.merchant)
          if (paymentInfo) {
            components = buildT2WithUpiOrBank(
              outstanding.customer.name,
              amountINR,
              outstanding.invoiceNo ?? outstandingId.slice(0, 8),
              paymentInfo
            )
          } else {
            // Payment info save nahi hai to polite reminder bhej do
            // (aur naam bhi t1_polite rakho, warna mismatch hoga)
            resolvedTemplateName = 't1_polite'
            components = buildT1Polite(
              outstanding.customer.name,
              outstanding.merchant.businessName,
              amountINR,
              formatIndianDate(outstanding.dueDate)
            )
          }
          break
        }
        default:
          // Purani stage rows (t2_with_link wagera) bhi polite pe girengi,
          // naam bhi t1_polite rakho taaki mismatch na ho
          resolvedTemplateName = 't1_polite'
          components = buildT1Polite(
            outstanding.customer.name,
            outstanding.merchant.businessName,
            amountINR,
            formatIndianDate(outstanding.dueDate)
          )
      }

      const result = await step.run('send-whatsapp', async () => {
        // Providers (AiSensy/Meta/Gupshup) ko digits-only number chahiye: 919876543210
        // DB me +919876543210 stored hai — plus/symbols hatao
        const normalizedTo = phone.replace(/\D/g, '')
        return wa.sendTemplate({
          to: normalizedTo,
          templateName: resolvedTemplateName,
          components,
        })
      })

      externalMsgId = result.messageId
      if (result.status === 'failed') {
        sendStatus = 'failed'
        failedReason = result.error
      }
    } else if (stage.channel === 'voice') {
      // Trigger voice call via Inngest event.
      // NOTE: stage advance yahan NAHI hota — voiceCall function tabhi
      // currentStage badhati hai jab Exotel call place confirm kare.
      // (Pehle sirf event emit hone par stage consume ho jata tha.)
      await step.sendEvent('trigger-voice-call', {
        name: 'calls/trigger',
        data: { outstandingId, merchantId, customerId, retryCount: 0, advanceStage: true },
      })
    } else if (stage.channel === 'sms') {
      // Real SMS via MSG91 Flow API. Agar bheja nahi ja saka (template/flow
      // configured nahi, ya API fail) to sendStatus='failed' — stage advance
      // NAHI hoga aur agli nightly scan me dobara try hoga. Silent no-op nahi.
      const smsResult = await step.run('send-sms', async () => {
        const digits = outstanding.customer.phone.replace(/\D/g, '')
        return msg91SendSms(digits, {
          VAR1: outstanding.customer.name,
          VAR2: amountINR,
          VAR3: formatIndianDate(outstanding.dueDate),
          VAR4: outstanding.merchant.businessName,
        })
      })
      if (!smsResult.ok) {
        sendStatus = 'failed'
        failedReason = smsResult.error
        logger.warn('SMS reminder failed — stage not advanced, will retry next scan', {
          outstandingId,
          error: smsResult.error,
        })
      } else {
        externalMsgId = smsResult.messageId
      }
    } else if (stage.channel === 'escalate') {
      // Final escalation — notify merchant
      // NOTE: event naam 'outstandings/escalate' hona chahiye (escalate.ts isi ko sunta hai)
      await step.sendEvent('trigger-escalation', {
        name: 'outstandings/escalate',
        data: {
          outstandingId,
          merchantId,
          customerId,
          daysOverdue,
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
          templateName: stage.channel === 'whatsapp' ? resolvedTemplateName : stage.templateName,
          status: sendStatus,
          externalMsgId,
          failedReason,
        },
      })

      // Advance the stage counter — EXCEPT voice channel: uske liye
      // triggerVoiceCall (voiceCall.ts) stage badhata hai, tabhi jab Exotel
      // call place karne ki confirmation de de. Emission par advance karne se
      // failed/skipped call bhi stage kha jati thi.
      if (sendStatus === 'sent' && stage.channel !== 'voice') {
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
