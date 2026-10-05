/**
 * POST /api/webhooks/whatsapp — WhatsApp message webhook (M5)
 * GET /api/webhooks/whatsapp — Webhook verification challenge
 *
 * Handles:
 * - Delivery status updates (delivered, read, failed)
 * - Interactive button responses (Pay Now, Date Do, Problem Hai)
 * - Text replies (opt-out detection, date promises, disputes)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  isOptOutMessage,
  isDisputeMessage,
  getWhatsAppProvider,
} from '@/lib/providers/WhatsappProvider'
import { parseHindiDateExpression } from '@/lib/date-utils'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET — WhatsApp webhook verification challenge
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified')
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ---------------------------------------------------------------------------
// POST — Incoming messages and status updates
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const provider = process.env.WHATSAPP_PROVIDER ?? 'aisensy'

    // Normalize payload to a common structure
    const messages = normalizePayload(body, provider)

    for (const msg of messages) {
      await processMessage(msg)
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    logger.error('WhatsApp webhook error', { error: String(err) })
    return NextResponse.json({ received: true }) // Always 200 to avoid retry loops
  }
}

// ---------------------------------------------------------------------------
// Normalize different provider payloads into a common format
// ---------------------------------------------------------------------------

interface NormalizedMessage {
  type: 'text' | 'button' | 'status'
  from: string          // customer phone
  text?: string
  buttonId?: string     // "PAY_NOW" | "DATE_DO" | "PROBLEM_HAI"
  messageId?: string    // WhatsApp message ID (for status updates)
  status?: string       // "delivered" | "read" | "failed"
  statusFor?: string    // message ID the status is for
}

function normalizePayload(body: Record<string, unknown>, provider: string): NormalizedMessage[] {
  const messages: NormalizedMessage[] = []

  // Meta/official Cloud API format
  if (provider === 'official' || provider === 'meta') {
    const entries = (body.entry as unknown[]) ?? []
    for (const entry of entries) {
      const e = entry as Record<string, unknown>
      const changes = (e.changes as unknown[]) ?? []
      for (const change of changes) {
        const ch = change as Record<string, unknown>
        const value = ch.value as Record<string, unknown>

        // Status updates
        if (value.statuses) {
          for (const s of value.statuses as unknown[]) {
            const status = s as Record<string, unknown>
            messages.push({
              type: 'status',
              from: status.recipient_id as string,
              statusFor: status.id as string,
              status: status.status as string,
            })
          }
        }

        // Incoming messages
        if (value.messages) {
          for (const m of value.messages as unknown[]) {
            const msg = m as Record<string, unknown>
            const from = msg.from as string

            if (msg.type === 'text') {
              messages.push({
                type: 'text',
                from,
                messageId: msg.id as string,
                text: (msg.text as Record<string, string>)?.body,
              })
            } else if (msg.type === 'interactive') {
              const interactive = msg.interactive as Record<string, unknown>
              if (interactive.type === 'button_reply') {
                const reply = interactive.button_reply as Record<string, string>
                messages.push({
                  type: 'button',
                  from,
                  messageId: msg.id as string,
                  buttonId: reply.id,
                  text: reply.title,
                })
              }
            }
          }
        }
      }
    }
  }

  // AiSensy / other BSP format (simplified)
  if (provider === 'aisensy' || provider === 'gupshup') {
    const msgData = body as Record<string, unknown>
    const from = (msgData.mobile ?? msgData.from ?? '') as string
    const text = (msgData.message ?? msgData.text ?? '') as string
    const buttonId = (msgData.buttonId ?? msgData.button_id ?? '') as string
    const msgId = (msgData.messageId ?? msgData.id ?? '') as string
    const status = (msgData.status ?? '') as string

    if (status && ['delivered', 'read', 'failed'].includes(status)) {
      messages.push({ type: 'status', from, statusFor: msgId, status })
    } else if (buttonId) {
      messages.push({ type: 'button', from, messageId: msgId, buttonId })
    } else if (text) {
      messages.push({ type: 'text', from, messageId: msgId, text })
    }
  }

  return messages
}

// ---------------------------------------------------------------------------
// Process each normalized message
// ---------------------------------------------------------------------------

async function processMessage(msg: NormalizedMessage) {
  // Handle delivery status updates
  if (msg.type === 'status' && msg.statusFor) {
    await updateDeliveryStatus(msg.statusFor, msg.status ?? '')
    return
  }

  // Look up customer by phone
  const phone = normalizePhone(msg.from)
  const customer = await prisma.customer.findFirst({
    where: { phone: { endsWith: phone.slice(-10) } },
    include: { merchant: true },
  })

  if (!customer) {
    logger.warn('WhatsApp message from unknown customer', { phone })
    return
  }

  const merchantId = customer.merchantId

  // Handle opt-out
  if (msg.text && isOptOutMessage(msg.text)) {
    await handleOptOut(customer.id, merchantId, phone)
    return
  }

  // Find the latest unpaid outstanding for this customer
  const outstanding = await prisma.outstanding.findFirst({
    where: {
      customerId: customer.id,
      status: { in: ['upcoming', 'overdue', 'promised'] },
    },
    orderBy: { dueDate: 'asc' },
    include: { paymentLink: true },
  })

  if (!outstanding) return

  // Handle interactive button responses
  if (msg.type === 'button' && msg.buttonId) {
    await handleButtonResponse(
      msg.buttonId,
      customer,
      outstanding,
      merchantId
    )
    return
  }

  // Handle text — check for dispute keywords or date promise
  if (msg.text) {
    if (isDisputeMessage(msg.text)) {
      await handleDispute(customer, outstanding, merchantId, msg.text)
      return
    }

    // Try to parse a date promise
    const parsedDate = parseHindiDateExpression(msg.text)
    if (parsedDate) {
      await handleDatePromise(customer, outstanding, merchantId, parsedDate)
      return
    }
  }
}

async function handleButtonResponse(
  buttonId: string,
  customer: { id: string; name: string; phone: string; merchant: { businessName: string } },
  outstanding: { id: string; amount: { toNumber: () => number }; customerId: string; merchantId: string; paymentLink: { url: string } | null },
  merchantId: string
) {
  switch (buttonId.toUpperCase()) {
    case 'PAY_NOW': {
      // Send payment link
      const wa = getWhatsAppProvider()
      const url = outstanding.paymentLink?.url ?? ''
      if (url) {
        await wa.sendText(customer.phone, `Payment link: ${url}`)
      }
      break
    }

    case 'DATE_DO': {
      // Ask for the date
      const wa = getWhatsAppProvider()
      await wa.sendText(
        customer.phone,
        'Kaunsi date tak payment karenge? Reply mein date bataiye (e.g. "5 tarikh", "shukravaar", "kal")'
      )
      break
    }

    case 'PROBLEM_HAI': {
      // Create dispute
      await handleDispute(
        customer,
        outstanding,
        merchantId,
        'Customer clicked "Problem Hai" button'
      )
      break
    }
  }
}

async function handleOptOut(customerId: string, merchantId: string, phone: string) {
  await prisma.customer.update({
    where: { id: customerId },
    data: { optedOut: true, optedOutAt: new Date() },
  })

  // Send one-time confirmation (mandatory)
  const wa = getWhatsAppProvider()
  await wa.sendText(
    phone,
    'Aapki request par amal kiya gaya. Ab hum aapko koi reminder nahi bhejenge. Shukriya.'
  )

  await appendAuditLog({
    merchantId,
    actor: 'customer',
    action: AUDIT_ACTIONS.CUSTOMER_OPTED_OUT,
    entity: 'customer',
    entityId: customerId,
    payload: { phone },
  })

  logger.info('Customer opted out', { customerId, merchantId })
}

async function handleDatePromise(
  customer: { id: string; name: string },
  outstanding: { id: string; merchantId: string },
  merchantId: string,
  promisedDate: Date
) {
  await prisma.promise.create({
    data: {
      outstandingId: outstanding.id,
      customerId: customer.id,
      merchantId,
      promisedDate,
      source: 'whatsapp',
      status: 'open',
    },
  })

  await prisma.outstanding.update({
    where: { id: outstanding.id },
    data: { status: 'promised' },
  })

  // Schedule promise follow-up
  await inngest.send({
    name: 'promises/follow-up',
    data: {
      outstandingId: outstanding.id,
      merchantId,
      promiseId: '', // Will be retrieved in the function
    },
  })

  await appendAuditLog({
    merchantId,
    actor: 'customer',
    action: AUDIT_ACTIONS.PROMISE_CREATED,
    entity: 'outstanding',
    entityId: outstanding.id,
    payload: { promisedDate, source: 'whatsapp' },
  })

  logger.info('Promise created from WhatsApp', {
    outstandingId: outstanding.id,
    customerId: customer.id,
    promisedDate,
  })
}

async function handleDispute(
  customer: { id: string; name: string; merchant: { businessName: string } },
  outstanding: { id: string; merchantId: string; amount: { toNumber: () => number } },
  merchantId: string,
  reason: string
) {
  await prisma.dispute.create({
    data: {
      outstandingId: outstanding.id,
      customerId: customer.id,
      merchantId,
      reason,
      status: 'open',
    },
  })

  await prisma.outstanding.update({
    where: { id: outstanding.id },
    data: { status: 'disputed' },
  })

  await prisma.merchantNotification.create({
    data: {
      merchantId,
      type: 'escalation',
      title: `${customer.name} ne dispute kiya`,
      body: `${customer.name} ne WhatsApp par problem bataya: "${reason.slice(0, 100)}". Aap khud baat karein.`,
      entityId: outstanding.id,
      entityType: 'outstanding',
    },
  })

  await appendAuditLog({
    merchantId,
    actor: 'customer',
    action: AUDIT_ACTIONS.DISPUTE_OPENED,
    entity: 'outstanding',
    entityId: outstanding.id,
    payload: { reason, source: 'whatsapp' },
  })
}

async function updateDeliveryStatus(externalMsgId: string, status: string) {
  const statusMap: Record<string, string> = {
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
    sent: 'sent',
  }

  const mappedStatus = statusMap[status]
  if (!mappedStatus) return

  await prisma.reminderLog.updateMany({
    where: { externalMsgId },
    data: {
      status: mappedStatus as 'sent' | 'delivered' | 'read' | 'failed',
      deliveredAt: status === 'delivered' ? new Date() : undefined,
      readAt: status === 'read' ? new Date() : undefined,
    },
  })
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}
