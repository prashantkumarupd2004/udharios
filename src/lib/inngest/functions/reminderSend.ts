/**
 * Inngest: Send a staged reminder (WhatsApp/SMS/Voice/Escalate)
 */

import { inngest } from '@/lib/inngest/client'
import { prisma } from '@/lib/prisma'
import {
  getWhatsAppProvider,
  buildT1Polite,
  buildT2WithLink,
  buildT2WithUpiOrBank,
  buildMerchantPaymentInfo,
  buildT3Firm,
  buildT4Final,
  isOptOutMessage,
} from '@/lib/providers/WhatsappProvider'
import { getGateway, isGatewayReady } from '@/lib/payments'
import { decryptCredentials } from '@/lib/payments/crypto'
import type { GatewayId } from '@/lib/payments/types'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'
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
    // WhatsApp me bheja gaya actual template naam (fallback me T2_upi_bank ho sakta hai)
    let resolvedTemplateName = stage.templateName ?? 'T1_polite'

    if (stage.channel === 'whatsapp') {
      const wa = getWhatsAppProvider()
      const phone = outstanding.customer.phone

      let components: ReturnType<typeof buildT1Polite> = []

      // ---------------------------------------------------------------
      // Payment link ensure karo (T2 ke liye) — auto-create ya fallback
      // ---------------------------------------------------------------
      let paymentUrl: string | null = outstanding.paymentLink?.url ?? null
      let fallbackPaymentInfo: string | null = null

      const needsLink = stage.templateName === 'T2_with_link'

      if (needsLink && !paymentUrl) {
        // Pehle payment link banane ki koshish karo (merchant ke gateway se)
        paymentUrl = await step.run('ensure-payment-link', async () => {
          try {
            const m = outstanding.merchant
            const gatewayId = (m.paymentGateway ?? 'upi_vpa') as GatewayId
            if (!isGatewayReady(gatewayId)) return null

            let credentials: Record<string, string> = {}
            if (gatewayId === 'upi_vpa') {
              if (!m.upiVpa) return null
              credentials = { vpa: m.upiVpa }
            } else {
              if (!m.gatewayCredentials) return null
              try {
                credentials = decryptCredentials(m.gatewayCredentials)
              } catch {
                return null
              }
            }

            const gateway = getGateway(gatewayId)
            const amountPaise = Math.round(Number(outstanding.amount) * 100)
            const link = await gateway.createPaymentLink(
              {
                amount: amountPaise,
                description: `${m.businessName} — Udhaari Payment`,
                customerName: outstanding.customer.name,
                customerPhone: outstanding.customer.phone,
                referenceId: outstandingId,
                notes: { merchant_id: merchantId, outstanding_id: outstandingId },
                expiryDate: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
                callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success`,
              },
              credentials,
              m.gatewayTestMode ?? true,
            )

            // DB me save karo
            const saved = await prisma.paymentLink.upsert({
              where: { outstandingId },
              create: {
                merchantId,
                outstandingId,
                gateway: gatewayId,
                gatewayLinkId: link.linkId,
                url: link.shortUrl,
                shortUrl: link.shortUrl,
                amount: outstanding.amount,
                status: 'created',
              },
              update: {
                gateway: gatewayId,
                gatewayLinkId: link.linkId,
                url: link.shortUrl,
                shortUrl: link.shortUrl,
                status: 'created',
              },
            })
            logger.info('Auto-created payment link for reminder', {
              outstandingId,
              gateway: gatewayId,
            })
            // WhatsApp button ke liye redirect URL (Meta ko poora URL format chahiye)
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://udharios.vercel.app'
            return `${baseUrl}/p/${saved.id}`
          } catch (err) {
            logger.warn('Auto payment link failed — fallback to UPI/bank', {
              outstandingId,
              error: String(err).slice(0, 120),
            })
            return null
          }
        })

        // Link nahi bana to UPI/bank fallback
        if (!paymentUrl) {
          fallbackPaymentInfo = buildMerchantPaymentInfo(outstanding.merchant)
        }
      }

      // Bina gateway wale merchant ke liye alag Meta template hai (4 body
      // params, koi button nahi) — wahi naam bhejna zaroori hai.
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
          if (paymentUrl) {
            components = buildT2WithLink(
              outstanding.customer.name,
              amountINR,
              outstanding.invoiceNo ?? outstandingId.slice(0, 8),
              paymentUrl
            )
          } else if (fallbackPaymentInfo) {
            // Bina gateway wale merchant — UPI/bank details bhejo
            resolvedTemplateName = 'T2_upi_bank'
            components = buildT2WithUpiOrBank(
              outstanding.customer.name,
              amountINR,
              outstanding.invoiceNo ?? outstandingId.slice(0, 8),
              fallbackPaymentInfo
            )
          } else {
            // Kuch nahi hai to polite reminder bhej do
            components = buildT1Polite(
              outstanding.customer.name,
              outstanding.merchant.businessName,
              amountINR,
              formatIndianDate(outstanding.dueDate)
            )
          }
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
      // Trigger voice call via Inngest event
      await step.sendEvent('trigger-voice-call', {
        name: 'calls/trigger',
        data: { outstandingId, merchantId, customerId, retryCount: 0 },
      })
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
