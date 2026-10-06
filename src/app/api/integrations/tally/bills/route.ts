/**
 * GET /api/integrations/tally/bills — List synced Tally bills
 * Auth: JWT session cookie
 * Query: page, limit, search, pendingOnly
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { paginationSchema } from '@/validations'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const { page, limit } = paginationSchema.parse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
    })
    const search = searchParams.get('search') ?? ''
    const pendingOnly = searchParams.get('pendingOnly') === 'true'

    const where: Record<string, unknown> = { merchantId: session.merchantId }
    if (pendingOnly) where.pendingAmount = { gt: 0 }
    if (search) {
      where.OR = [
        { billRef: { contains: search, mode: 'insensitive' } },
        { partyName: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
        where,
        orderBy: [{ pendingAmount: 'desc' }, { dueDate: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, billRef: true, partyName: true, partyPhone: true,
          amount: true, pendingAmount: true, billDate: true, dueDate: true,
          voucherType: true, source: true, tallyCompany: true, syncedAt: true,
        },
      }),
      prisma.bill.count({ where }),
    ])

    return NextResponse.json({
      bills: bills.map((b) => ({
        ...b,
        amount: Number(b.amount),
        pendingAmount: Number(b.pendingAmount),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (err) {
    logger.error('GET /api/integrations/tally/bills error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
