/**
 * GET /api/reports/aging — Aging buckets (0-30, 30-60, 60-90, 90+ days)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
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

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const d30 = new Date(today); d30.setDate(today.getDate() - 30)
    const d60 = new Date(today); d60.setDate(today.getDate() - 60)
    const d90 = new Date(today); d90.setDate(today.getDate() - 90)

    const outstandings = await prisma.outstanding.findMany({
      where: {
        merchantId,
        status: { in: ['overdue', 'upcoming', 'promised', 'disputed'] },
      },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        status: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { dueDate: 'asc' },
    })

    const buckets = {
      current: { label: '0–30 din', count: 0, amount: 0, items: [] as typeof outstandings },
      bucket30: { label: '30–60 din', count: 0, amount: 0, items: [] as typeof outstandings },
      bucket60: { label: '60–90 din', count: 0, amount: 0, items: [] as typeof outstandings },
      bucket90: { label: '90+ din', count: 0, amount: 0, items: [] as typeof outstandings },
    }

    for (const os of outstandings) {
      const dueDate = new Date(os.dueDate)
      const amount = Number(os.amount)

      if (dueDate >= d30) {
        buckets.current.count++
        buckets.current.amount += amount
        buckets.current.items.push(os)
      } else if (dueDate >= d60) {
        buckets.bucket30.count++
        buckets.bucket30.amount += amount
        buckets.bucket30.items.push(os)
      } else if (dueDate >= d90) {
        buckets.bucket60.count++
        buckets.bucket60.amount += amount
        buckets.bucket60.items.push(os)
      } else {
        buckets.bucket90.count++
        buckets.bucket90.amount += amount
        buckets.bucket90.items.push(os)
      }
    }

    // Defaulter list — overdue 90+ days
    const defaulters = buckets.bucket90.items.map(os => ({
      customerId: os.customer.id,
      customerName: os.customer.name,
      phone: os.customer.phone,
      outstandingId: os.id,
      amount: Number(os.amount),
      dueDate: os.dueDate,
      daysOverdue: Math.floor(
        (today.getTime() - new Date(os.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      ),
    }))

    return NextResponse.json({
      buckets: {
        current: { ...buckets.current, items: undefined },
        d30: { ...buckets.bucket30, items: undefined },
        d60: { ...buckets.bucket60, items: undefined },
        d90: { ...buckets.bucket90, items: undefined },
      },
      defaulters: defaulters.sort((a, b) => b.amount - a.amount),
    })
  } catch (err) {
    logger.error('GET /api/reports/aging error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
