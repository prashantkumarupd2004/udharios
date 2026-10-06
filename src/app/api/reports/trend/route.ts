/**
 * GET /api/reports/trend — Daily collections vs new dues for the last N days
 * Auth: JWT session cookie
 * Query: days (7 | 30, default 30)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const days = [7, 30].includes(Number(request.nextUrl.searchParams.get('days')))
      ? Number(request.nextUrl.searchParams.get('days'))
      : 30

    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - (days - 1))

    const [payments, newDues] = await Promise.all([
      prisma.payment.findMany({
        where: { merchantId: session.merchantId, paidAt: { gte: start } },
        select: { amount: true, paidAt: true },
      }),
      prisma.outstanding.findMany({
        where: { merchantId: session.merchantId, createdAt: { gte: start } },
        select: { amount: true, createdAt: true },
      }),
    ])

    const buckets: Record<string, { collected: number; newDues: number }> = {}
    for (let i = 0; i < days; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      buckets[d.toISOString().slice(0, 10)] = { collected: 0, newDues: 0 }
    }

    for (const p of payments) {
      const k = p.paidAt.toISOString().slice(0, 10)
      if (buckets[k]) buckets[k].collected += Number(p.amount)
    }
    for (const o of newDues) {
      const k = o.createdAt.toISOString().slice(0, 10)
      if (buckets[k]) buckets[k].newDues += Number(o.amount)
    }

    const series = Object.entries(buckets).map(([date, v]) => ({
      date,
      label: new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      collected: Math.round(v.collected),
      newDues: Math.round(v.newDues),
    }))

    const totalCollected = series.reduce((s, d) => s + d.collected, 0)
    const totalNewDues = series.reduce((s, d) => s + d.newDues, 0)

    return NextResponse.json({ days, series, totalCollected, totalNewDues })
  } catch (err) {
    logger.error('GET /api/reports/trend error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
