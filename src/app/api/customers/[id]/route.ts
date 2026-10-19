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
            status: true, paidAt: true, notes: true, remindersPaused: true,
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

    // Blocked number check: last 5 calls lagatar fail?
    const recentCalls = await prisma.call.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { status: true },
    })
    const possiblyBlocked = recentCalls.length >= 5 &&
      recentCalls.every(c => ['failed', 'busy', 'no-answer', 'canceled'].includes(c.status))

    return NextResponse.json({ customer, totalPending, possiblyBlocked })
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
    // maxCallsPerDay: number (0-20) ya null (auto)
    if (body.maxCallsPerDay === null || body.maxCallsPerDay === '') {
      ;(data as any).maxCallsPerDay = null
    } else if (typeof body.maxCallsPerDay === 'number' && body.maxCallsPerDay >= 0 && body.maxCallsPerDay <= 20) {
      ;(data as any).maxCallsPerDay = Math.floor(body.maxCallsPerDay)
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

/**
 * DELETE /api/customers/[id] — Customer aur uska SARA data delete karo.
 * Bills, outstandings, calls, promises, disputes, reminder logs, verifications — sab!
 * Calls bhi band ho jayenge (customer hi nahi rahega to cron skip karega).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params

    // Customer merchant ka hai ya nahi — verify karo
    const customer = await prisma.customer.findFirst({
      where: { id, merchantId: session.merchantId },
      select: { id: true, name: true },
    })
    if (!customer) {
      return NextResponse.json({ error: 'Customer nahi mila' }, { status: 404 })
    }

    // Transaction me sab delete karo (order matters — pehle child records)
    await prisma.$transaction(async (tx) => {
      // Promises — outstandingId AUR customerId dono se (koi miss na ho)
      const outstandings = await tx.outstanding.findMany({
        where: { customerId: id },
        select: { id: true },
      })
      const outstandingIds = outstandings.map((o: any) => o.id)
      if (outstandingIds.length > 0) {
        await tx.promise.deleteMany({ where: { outstandingId: { in: outstandingIds } } })
      }
      await tx.promise.deleteMany({ where: { customerId: id } })
      // Payments (outstanding se linked — pehle inko delete karo)
      if (outstandingIds.length > 0) {
        await tx.payment.deleteMany({ where: { outstandingId: { in: outstandingIds } } })
        await tx.paymentLink.deleteMany({ where: { outstandingId: { in: outstandingIds } } })
      }
      // Disputes
      await tx.dispute.deleteMany({ where: { customerId: id } })
      // Reminder logs
      await tx.reminderLog.deleteMany({ where: { customerId: id } })
      // Calls
      await tx.call.deleteMany({ where: { customerId: id } })
      // Verifications
      await tx.verification.deleteMany({ where: { customerId: id } })
      // Outstandings
      await tx.outstanding.deleteMany({ where: { customerId: id } })
      // Bills
      await tx.bill.deleteMany({ where: { customerId: id } })
      // Customer
      await tx.customer.delete({ where: { id } })
    })

    logger.info('Customer deleted with all records', {
      merchantId: session.merchantId,
      customerId: id,
      customerName: customer.name,
    })
    return NextResponse.json({ success: true, deleted: customer.name })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('DELETE /api/customers/[id] error', { error: msg })
    return NextResponse.json({ error: `Delete nahi ho paya: ${msg}` }, { status: 500 })
  }
}
