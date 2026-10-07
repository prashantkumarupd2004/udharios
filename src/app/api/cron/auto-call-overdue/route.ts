/**
 * GET /api/cron/auto-call-overdue — Daily auto-call for overdue outstandings.
 *
 * Vercel Cron se roz chalega. Har overdue outstanding ke liye:
 * - Sirf 9 AM – 9 PM (merchant ke quiet hours ke bahar)
 * - Sirf real phone number ho (tally-xxx nahi)
 * - consent=true, optedOut=false
 * - Merchant kill-switch OFF ho
 * - Ek outstanding ko din me max 1 call
 * - Sirf 3+ din overdue ho (grace period)
 *
 * Auth: CRON_SECRET bearer token (Vercel Cron automatic)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { placeCall } from '@/lib/exotel'
import { isWithinSendingWindow } from '@/lib/date-utils'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

const MIN_OVERDUE_DAYS = 3
const MAX_CALLS_PER_RUN = 50 // ek run me max 50 calls (cost control)

export async function GET(request: NextRequest) {
  // Vercel Cron auth
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const graceDate = new Date(today)
  graceDate.setDate(graceDate.getDate() - MIN_OVERDUE_DAYS)

  try {
    // Overdue outstandings nikalo
    const overdues = await prisma.outstanding.findMany({
      where: {
        dueDate: { lt: graceDate },
        status: { in: ['overdue', 'upcoming'] },
        merchant: {
          isKillSwitched: false,
          isApproved: true,
        },
        customer: {
          optedOut: false,
          consent: true,
          phone: { not: { startsWith: 'tally-' } },
        },
      },
      include: {
        merchant: {
          select: {
            id: true, businessName: true,
            quietStart: true, quietEnd: true,
          },
        },
        customer: {
          select: { id: true, name: true, phone: true },
        },
      },
      orderBy: { dueDate: 'asc' },
      take: MAX_CALLS_PER_RUN * 2, // filter ke baad kaam aayenge
    })

    let called = 0
    let skipped = 0
    const details: string[] = []

    for (const o of overdues) {
      if (called >= MAX_CALLS_PER_RUN) break

      // Din me 1 call ka limit — aaj already call hui?
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const alreadyCalled = await prisma.call.findFirst({
        where: {
          outstandingId: o.id,
          createdAt: { gte: startOfDay },
        },
      })
      if (alreadyCalled) {
        skipped++
        continue
      }

      // Sending window check (9 AM – 9 PM)
      if (!isWithinSendingWindow(o.merchant.quietStart, o.merchant.quietEnd)) {
        skipped++
        continue
      }

      // Valid Indian mobile check
      if (!/^\+91\d{10}$/.test(o.customer.phone)) {
        skipped++
        continue
      }

      try {
        const callRecord = await prisma.call.create({
          data: {
            merchantId: o.merchantId,
            outstandingId: o.id,
            customerId: o.customerId,
            exotelSid: `auto-${Date.now()}-${o.id.slice(0, 8)}`,
            status: 'initiated',
          },
        })

        const exotelResponse = await placeCall({
          to: o.customer.phone,
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/exotel?callId=${callRecord.id}`,
          voiceUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/connect?callId=${callRecord.id}`,
          record: true,
          customField: JSON.stringify({
            callId: callRecord.id,
            outstandingId: o.id,
            merchantId: o.merchantId,
            customerId: o.customerId,
            merchantName: o.merchant.businessName,
            customerName: o.customer.name,
            amountINR: o.amount.toString(),
            autoCall: true,
          }),
        })

        await prisma.call.update({
          where: { id: callRecord.id },
          data: { exotelSid: exotelResponse.Call.Sid },
        })

        await appendAuditLog({
          merchantId: o.merchantId,
          actor: 'system',
          action: AUDIT_ACTIONS.CALL_PLACED,
          entity: 'outstanding',
          entityId: o.id,
          payload: {
            callId: callRecord.id,
            auto: true,
            customerPhone: o.customer.phone,
          },
        }).catch(() => {})

        called++
        details.push(`${o.customer.name} (₹${Number(o.amount).toLocaleString('en-IN')})`)
        logger.info('Auto-call placed', { outstandingId: o.id, customer: o.customer.name })
      } catch (callErr) {
        logger.error('Auto-call failed', { outstandingId: o.id, error: String(callErr) })
        skipped++
      }
    }

    return NextResponse.json({
      ok: true,
      checked: overdues.length,
      called,
      skipped,
      details,
    })
  } catch (err) {
    logger.error('Auto-call cron error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
