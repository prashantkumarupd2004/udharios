/**
 * POST /api/customers/bulk-delete — Multiple customers ek saath delete karo.
 * Body: { ids: string[] }
 * Har customer ka SARA data delete hota hai (bills, calls, promises, etc.)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const ids: string[] = body.ids || []

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Koi customer select nahi kiya' }, { status: 400 })
    }
    if (ids.length > 100) {
      return NextResponse.json({ error: 'Ek baar me max 100 customers' }, { status: 400 })
    }

    // Sirf apne merchant ke customers
    const customers = await prisma.customer.findMany({
      where: { id: { in: ids }, merchantId: session.merchantId },
      select: { id: true, name: true },
    })

    if (customers.length === 0) {
      return NextResponse.json({ error: 'Customer nahi mile' }, { status: 404 })
    }

    const customerIds = customers.map(c => c.id)
    let deleted = 0
    const errors: string[] = []

    // Har customer ko alag transaction me delete karo
    for (const customerId of customerIds) {
      try {
        await prisma.$transaction(async (tx) => {
          const outstandings = await tx.outstanding.findMany({
            where: { customerId },
            select: { id: true },
          })
          const outstandingIds = outstandings.map((o: any) => o.id)
          if (outstandingIds.length > 0) {
            await tx.promise.deleteMany({ where: { outstandingId: { in: outstandingIds } } })
            await tx.payment.deleteMany({ where: { outstandingId: { in: outstandingIds } } })
            await tx.paymentLink.deleteMany({ where: { outstandingId: { in: outstandingIds } } })
          }
          await tx.promise.deleteMany({ where: { customerId } })
          await tx.dispute.deleteMany({ where: { customerId } })
          await tx.reminderLog.deleteMany({ where: { customerId } })
          await tx.call.deleteMany({ where: { customerId } })
          await tx.verification.deleteMany({ where: { customerId } })
          await tx.outstanding.deleteMany({ where: { customerId } })
          await tx.bill.deleteMany({ where: { customerId } })
          await tx.customer.delete({ where: { id: customerId } })
        })
        deleted++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${customerId}: ${msg}`)
        logger.error('Bulk delete failed for customer', { customerId, error: msg })
      }
    }

    logger.info('Bulk customer delete', {
      merchantId: session.merchantId,
      requested: ids.length,
      deleted,
      errors: errors.length,
    })

    return NextResponse.json({
      success: true,
      deleted,
      total: customerIds.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    logger.error('POST /api/customers/bulk-delete error', { error: String(err) })
    return NextResponse.json({ error: 'Bulk delete nahi ho paya' }, { status: 500 })
  }
}
