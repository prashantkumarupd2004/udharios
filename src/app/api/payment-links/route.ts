/**
 * POST /api/payment-links — Merchant ke gateway se payment link banao
 *
 * Gateway-agnostic: merchant ne jo gateway select kiya hai (settings me),
 * usi se link banega. Razorpay/Cashfree/PayU/PhonePe/Direct UPI.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createPaymentLinkSchema } from '@/validations'
import { getGateway, isGatewayReady } from '@/lib/payments'
import { decryptCredentials } from '@/lib/payments/crypto'
import type { GatewayId } from '@/lib/payments/types'
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

    // Outstanding + merchant (gateway config ke saath)
    const outstanding = await prisma.outstanding.findFirst({
      where: { id: outstandingId, merchantId },
      include: {
        merchant: {
          select: {
            businessName: true,
            upiVpa: true,
            paymentGateway: true,
            gatewayCredentials: true,
            gatewayTestMode: true,
          },
        },
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
    if (outstanding.paymentLink && outstanding.paymentLink.status === 'created') {
      return NextResponse.json({ paymentLink: outstanding.paymentLink })
    }

    // Merchant ka gateway
    const gatewayId = (outstanding.merchant.paymentGateway ?? 'upi_vpa') as GatewayId
    if (!isGatewayReady(gatewayId)) {
      return NextResponse.json(
        { error: 'Payment gateway ready nahi hai — settings me check karo' },
        { status: 400 },
      )
    }

    // Credentials decrypt karo (upi_vpa ke liye upiVpa field use karo)
    let credentials: Record<string, string> = {}
    if (gatewayId === 'upi_vpa') {
      const vpa = outstanding.merchant.upiVpa
      if (!vpa) {
        return NextResponse.json(
          { error: 'Pehle settings me apni UPI ID dalo, ya koi gateway connect karo' },
          { status: 400 },
        )
      }
      credentials = { vpa }
    } else {
      const enc = outstanding.merchant.gatewayCredentials
      if (!enc) {
        return NextResponse.json(
          { error: 'Gateway keys nahi mili — settings me gateway connect karo' },
          { status: 400 },
        )
      }
      try {
        credentials = decryptCredentials(enc)
      } catch {
        return NextResponse.json({ error: 'Gateway credentials corrupt hain' }, { status: 500 })
      }
    }

    const gateway = getGateway(gatewayId)
    const amountPaise = Math.round(outstanding.amount.toNumber() * 100)

    const link = await gateway.createPaymentLink(
      {
        amount: amountPaise,
        description: `${outstanding.merchant.businessName} — Udhaari Payment`,
        customerName: outstanding.customer.name,
        customerPhone: outstanding.customer.phone,
        referenceId: outstandingId,
        notes: {
          merchant_id: merchantId,
          outstanding_id: outstandingId,
          invoice_no: outstanding.invoiceNo ?? '',
        },
        expiryDate: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success`,
      },
      credentials,
      outstanding.merchant.gatewayTestMode ?? true,
    )

    // DB me save karo
    const paymentLink = await prisma.paymentLink.upsert({
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

    await appendAuditLog({
      merchantId,
      actor: 'merchant',
      action: AUDIT_ACTIONS.PAYMENT_LINK_CREATED,
      entity: 'outstanding',
      entityId: outstandingId,
      payload: {
        gateway: gatewayId,
        gatewayLinkId: link.linkId,
        amount: outstanding.amount.toNumber(),
        url: link.shortUrl,
      },
    })

    logger.info('Payment link created', { outstandingId, gateway: gatewayId, linkId: link.linkId })

    return NextResponse.json({ paymentLink }, { status: 201 })
  } catch (err) {
    logger.error('POST /api/payment-links error', { error: String(err) })
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
