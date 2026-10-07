/**
 * POST /api/webhooks/payment/[gateway] — Gateway-agnostic payment webhook
 *
 * Har gateway (razorpay/cashfree/payu/phonepe) ka webhook yahan aayega.
 * Flow:
 * 1. Raw body se signature verify karo (merchant ki keys se)
 * 2. Event parse karo → outstanding nikalo
 * 3. Payment received → outstanding ko paid mark karo
 *
 * Merchant identify kaise hota hai?
 * - Link create karte waqt notes me merchant_id daala tha
 * - Webhook payload se wahi nikalenge
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGateway } from '@/lib/payments'
import { decryptCredentials } from '@/lib/payments/crypto'
import type { GatewayId } from '@/lib/payments/types'
import { inngest } from '@/lib/inngest/client'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ gateway: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { gateway: gatewayParam } = await params
  const gatewayId = gatewayParam as GatewayId

  // Gateway valid hai?
  let gateway
  try {
    gateway = getGateway(gatewayId)
  } catch {
    return NextResponse.json({ error: 'Unknown gateway' }, { status: 404 })
  }

  // Raw body (signature ke liye)
  const rawBody = Buffer.from(await request.arrayBuffer())
  const rawString = rawBody.toString('utf-8')

  let payload: unknown
  try {
    payload = JSON.parse(rawString)
  } catch {
    // Kuch gateways form-data bhejte hain
    const form = await request.formData().catch(() => null)
    if (form) {
      payload = Object.fromEntries(form.entries())
    } else {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
  }

  // Event parse karo → merchant nikalo
  const event = gateway.parseWebhookEvent(payload)
  logger.info('Payment webhook received', { gateway: gatewayId, type: event.type })

  // Merchant dhoondo (payment link se)
  let merchantId: string | null = null
  let merchantCreds: Record<string, string> = {}

  if (event.gatewayLinkId) {
    const link = await prisma.paymentLink.findFirst({
      where: { gateway: gatewayId, gatewayLinkId: event.gatewayLinkId },
      include: { merchant: true },
    })
    if (link) {
      merchantId = link.merchantId
      try {
        merchantCreds = decryptCredentials(link.merchant.gatewayCredentials ?? '{}')
      } catch { /* ignore */ }
    }
  }

  // Fallback: notes me merchant_id ho sakta hai
  if (!merchantId) {
    const notes = (payload as { payload?: { payment_link?: { entity?: { notes?: { merchant_id?: string } } } } })
      ?.payload?.payment_link?.entity?.notes
    if (notes?.merchant_id) {
      merchantId = notes.merchant_id
      const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
      if (m?.gatewayCredentials) {
        try { merchantCreds = decryptCredentials(m.gatewayCredentials) } catch { /* ignore */ }
      }
    }
  }

  if (!merchantId) {
    logger.warn('Webhook: merchant nahi mila', { gateway: gatewayId })
    return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })
  }

  // Signature verify karo
  // NOTE: Cashfree ka scheme hai HMAC(secret, timestamp + body)
  // Isliye Cashfree ke liye timestamp header ko body ke aage jodna padta hai
  const sigHeader =
    request.headers.get('x-razorpay-signature') ??
    request.headers.get('x-webhook-signature') ??
    request.headers.get('x-verify') ??
    ''
  let verifyBody: Buffer | string = rawBody
  if (gatewayId === 'cashfree') {
    const timestamp = request.headers.get('x-webhook-timestamp') ?? ''
    verifyBody = timestamp + rawString
  }
  if (sigHeader && !gateway.verifyWebhookSignature(verifyBody, sigHeader, merchantCreds)) {
    logger.warn('Webhook signature mismatch', { gateway: gatewayId, merchantId })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Payment received → outstanding paid mark karo
  if (event.type === 'link.paid' || event.type === 'payment.captured') {
    await handlePaymentSuccess(merchantId, event, gatewayId)
  }

  return NextResponse.json({ received: true })
}

async function handlePaymentSuccess(
  merchantId: string,
  event: { gatewayLinkId?: string; gatewayPaymentId: string; amount: number; referenceId?: string },
  gatewayId: string,
) {
  // Outstanding dhoondo
  let outstandingId = event.referenceId
  if (!outstandingId && event.gatewayLinkId) {
    const link = await prisma.paymentLink.findFirst({
      where: { gateway: gatewayId, gatewayLinkId: event.gatewayLinkId },
    })
    outstandingId = link?.outstandingId ?? undefined
  }
  if (!outstandingId) {
    logger.warn('Webhook: outstanding nahi mila', { gateway: gatewayId })
    return
  }

  const outstanding = await prisma.outstanding.findFirst({
    where: { id: outstandingId, merchantId },
  })
  if (!outstanding || outstanding.status === 'paid') return

  // Amount tolerance: ±₹1 (100 paise)
  const expectedPaise = Math.round(outstanding.amount.toNumber() * 100)
  if (Math.abs(event.amount - expectedPaise) > 100) {
    logger.warn('Webhook: amount mismatch', {
      expected: expectedPaise,
      got: event.amount,
      outstandingId,
    })
    // Flag karo, auto-paid mat karo
    await appendAuditLog({
      merchantId,
      actor: 'system',
      action: AUDIT_ACTIONS.PAYMENT_LINK_CREATED,
      entity: 'outstanding',
      entityId: outstandingId,
      payload: { warning: 'amount_mismatch', expected: expectedPaise, got: event.amount },
    })
    return
  }

  // Paid mark karo
  await prisma.outstanding.update({
    where: { id: outstandingId },
    data: { status: 'paid', paidAt: new Date() },
  })
  await prisma.paymentLink.updateMany({
    where: { outstandingId },
    data: { status: 'paid' },
  })

  // Reminder jobs cancel karo
  try {
    await inngest.send({
      name: 'payment.received',
      data: { merchantId, outstandingId, gateway: gatewayId },
    })
  } catch { /* inngest optional */ }

  await appendAuditLog({
    merchantId,
    actor: 'system',
    action: 'payment.received',
    entity: 'outstanding',
    entityId: outstandingId,
    payload: {
      gateway: gatewayId,
      gatewayPaymentId: event.gatewayPaymentId,
      amount: event.amount / 100,
    },
  })

  logger.info('Outstanding marked paid via webhook', { outstandingId, gateway: gatewayId })
}
