/**
 * GET/POST /api/outstandings — Udhaari Ledger
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createOutstandingSchema, paginationSchema } from '@/validations'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

async function getMerchantId(request: NextRequest): Promise<string | null> {
  const session = await getSession()
    if (!session?.merchantId) return null
return session.merchantId ?? null
}

export async function GET(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const { page, limit } = paginationSchema.parse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
    })
    const status = searchParams.get('status')
    const customerId = searchParams.get('customerId')

    const where: Record<string, unknown> = { merchantId }
    if (status) where.status = status
    if (customerId) where.customerId = customerId

    const [outstandings, total] = await Promise.all([
      prisma.outstanding.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          paymentLink: { select: { url: true, status: true } },
          _count: { select: { promises: true, disputes: true } },
        },
      }),
      prisma.outstanding.count({ where }),
    ])

    return NextResponse.json({
      outstandings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    logger.error('GET /api/outstandings error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const data = createOutstandingSchema.parse(body)

    // Verify customer belongs to this merchant
    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, merchantId },
    })

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (!customer.consent) {
      return NextResponse.json(
        { error: 'Customer ne consent nahi diya hai' },
        { status: 400 }
      )
    }

    const outstanding = await prisma.outstanding.create({
      data: {
        merchantId,
        customerId: data.customerId,
        invoiceNo: data.invoiceNo,
        amount: data.amount,
        dueDate: new Date(data.dueDate),
        items: data.items ?? undefined,
        notes: data.notes,
        status: new Date(data.dueDate) < new Date() ? 'overdue' : 'upcoming',
      },
      include: {
        customer: { select: { name: true, phone: true } },
      },
    })

    await appendAuditLog({
      merchantId,
      actor: 'merchant',
      action: AUDIT_ACTIONS.OUTSTANDING_CREATED,
      entity: 'outstanding',
      entityId: outstanding.id,
      payload: {
        customerId: data.customerId,
        amount: data.amount,
        dueDate: data.dueDate,
        invoiceNo: data.invoiceNo,
      },
    })

    logger.info('Outstanding created', { merchantId, outstandingId: outstanding.id })

    return NextResponse.json({ outstanding }, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: (err as {errors?: unknown}).errors }, { status: 400 })
    }
    logger.error('POST /api/outstandings error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
