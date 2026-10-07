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

/**
 * PATCH /api/customers/[id] — Update customer (phone, name, notes, consent)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    const body = await request.json()

    const existing = await prisma.customer.findFirst({
      where: { id, merchantId: session.merchantId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Customer nahi mila' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}

    // Phone update — normalize +91, duplicate check
    if (typeof body.phone === 'string') {
      const raw = body.phone.replace(/\D/g, '')
      const phone = raw.length === 10 ? `+91${raw}` : raw.length === 12 && raw.startsWith('91') ? `+${raw}` : body.phone.trim()
      if (!/^\+91\d{10}$/.test(phone)) {
        return NextResponse.json({ error: 'Sahi 10-digit mobile number daalo' }, { status: 400 })
      }
      if (phone !== existing.phone) {
        const dup = await prisma.customer.findFirst({
          where: { merchantId: session.merchantId, phone, id: { not: id } },
        })
        if (dup) {
          return NextResponse.json({ error: `Ye number pehle se ${dup.name} ke paas hai` }, { status: 409 })
        }
      }
      data.phone = phone
    }
    if (typeof body.name === 'string' && body.name.trim()) {
      data.name = body.name.trim()
    }
    if (typeof body.notes === 'string') {
      data.notes = body.notes.trim() || null
    }
    if (typeof body.consent === 'boolean') {
      data.consent = body.consent
      data.consentAt = body.consent ? new Date() : null
    }

    const customer = await prisma.customer.update({
      where: { id },
      data,
    })

    logger.info('Customer updated', { merchantId: session.merchantId, customerId: id })
    return NextResponse.json({ customer })
  } catch (err) {
    logger.error('PATCH /api/customers/[id] error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
