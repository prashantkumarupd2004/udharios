/**
 * AI Voice Agent brain for Udhari OS (M7)
 * Runs the conversation logic during an Exotel call.
 * Uses Sarvam STT to transcribe customer speech, processes intent,
 * and responds via Sarvam TTS.
 *
 * Called by the Exotel webhook when:
 * 1. Call is answered
 * 2. Customer speaks (audio chunk arrives)
 */

import { transcribeAudio, synthesizeSpeech } from '@/lib/sarvam'
import { parseHindiDateExpression, formatINR, formatIndianDate } from '@/lib/date-utils'
import { getWhatsAppProvider, buildT2WithLink } from '@/lib/providers/WhatsappProvider'
import { prisma } from '@/lib/prisma'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

export type VoiceAgentOutcome =
  | 'promised'
  | 'disputed'
  | 'no_answer'
  | 'paid_already'
  | 'failed'
  | 'ongoing'

export interface VoiceAgentContext {
  callId: string
  outstandingId: string
  merchantId: string
  customerId: string
  merchantName: string
  customerName: string
  amountINR: string
  daysOverdue: number
  paymentLinkUrl?: string
}

export interface VoiceAgentTurn {
  customerSpeech: string
  agentResponse: string
  outcome?: VoiceAgentOutcome
  promisedDate?: string
  disputeReason?: string
}

// ---------------------------------------------------------------------------
// Script templates (Hindi — warm but firm)
// ---------------------------------------------------------------------------

function getOpeningScript(ctx: VoiceAgentContext): string {
  return `Namaste! Main ${ctx.merchantName} ki taraf se ek automated reminder call kar raha hun. ${ctx.customerName} ji se baat ho rahi hai?`
}

function getPaymentReminderScript(ctx: VoiceAgentContext): string {
  return `Aapka ${ctx.amountINR} ka payment ${ctx.daysOverdue} din se pending hai. Kya aap aaj payment kar payenge, ya koi date dena chahenge?`
}

function getPromiseAckScript(date: string): string {
  return `Theek hai, ${date} tak ka note kar liya hai. Us din subah hum aapko yaad dila denge. Dhanyavaad!`
}

function getPayNowScript(): string {
  return `Bahut badhiya! Maine aapke WhatsApp par payment link bhej diya hai. Dhanyavaad!`
}

function getDisputeAckScript(merchantName: string): string {
  return `Samajh gaya. Maine aapki baat ${merchantName} tak pahuncha di hai, wo khud aapse baat karenge. Shukriya.`
}

function getAngryCallEndScript(merchantName: string): string {
  return `Maafi chahunga. Main call yahin samapt karta hun, ${merchantName} khud sampark karenge.`
}

function getNoAnswerScript(): string {
  return `Koi jawab nahi mila. Hum baad mein dobara try karenge.`
}

// ---------------------------------------------------------------------------
// Intent detection from customer speech
// ---------------------------------------------------------------------------

interface DetectedIntent {
  type: 'confirm_payment' | 'give_date' | 'dispute' | 'angry' | 'unknown'
  promisedDate?: Date
  disputeKeywords?: string[]
}

function detectIntent(text: string, ctx: VoiceAgentContext): DetectedIntent {
  const normalized = text.toLowerCase()

  // Check for angry/abusive signals
  const angryKeywords = [
    'bakwaas', 'chup', 'pareshan', 'tang', 'galiya', 'gaali',
    'shut up', 'stop calling', 'harassment', 'police', 'court',
  ]
  if (angryKeywords.some(kw => normalized.includes(kw))) {
    return { type: 'angry' }
  }

  // Check for dispute keywords
  const disputeKeywords = [
    'defective', 'kharab', 'maal kharab', 'galat bill', 'zyada',
    'nahi mila', 'deliver nahi', 'problem', 'dikkat', 'complaint',
    'returned', 'wapas kiya', 'refund',
  ]
  const foundDispute = disputeKeywords.filter(kw => normalized.includes(kw))
  if (foundDispute.length > 0) {
    return { type: 'dispute', disputeKeywords: foundDispute }
  }

  // Check for payment confirmation
  const paymentKeywords = [
    'abhi karta', 'abhi kartaa', 'pay karta', 'pay kar leta', 'bhejna',
    'aaj kar dunga', 'aaj kar deta', 'turant', 'abhi', 'link bhejo',
    'ha', 'haan', 'yes', 'ji haan', 'theek hai abhi',
  ]
  if (paymentKeywords.some(kw => normalized.includes(kw))) {
    return { type: 'confirm_payment' }
  }

  // Check for a date promise
  const dateExpr = extractDateExpression(normalized)
  if (dateExpr) {
    const parsedDate = parseHindiDateExpression(dateExpr)
    if (parsedDate) {
      return { type: 'give_date', promisedDate: parsedDate }
    }
  }

  return { type: 'unknown' }
}

function extractDateExpression(text: string): string | null {
  const patterns = [
    /\b(kal)\b/,
    /\b(parso)\b/,
    /\b(shukravaar|somvaar|mangalvaar|budhvaar|guruvaar|shanivaar|ravivaar|itvaar)\b/,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /(\d{1,2}\s*(?:tarikh|taarikh|th|st|nd|rd|ko))/,
    /\b(is\s+(?:shukravaar|somvaar|mangalvaar|budhvaar|guruvaar|shanivaar|ravivaar))\b/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[0]
  }
  return null
}

// ---------------------------------------------------------------------------
// Main voice agent turn processor
// ---------------------------------------------------------------------------

export async function processVoiceAgentTurn(
  audioBuffer: Buffer | null,
  ctx: VoiceAgentContext,
  turnIndex: number
): Promise<VoiceAgentTurn> {

  // Turn 0: Opening greeting
  if (turnIndex === 0 || audioBuffer === null) {
    const agentText = getOpeningScript(ctx)
    return { customerSpeech: '', agentResponse: agentText, outcome: 'ongoing' }
  }

  // Transcribe customer speech
  let customerSpeech = ''
  try {
    const stt = await transcribeAudio(audioBuffer)
    customerSpeech = stt.transcript
    logger.info('Voice agent STT', { callId: ctx.callId, speech: customerSpeech })
  } catch (err) {
    logger.error('STT failed during voice call', { callId: ctx.callId, error: String(err) })
    return {
      customerSpeech: '',
      agentResponse: getNoAnswerScript(),
      outcome: 'failed',
    }
  }

  // Turn 1: Customer confirms identity; deliver payment reminder
  if (turnIndex === 1) {
    const agentText = getPaymentReminderScript(ctx)
    return { customerSpeech, agentResponse: agentText, outcome: 'ongoing' }
  }

  // Turn 2+: Process customer response
  const intent = detectIntent(customerSpeech, ctx)

  switch (intent.type) {
    case 'angry': {
      // Log escalation, end call politely
      await createDispute(ctx, 'Angry during voice call')
      return {
        customerSpeech,
        agentResponse: getAngryCallEndScript(ctx.merchantName),
        outcome: 'disputed',
        disputeReason: 'Customer became angry during call',
      }
    }

    case 'dispute': {
      const reason = intent.disputeKeywords?.join(', ') ?? 'Dispute raised during call'
      await createDispute(ctx, reason)
      return {
        customerSpeech,
        agentResponse: getDisputeAckScript(ctx.merchantName),
        outcome: 'disputed',
        disputeReason: reason,
      }
    }

    case 'confirm_payment': {
      // Send WhatsApp payment link immediately
      if (ctx.paymentLinkUrl) {
        try {
          const wa = getWhatsAppProvider()
          await wa.sendTemplate({
            to: await getCustomerPhone(ctx.customerId),
            templateName: process.env.WA_TEMPLATE_ID_T2 ?? 'T2_with_link',
            components: buildT2WithLink(
              ctx.customerName,
              ctx.amountINR,
              ctx.outstandingId,
              ctx.paymentLinkUrl
            ),
          })
        } catch (err) {
          logger.error('Failed to send payment link after voice confirm', { error: String(err) })
        }
      }
      return {
        customerSpeech,
        agentResponse: getPayNowScript(),
        outcome: 'paid_already', // will be updated by Razorpay webhook when actual payment arrives
      }
    }

    case 'give_date': {
      if (intent.promisedDate) {
        await createPromise(ctx, intent.promisedDate)
        const dateStr = formatIndianDate(intent.promisedDate)
        return {
          customerSpeech,
          agentResponse: getPromiseAckScript(dateStr),
          outcome: 'promised',
          promisedDate: intent.promisedDate.toISOString(),
        }
      }
      break
    }

    default:
      break
  }

  // Unknown — ask again politely (max 1 retry)
  return {
    customerSpeech,
    agentResponse: `Maafi, main samajh nahi paya. Kya aap ${ctx.amountINR} ka payment ${ctx.daysOverdue} din se overdue hai. Aap koi date de sakte hain?`,
    outcome: 'ongoing',
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function createPromise(ctx: VoiceAgentContext, promisedDate: Date): Promise<void> {
  try {
    await prisma.promise.create({
      data: {
        outstandingId: ctx.outstandingId,
        customerId: ctx.customerId,
        merchantId: ctx.merchantId,
        promisedDate,
        source: 'voice',
        status: 'open',
      },
    })

    await prisma.outstanding.update({
      where: { id: ctx.outstandingId },
      data: { status: 'promised' },
    })

    await appendAuditLog({
      merchantId: ctx.merchantId,
      actor: 'system:voice-agent',
      action: AUDIT_ACTIONS.PROMISE_CREATED,
      entity: 'outstanding',
      entityId: ctx.outstandingId,
      payload: { promisedDate, source: 'voice' },
    })
  } catch (err) {
    logger.error('Failed to create promise from voice call', { error: String(err) })
  }
}

async function createDispute(ctx: VoiceAgentContext, reason: string): Promise<void> {
  try {
    await prisma.dispute.create({
      data: {
        outstandingId: ctx.outstandingId,
        customerId: ctx.customerId,
        merchantId: ctx.merchantId,
        reason,
        status: 'open',
      },
    })

    await prisma.outstanding.update({
      where: { id: ctx.outstandingId },
      data: { status: 'disputed' },
    })

    // Create merchant notification
    await prisma.merchantNotification.create({
      data: {
        merchantId: ctx.merchantId,
        type: 'escalation',
        title: `${ctx.customerName} ne dispute kiya`,
        body: `Voice call me ${ctx.customerName} ne problem bataya: "${reason}". Aap khud baat karein.`,
        entityId: ctx.outstandingId,
        entityType: 'outstanding',
      },
    })

    await appendAuditLog({
      merchantId: ctx.merchantId,
      actor: 'system:voice-agent',
      action: AUDIT_ACTIONS.DISPUTE_OPENED,
      entity: 'outstanding',
      entityId: ctx.outstandingId,
      payload: { reason, source: 'voice' },
    })
  } catch (err) {
    logger.error('Failed to create dispute from voice call', { error: String(err) })
  }
}

async function getCustomerPhone(customerId: string): Promise<string> {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { phone: true },
  })
  return customer.phone
}

// ---------------------------------------------------------------------------
// Synthesize agent response to audio (for Exotel passthrough TTS)
// ---------------------------------------------------------------------------

export async function synthesizeAgentResponse(text: string): Promise<Buffer> {
  const { audioBase64 } = await synthesizeSpeech(text, 'meera', 'hi-IN', 0.9)
  return Buffer.from(audioBase64, 'base64')
}
