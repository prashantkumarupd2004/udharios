/**
 * GET /api/reports/aging — Aging buckets (0-30, 30-60, 60-90, 90+ days)
 *
 * Perf notes:
 * - Bucket counts/amounts are aggregated in SQL (GROUP BY CASE) instead of
 *   pulling every unpaid outstanding into JS. Same numbers, tiny payload.
 * - Defaulter list is a separate TOP-20 query ordered by amount — the UI
 *   only renders the top 5.
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

    const [bucketRows, defaulterRows] = await Promise.all([
      prisma.$queryRaw<{ bucket: string; count: number; amount: number }[]>`
        SELECT
          CASE
            WHEN due_date >= ${d30} THEN 'current'
            WHEN due_date >= ${d60} THEN 'd30'
            WHEN due_date >= ${d90} THEN 'd60'
            ELSE 'd90'
          END AS bucket,
          COUNT(*)::int AS count,
          COALESCE(SUM(amount), 0)::float AS amount
        FROM outstandings
        WHERE merchant_id = ${merchantId}
          AND status IN ('overdue', 'upcoming', 'promised', 'disputed')
        GROUP BY 1`,
      // 90+ din wale defaulters — UI sirf top 5 dikhata hai
      prisma.outstanding.findMany({
        where: {
          merchantId,
          status: { in: ['overdue', 'upcoming', 'promised', 'disputed'] },
          dueDate: { lt: d90 },
        },
        select: {
          id: true,
          amount: true,
          dueDate: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { amount: 'desc' },
        take: 20,
      }),
    ])

    const byBucket = new Map(bucketRows.map(r => [r.bucket, r]))
    const pick = (key: string) => ({
      count: byBucket.get(key)?.count ?? 0,
      amount: byBucket.get(key)?.amount ?? 0,
    })

    const defaulters = defaulterRows.map(os => ({
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
        current: { label: '0–30 din', ...pick('current') },
        d30: { label: '30–60 din', ...pick('d30') },
        d60: { label: '60–90 din', ...pick('d60') },
        d90: { label: '90+ din', ...pick('d90') },
      },
      // Already amount-desc from SQL (UI slices top 5)
      defaulters,
    })
  } catch (err) {
    logger.error('GET /api/reports/aging error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
