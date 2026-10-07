/**
 * GET /api/customers — List customers for current merchant
 * POST /api/customers — Create a new customer
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createCustomerSchema, paginationSchema } from '@/validations'
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
    if (!merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const { page, limit } = paginationSchema.parse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
    })
    const search = searchParams.get('search') ?? ''
    const optedOut = searchParams.get('optedOut')

    const where: Record<string, unknown> = { merchantId }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ]
    }
    if (optedOut !== null) {
      where.optedOut = optedOut === 'true'
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              outstandings: { where: { status: { notIn: ['paid', 'written_off'] } } },
            },
          },
          outstandings: {
            where: { status: { notIn: ['paid', 'written_off'] } },
            select: { amount: true, status: true },
          },
        },
      }),
      prisma.customer.count({ where }),
    ])

    // Pending total per customer
    const withPending = customers.map(c => ({
      ...c,
      outstandings: undefined,
      pendingTotal: c.outstandings.reduce((s, o) => s + Number(o.amount), 0),
      overdueCount: c.outstandings.filter(o => o.status === 'overdue').length,
    }))

    return NextResponse.json({
      customers: withPending,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    logger.error('GET /api/customers error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = createCustomerSchema.parse(body)

    // Normalize phone: ensure +91 prefix
    const phone = data.phone.startsWith('+91')
      ? data.phone
      : `+91${data.phone.replace(/^0/, '')}`

    // Check for duplicate phone under this merchant
    const existing = await prisma.customer.findFirst({
      where: { merchantId, phone },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Yeh phone number already register hai is account mein' },
        { status: 409 }
      )
    }

    const customer = await prisma.customer.create({
      data: {
        merchantId,
        name: data.name,
        phone,
        consent: true,
        consentAt: new Date(),
        notes: data.notes,
      },
    })

    await appendAuditLog({
      merchantId,
      actor: 'merchant',
      action: AUDIT_ACTIONS.CUSTOMER_CREATED,
      entity: 'customer',
      entityId: customer.id,
      payload: { name: customer.name, phone: customer.phone },
    })

    logger.info('Customer created', { merchantId, customerId: customer.id })

    return NextResponse.json({ customer }, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.constructor.name === 'ZodError') {
      return NextResponse.json({ error: (err as {errors?: unknown}).errors }, { status: 400 })
    }
    logger.error('POST /api/customers error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
