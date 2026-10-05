/**
 * POST /api/payment-links — Create a Razorpay payment link for an outstanding
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createPaymentLinkSchema } from '@/validations'
import { createPaymentLink } from '@/lib/razorpay'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

async function getMerchantId(request: NextRequest): Promise<string | null> {
  const session = await getSession()
    if (!session?.merchantId) return null
return session.merchantId ?? null
}

export async function POST(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { outstandingId } = createPaymentLinkSchema.parse(body)

    // Fetch outstanding + merchant
    const outstanding = await prisma.outstanding.findFirst({
      where: { id: outstandingId, merchantId },
      include: {
        merchant: { select: { businessName: true, upiVpa: true } },
        customer: { select: { name: true, phone: true } },
        paymentLink: true,
      },
    })

    if (!outstanding) {
      return NextResponse.json({ error: 'Outstanding not found' }, { status: 404 })
    }

    if (outstanding.status === 'paid') {
      return NextResponse.json({ error: 'Already paid' }, { status: 400 })
    }

    // Return existing link if still active
    if (outstanding.paymentLink && outstanding.paymentLink.status === 'created') {
      return NextResponse.json({ paymentLink: outstanding.paymentLink })
    }

    const amountPaise = Math.round(outstanding.amount.toNumber() * 100)

    // Create Razorpay payment link
    const rzpLink = await createPaymentLink({
      amount: amountPaise,
      description: `${outstanding.merchant.businessName} — Udhaari Payment`,
      customerName: outstanding.customer.name,
      customerPhone: outstanding.customer.phone,
      notes: {
        merchant_id: merchantId,
        outstanding_id: outstandingId,
        invoice_no: outstanding.invoiceNo ?? '',
      },
      // Link expires in 30 days
      expiryDate: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success`,
      callbackMethod: 'get',
    })

    // Save to DB
    const paymentLink = await prisma.paymentLink.upsert({
      where: { outstandingId },
      create: {
        merchantId,
        outstandingId,
        razorpayLinkId: rzpLink.id,
        url: rzpLink.short_url,
        shortUrl: rzpLink.short_url,
        amount: outstanding.amount,
        status: 'created',
      },
      update: {
        razorpayLinkId: rzpLink.id,
        url: rzpLink.short_url,
        shortUrl: rzpLink.short_url,
        status: 'created',
      },
    })

    await appendAuditLog({
      merchantId,
      actor: 'merchant',
      action: AUDIT_ACTIONS.PAYMENT_LINK_CREATED,
      entity: 'outstanding',
      entityId: outstandingId,
      payload: {
        razorpayLinkId: rzpLink.id,
        amount: outstanding.amount.toNumber(),
        url: rzpLink.short_url,
      },
    })

    logger.info('Payment link created', { outstandingId, razorpayLinkId: rzpLink.id })

    return NextResponse.json({ paymentLink }, { status: 201 })
  } catch (err) {
    logger.error('POST /api/payment-links error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
