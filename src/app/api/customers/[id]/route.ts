/**
 * GET /api/customers/[id] — Customer detail with outstandings, bills, promises
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params

    const customer = await prisma.customer.findFirst({
      where: { id, merchantId: session.merchantId },
      include: {
        outstandings: {
          orderBy: { dueDate: 'asc' },
          select: {
            id: true, invoiceNo: true, amount: true, dueDate: true,
            status: true, paidAt: true, notes: true,
          },
        },
        bills: {
          orderBy: { billDate: 'desc' },
          take: 20,
          select: {
            id: true, billRef: true, amount: true, pendingAmount: true,
            billDate: true, dueDate: true, voucherType: true,
          },
        },
        promises: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true, promisedDate: true, status: true,
            createdAt: true, notes: true,
          },
        },
      },
    })

    if (!customer) {
      return NextResponse.json({ error: 'Customer nahi mila' }, { status: 404 })
    }

    const totalPending = customer.outstandings
      .filter(o => !['paid', 'written_off'].includes(o.status))
      .reduce((sum, o) => sum + Number(o.amount), 0)

    return NextResponse.json({ customer, totalPending })
  } catch (err) {
    logger.error('GET /api/customers/[id] error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
