/**
 * POST /api/outstandings/[id]/mark-paid
 * Merchant manually marks an outstanding as paid (cash/UPI/bank direct payment).
 * Creates a Payment record + updates Outstanding status to paid.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const markPaidSchema = z.object({
  amount: z.number().positive().optional(), // default: full outstanding amount
  method: z.enum(['cash', 'upi', 'bank_transfer', 'other']).default('cash'),
  notes: z.string().max(500).optional(),
  paidAt: z.string().datetime().optional(), // default: now
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const merchantId = session.merchantId
    const { id } = await params

    const body = markPaidSchema.parse(await request.json())

    // Outstanding merchant ka hi hona chahiye
    const outstanding = await prisma.outstanding.findFirst({
      where: { id, merchantId },
      include: { customer: { select: { name: true } } },
    })
    if (!outstanding) {
      return NextResponse.json({ error: 'Outstanding not found' }, { status: 404 })
    }
    if (outstanding.status === 'paid') {
      return NextResponse.json({ error: 'Already marked as paid' }, { status: 400 })
    }

    const paidAmount = body.amount ?? Number(outstanding.amount)
    const paidAtDate = body.paidAt ? new Date(body.paidAt) : new Date()

    // Payment record banao (manual payment — razorpay ID nahi hai)
    const payment = await prisma.payment.create({
      data: {
        razorpayPaymentId: `manual_${randomUUID()}`,
        merchantId,
        outstandingId: id,
        amount: paidAmount,
        method: body.method,
        paidAt: paidAtDate,
        raw: {
          source: 'manual',
          notes: body.notes ?? null,
          recordedBy: 'merchant',
        },
      },
    })

    // Outstanding ko paid mark karo
    const updated = await prisma.outstanding.update({
      where: { id },
      data: {
        status: paidAmount >= Number(outstanding.amount) ? 'paid' : outstanding.status,
        paidAt: paidAmount >= Number(outstanding.amount) ? paidAtDate : null,
        notes: body.notes
          ? `${outstanding.notes ? outstanding.notes + '\n' : ''}[Payment: ${body.method} ₹${paidAmount}] ${body.notes}`
          : outstanding.notes,
      },
    })

    logger.info('Outstanding marked as paid (manual)', {
      merchantId,
      outstandingId: id,
      amount: paidAmount,
      method: body.method,
    })

    return NextResponse.json({
      success: true,
      payment: { id: payment.id, amount: paidAmount, method: body.method },
      outstanding: { id: updated.id, status: updated.status },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.issues }, { status: 400 })
    }
    logger.error('POST /api/outstandings/[id]/mark-paid error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
