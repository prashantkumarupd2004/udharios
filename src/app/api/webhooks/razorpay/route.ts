/**
 * POST /api/webhooks/razorpay — Payment webhook handler (M6)
 *
 * CRITICAL SECURITY RULES (from spec §9):
 * 1. Verify signature with RAW body BEFORE parsing JSON
 * 2. Idempotency: unique on razorpay_payment_id
 * 3. Amount tolerance: ±₹1 — mismatch → flag, do NOT auto-mark paid
 * 4. After marking paid: cancel Inngest jobs + audit log + merchant notification
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRazorpayWebhookSignature } from '@/lib/razorpay'
import { inngest } from '@/lib/inngest/client'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { formatINR } from '@/lib/date-utils'

// IMPORTANT: Disable body parsing — we need raw bytes for signature verification
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Step 1: Read raw body as buffer
  const rawBody = await request.arrayBuffer()
  const rawBodyBuffer = Buffer.from(rawBody)
  const rawBodyString = rawBodyBuffer.toString('utf-8')

  // Step 2: Verify webhook signature BEFORE parsing JSON
  const signature = request.headers.get('x-razorpay-signature') ?? ''

  if (!verifyRazorpayWebhookSignature(rawBodyBuffer, signature)) {
    logger.warn('Razorpay webhook signature mismatch', {
      ip: request.headers.get('x-forwarded-for'),
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Step 3: Parse JSON payload
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBodyString)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = payload.event as string
  logger.info('Razorpay webhook received', { event })

  // Handle payment events
  if (event === 'payment_link.paid' || event === 'payment.captured') {
    await handlePaymentReceived(payload)
  } else if (event === 'subscription.activated') {
    await handleSubscriptionActivated(payload)
  } else if (event === 'subscription.charged') {
    await handleSubscriptionCharged(payload)
  } else if (event === 'subscription.cancelled') {
    await handleSubscriptionCancelled(payload)
  } else if (event === 'subscription.halted') {
    await handleSubscriptionHalted(payload)
  }

  // Always return 200 to acknowledge receipt
  return NextResponse.json({ received: true })
}

async function handlePaymentReceived(payload: Record<string, unknown>) {
  const paymentEntity = (payload.payload as Record<string, unknown>)?.payment as Record<string, unknown>
  const paymentLinkEntity = (payload.payload as Record<string, unknown>)?.payment_link as Record<string, unknown>

  if (!paymentEntity?.entity) return

  const payment = paymentEntity.entity as Record<string, unknown>
  const razorpayPaymentId = payment.id as string
  const razorpayOrderId = payment.order_id as string

  // Extract notes (set when we created the payment link)
  const notes = (payment.notes ?? {}) as Record<string, string>
  const merchantId = notes.merchant_id
  const outstandingId = notes.outstanding_id

  if (!merchantId || !outstandingId) {
    logger.warn('Payment webhook missing merchant_id/outstanding_id in notes', {
      razorpayPaymentId,
    })
    return
  }

  // IDEMPOTENCY: Check if we already processed this payment
  const existingPayment = await prisma.payment.findUnique({
    where: { razorpayPaymentId },
  })

  if (existingPayment) {
    logger.info('Duplicate payment webhook — no-op', { razorpayPaymentId })
    return // 200 already sent above; this is a no-op
  }

  // Fetch outstanding to verify amount
  const outstanding = await prisma.outstanding.findUnique({
    where: { id: outstandingId },
    include: {
      merchant: { select: { businessName: true } },
      customer: { select: { name: true } },
    },
  })

  if (!outstanding) {
    logger.warn('Outstanding not found for payment', { outstandingId, razorpayPaymentId })
    return
  }

  const paidAmountRupees = (payment.amount as number) / 100
  const expectedAmount = outstanding.amount.toNumber()
  const amountDiff = Math.abs(paidAmountRupees - expectedAmount)

  // Check amount tolerance (±₹1)
  const needsReview = amountDiff > 1

  if (needsReview) {
    logger.warn('Payment amount mismatch', {
      outstandingId,
      expected: expectedAmount,
      received: paidAmountRupees,
      diff: amountDiff,
    })
  }

  // Record the payment
  await prisma.payment.create({
    data: {
      razorpayPaymentId,
      merchantId,
      outstandingId,
      amount: paidAmountRupees,
      method: payment.method as string,
      paidAt: new Date((payment.created_at as number) * 1000),
      needsReview,
      raw: payment as unknown as import("@prisma/client").Prisma.InputJsonValue,
    },
  })

  if (!needsReview) {
    // Mark outstanding as paid
    await prisma.outstanding.update({
      where: { id: outstandingId },
      data: {
        status: 'paid',
        paidAt: new Date(),
      },
    })

    // Mark payment link as paid
    await prisma.paymentLink.updateMany({
      where: { outstandingId },
      data: { status: 'paid' },
    })

    // Mark any open promises as kept
    await prisma.promise.updateMany({
      where: { outstandingId, status: 'open' },
      data: { status: 'kept' },
    })

    // Send Inngest event to cancel pending reminder jobs
    await inngest.send({
      name: 'payments/received',
      data: { outstandingId, merchantId, razorpayPaymentId },
    })

    // Create merchant notification
    const amountINR = formatINR(paidAmountRupees)
    await prisma.merchantNotification.create({
      data: {
        merchantId,
        type: 'payment_received',
        title: `Payment mil gaya! ₹${amountINR} ✓`,
        body: `${outstanding.customer.name} ne ${amountINR} ka payment kar diya. Outstanding clear ho gaya.`,
        entityId: outstandingId,
        entityType: 'outstanding',
      },
    })

    await appendAuditLog({
      merchantId,
      actor: 'webhook:razorpay',
      action: AUDIT_ACTIONS.PAYMENT_RECEIVED,
      entity: 'outstanding',
      entityId: outstandingId,
      payload: {
        razorpayPaymentId,
        amount: paidAmountRupees,
        method: payment.method,
      },
    })

    logger.info('Payment processed — outstanding marked paid', {
      outstandingId,
      razorpayPaymentId,
      amount: paidAmountRupees,
    })
  } else {
    // Flag for manual review
    await appendAuditLog({
      merchantId,
      actor: 'webhook:razorpay',
      action: AUDIT_ACTIONS.PAYMENT_MISMATCH,
      entity: 'outstanding',
      entityId: outstandingId,
      payload: {
        razorpayPaymentId,
        expectedAmount,
        receivedAmount: paidAmountRupees,
        diff: amountDiff,
      },
    })

    await prisma.merchantNotification.create({
      data: {
        merchantId,
        type: 'payment_received',
        title: `⚠️ Payment mismatch — manual review needed`,
        body: `${outstanding.customer.name} ne ₹${paidAmountRupees} bheja, expected ₹${expectedAmount}. Manual review karein.`,
        entityId: outstandingId,
        entityType: 'outstanding',
      },
    })
  }
}

async function handleSubscriptionActivated(payload: Record<string, unknown>) {
  const sub = ((payload.payload as Record<string, unknown>)?.subscription as Record<string, unknown>)?.entity as Record<string, unknown>
  if (!sub) return

  const razorpaySubId = sub.id as string
  await prisma.subscription.updateMany({
    where: { razorpaySubId },
    data: {
      status: 'active',
      currentPeriodEnd: new Date((sub.current_end as number) * 1000),
      raw: sub as unknown as import("@prisma/client").Prisma.InputJsonValue,
    },
  })

  // Update merchant plan
  const subscription = await prisma.subscription.findUnique({ where: { razorpaySubId } })
  if (subscription) {
    await prisma.merchant.update({
      where: { id: subscription.merchantId },
      data: { plan: subscription.plan },
    })
  }

  logger.info('Subscription activated', { razorpaySubId })
}

async function handleSubscriptionCharged(payload: Record<string, unknown>) {
  const sub = ((payload.payload as Record<string, unknown>)?.subscription as Record<string, unknown>)?.entity as Record<string, unknown>
  if (!sub) return

  const razorpaySubId = sub.id as string
  await prisma.subscription.updateMany({
    where: { razorpaySubId },
    data: {
      status: 'active',
      currentPeriodEnd: new Date((sub.current_end as number) * 1000),
      raw: sub as unknown as import("@prisma/client").Prisma.InputJsonValue,
    },
  })

  logger.info('Subscription charged', { razorpaySubId })
}

async function handleSubscriptionCancelled(payload: Record<string, unknown>) {
  const sub = ((payload.payload as Record<string, unknown>)?.subscription as Record<string, unknown>)?.entity as Record<string, unknown>
  if (!sub) return

  const razorpaySubId = sub.id as string
  await prisma.subscription.updateMany({
    where: { razorpaySubId },
    data: { status: 'cancelled', cancelledAt: new Date(), raw: JSON.parse(JSON.stringify(sub)) },
  })

  // Downgrade merchant to trial plan with grace period
  const subscription = await prisma.subscription.findUnique({ where: { razorpaySubId } })
  if (subscription) {
    await prisma.merchant.update({
      where: { id: subscription.merchantId },
      data: { plan: 'trial', trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    })
  }

  logger.info('Subscription cancelled', { razorpaySubId })
}

async function handleSubscriptionHalted(payload: Record<string, unknown>) {
  const sub = ((payload.payload as Record<string, unknown>)?.subscription as Record<string, unknown>)?.entity as Record<string, unknown>
  if (!sub) return

  await prisma.subscription.updateMany({
    where: { razorpaySubId: sub.id as string },
    data: { status: 'halted', raw: JSON.parse(JSON.stringify(sub)) },
  })

  logger.warn('Subscription halted', { razorpaySubId: sub.id })
}
