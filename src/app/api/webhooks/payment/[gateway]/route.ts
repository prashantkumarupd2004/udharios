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
import type { Prisma } from '@prisma/client'
import { getGateway } from '@/lib/payments'
import { decryptCredentials } from '@/lib/payments/crypto'
import type { GatewayId } from '@/lib/payments/types'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { formatINR } from '@/lib/date-utils'

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

  // Raw body (signature ke liye) — body sirf EK baar padh sakte hain.
  // Isliye pehle text me lo, phir content-type ke hisaab se parse karo.
  // NOTE: body consume karne ke baad request.formData() dobara kaam nahi
  // karta — isliye form-encoded (PayU surl/furl) ko rawString se hi parse karo.
  const contentType = request.headers.get('content-type') ?? ''
  let rawString: string
  let payload: unknown

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    payload = Object.fromEntries(form.entries())
    rawString = JSON.stringify(payload)
  } else {
    rawString = await request.text()
    if (contentType.includes('application/x-www-form-urlencoded')) {
      // PayU surl/furl POST — form-encoded body
      payload = Object.fromEntries(new URLSearchParams(rawString).entries())
    } else {
      try {
        payload = JSON.parse(rawString)
      } catch {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
      }
    }
  }
  const rawBody = Buffer.from(rawString, 'utf-8')

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
  let sigHeader =
    request.headers.get('x-razorpay-signature') ??
    request.headers.get('x-webhook-signature') ??
    request.headers.get('x-verify') ??
    ''
  let verifyBody: Buffer | string = rawBody
  if (gatewayId === 'cashfree') {
    const timestamp = request.headers.get('x-webhook-timestamp') ?? ''
    verifyBody = timestamp + rawString
  }
  if (gatewayId === 'payu') {
    // PayU ka 'hash' body ke ANDAR hota hai (koi signature header nahi aata).
    // Adapter verifyWebhookSignature khud URL-encoded body se fields nikalta
    // hai — isliye rawString hi pass karo, hash ko signature ki tarah treat karo.
    const inBodyHash = (payload as Record<string, string> | null)?.hash ?? ''
    if (inBodyHash) sigHeader = inBodyHash
    verifyBody = rawString
  }
  if (sigHeader && !gateway.verifyWebhookSignature(verifyBody, sigHeader, merchantCreds)) {
    logger.warn('Webhook signature mismatch', { gateway: gatewayId, merchantId })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Production me bina signature ke webhook accept mat karo —
  // warna koi bhi fake POST se outstanding "paid" mark kar sakta hai!
  if (!sigHeader && process.env.NODE_ENV === 'production') {
    logger.warn('Webhook without signature rejected (production)', { gateway: gatewayId })
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }
  if (!sigHeader) {
    logger.warn('Webhook without signature (non-production, allowed)', { gateway: gatewayId })
  }

  // Payment received → outstanding paid mark karo
  if (event.type === 'link.paid' || event.type === 'payment.captured') {
    await handlePaymentSuccess(merchantId, event, gatewayId)
  }

  return NextResponse.json({ received: true })
}

interface PaymentSuccessEvent {
  gatewayLinkId?: string
  gatewayPaymentId: string
  amount: number // paise me
  referenceId?: string
  rawPayload?: unknown
}

async function handlePaymentSuccess(
  merchantId: string,
  event: PaymentSuccessEvent,
  gatewayId: string,
) {
  // Outstanding dhoondo — pehle referenceId (notes/udf1), phir link se
  let outstandingId = event.referenceId
  let link: { id: string; outstandingId: string; expiresAt: Date | null } | null = null
  if (event.gatewayLinkId) {
    link = await prisma.paymentLink.findFirst({
      where: { gateway: gatewayId, gatewayLinkId: event.gatewayLinkId },
      select: { id: true, outstandingId: true, expiresAt: true },
    })
    if (link && !outstandingId) outstandingId = link.outstandingId
  }
  if (!outstandingId) {
    logger.warn('Webhook: outstanding nahi mila', { gateway: gatewayId })
    return
  }

  // Expired link ke against payment — khud enforce karo.
  // (Kuch gateways expiry ignore karte hain, e.g. PhonePe; PayU khud
  // validation_period handle karta hai, lekin yahan double-check safe hai.)
  if (link?.expiresAt && link.expiresAt.getTime() < Date.now()) {
    await prisma.paymentLink.updateMany({
      where: { outstandingId },
      data: { status: 'expired' },
    })
    logger.warn('Webhook: expired link ke against payment — ignore', {
      gateway: gatewayId,
      outstandingId,
    })
    await appendAuditLog({
      merchantId,
      actor: 'system',
      action: AUDIT_ACTIONS.PAYMENT_LINK_EXPIRED,
      entity: 'outstanding',
      entityId: outstandingId,
      payload: { gateway: gatewayId, gatewayPaymentId: event.gatewayPaymentId },
    })
    return
  }

  const outstanding = await prisma.outstanding.findFirst({
    where: { id: outstandingId, merchantId },
    include: {
      merchant: { select: { businessName: true } },
      customer: { select: { name: true } },
    },
  })
  if (!outstanding || outstanding.status === 'paid') return

  // IDEMPOTENCY: kya ye gateway payment pehle process ho chuka hai?
  // Payment.razorpayPaymentId column unique hai — har gateway ka payment id
  // yahin store hota hai (tally receipts bhi yahi pattern use karte hain).
  const paymentKey = event.gatewayPaymentId || `${gatewayId}_${outstandingId}_${event.amount}`
  const existingPayment = await prisma.payment.findUnique({
    where: { razorpayPaymentId: paymentKey },
  })
  if (existingPayment) {
    logger.info('Duplicate payment webhook — no-op', { gateway: gatewayId, paymentKey })
    return
  }

  // Amount tolerance: ±₹1 (100 paise)
  const expectedPaise = Math.round(outstanding.amount.toNumber() * 100)
  const needsReview = Math.abs(event.amount - expectedPaise) > 100

  // Payment row banao (legacy razorpay webhook route ki tarah)
  await prisma.payment.create({
    data: {
      razorpayPaymentId: paymentKey,
      merchantId,
      outstandingId,
      amount: event.amount / 100,
      method: gatewayId,
      paidAt: new Date(),
      needsReview,
      raw: (event.rawPayload ?? {}) as unknown as Prisma.InputJsonValue,
    },
  })

  if (!needsReview) {
    // Paid mark karo
    await prisma.outstanding.update({
      where: { id: outstandingId },
      data: { status: 'paid', paidAt: new Date() },
    })
    await prisma.paymentLink.updateMany({
      where: { outstandingId },
      data: { status: 'paid' },
    })

    // Khule promises → kept (legacy route ki tarah)
    await prisma.promise.updateMany({
      where: { outstandingId, status: 'open' },
      data: { status: 'kept' },
    })

    // Reminder jobs cancel karo — NOTE: koi listener nahi hai is event ka;
    // engine DB status guard (upcoming|overdue) se khud ruk jaata hai,
    // isliye dead send hata diya gaya.

    // Merchant notification (legacy route ki tarah)
    const amountINR = formatINR(event.amount / 100)
    await prisma.merchantNotification.create({
      data: {
        merchantId,
        type: 'payment_received',
        title: `Payment mil gaya! ₹${amountINR} ✓`,
        body: `${outstanding.customer.name} ne ₹${amountINR} ka payment kar diya. Outstanding clear ho gaya.`,
        entityId: outstandingId,
        entityType: 'outstanding',
      },
    })

    await appendAuditLog({
      merchantId,
      actor: 'system',
      action: AUDIT_ACTIONS.PAYMENT_RECEIVED,
      entity: 'outstanding',
      entityId: outstandingId,
      payload: {
        gateway: gatewayId,
        gatewayPaymentId: event.gatewayPaymentId,
        amount: event.amount / 100,
      },
    })

    logger.info('Outstanding marked paid via webhook', { outstandingId, gateway: gatewayId })
  } else {
    // Amount mismatch — auto-paid mat karo, manual review ke liye flag karo
    // (legacy razorpay webhook route ki tarah)
    logger.warn('Webhook: amount mismatch', {
      expected: expectedPaise,
      got: event.amount,
      outstandingId,
    })
    await appendAuditLog({
      merchantId,
      actor: 'system',
      action: AUDIT_ACTIONS.PAYMENT_MISMATCH,
      entity: 'outstanding',
      entityId: outstandingId,
      payload: {
        warning: 'amount_mismatch',
        gateway: gatewayId,
        gatewayPaymentId: event.gatewayPaymentId,
        expected: expectedPaise,
        got: event.amount,
      },
    })
    await prisma.merchantNotification.create({
      data: {
        merchantId,
        type: 'payment_received',
        title: '⚠️ Payment mismatch — manual review needed',
        body: `${outstanding.customer.name} ne ₹${event.amount / 100} bheja, expected ₹${expectedPaise / 100}. Manual review karein.`,
        entityId: outstandingId,
        entityType: 'outstanding',
      },
    })
  }
}
