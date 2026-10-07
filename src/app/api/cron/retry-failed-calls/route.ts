/**
 * GET /api/cron/retry-failed-calls — Failed calls ko auto-retry karo.
 *
 * Schedule: har 2 ghante (Vercel cron)
 *
 * Logic:
 * - Pichle 24 ghante me failed calls (no-answer/busy/failed) dhundo
 * - Outstanding abhi bhi unpaid hona chahiye
 * - Max 3 retry per outstanding
 * - Retry gap: 1st retry 2h baad, 2nd 4h baad, 3rd next day
 * - 3 fail ke baad → merchant ko escalation notification
 *
 * Auth: CRON_SECRET (Bearer token ya ?secret=)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { placeCall } from '@/lib/exotel'
import { isWithinSendingWindow } from '@/lib/date-utils'
import { logger } from '@/lib/logger'

const MAX_RETRIES = 3
// Retry delays in ms: [2h, 4h, 12h]
const RETRY_DELAYS = [2 * 3600 * 1000, 4 * 3600 * 1000, 12 * 3600 * 1000]

export async function GET(request: NextRequest) {
  try {
    // --- Auth ---
    const secret = process.env.CRON_SECRET
    if (secret) {
      const auth = request.headers.get('authorization')
      const qSecret = request.nextUrl.searchParams.get('secret')
      if (auth !== `Bearer ${secret}` && qSecret !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const now = new Date()
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000)

    // Failed calls (pichle 24h) jinka outstanding abhi bhi unpaid hai
    const failedCalls = await prisma.call.findMany({
      where: {
        status: { in: ['no-answer', 'busy', 'failed'] },
        createdAt: { gte: dayAgo },
        outstanding: {
          status: { in: ['overdue', 'upcoming'] }, // paid nahi hua
          merchant: { isKillSwitched: false, isApproved: true },
          customer: { optedOut: false, consent: true },
        },
      },
      include: {
        outstanding: {
          include: {
            merchant: {
              select: { id: true, businessName: true, quietStart: true, quietEnd: true },
            },
            customer: {
              select: { id: true, name: true, phone: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Outstanding-wise group karo (ek outstanding pe ek hi retry)
    const byOutstanding = new Map<string, typeof failedCalls>()
    for (const c of failedCalls) {
      const key = c.outstandingId
      if (!byOutstanding.has(key)) byOutstanding.set(key, [])
      byOutstanding.get(key)!.push(c)
    }

    let retried = 0
    let escalated = 0
    let skipped = 0
    const details: string[] = []

    for (const [outstandingId, calls] of byOutstanding) {
      const o = calls[0].outstanding
      const retryCount = calls.length // kitni baar fail ho chuka

      // Max retries cross → escalation (sirf ek baar)
      if (retryCount >= MAX_RETRIES) {
        const alreadyEscalated = await prisma.merchantNotification.findFirst({
          where: {
            merchantId: o.merchant.id,
            entityId: outstandingId,
            type: 'escalation',
            createdAt: { gte: dayAgo },
          },
        })
        if (!alreadyEscalated) {
          await prisma.merchantNotification.create({
            data: {
              merchantId: o.merchant.id,
              type: 'escalation',
              title: `${o.customer.name} — Call nahi uthaya (${retryCount}x)`,
              body: `${o.customer.name} ne ${retryCount} baar call nahi uthaya. Kripya khud sampark karein. Amount: ₹${Number(o.amount).toLocaleString('en-IN')}`,
              entityId: outstandingId,
              entityType: 'outstanding',
            },
          })
          escalated++
          details.push(`Escalated: ${o.customer.name}`)
        } else {
          skipped++
        }
        continue
      }

      // Retry delay check — last fail ke baad itna time guzra?
      const lastFail = calls[0].createdAt // desc order me pehla = latest
      const delayNeeded = RETRY_DELAYS[Math.min(retryCount - 1, RETRY_DELAYS.length - 1)]
      if (now.getTime() - lastFail.getTime() < delayNeeded) {
        skipped++
        continue
      }

      // Quiet hours check
      if (!isWithinSendingWindow(o.merchant.quietStart, o.merchant.quietEnd)) {
        skipped++
        continue
      }

      // Phone valid?
      const phone = o.customer.phone
      if (!phone || !/^\+91[6-9]\d{9}$/.test(phone)) {
        skipped++
        continue
      }

      // Retry call karo!
      try {
        const callRecord = await prisma.call.create({
          data: {
            merchantId: o.merchant.id,
            outstandingId,
            customerId: o.customer.id,
            exotelSid: `retry_pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            status: 'initiated',
          },
        })

        const exotelResponse = await placeCall({
          to: phone,
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/exotel?callId=${callRecord.id}`,
          record: true,
          customField: JSON.stringify({
            merchantName: o.merchant.businessName,
            customerName: o.customer.name,
            amountINR: `₹${Number(o.amount).toLocaleString('en-IN')}`,
            merchantId: o.merchant.id,
            customerId: o.customer.id,
            outstandingId,
            callId: callRecord.id,
            retryAttempt: retryCount + 1,
          }),
        })

        await prisma.call.update({
          where: { id: callRecord.id },
          data: { exotelSid: exotelResponse.Call?.Sid ?? callRecord.exotelSid, status: 'queued' },
        })

        retried++
        details.push(`Retried (${retryCount + 1}x): ${o.customer.name}`)
        logger.info('Retry call placed', { outstandingId, attempt: retryCount + 1 })
      } catch (err) {
        logger.error('Retry call failed', { outstandingId, error: String(err) })
        skipped++
      }

      // Ek run me max 20 retry
      if (retried >= 20) break
    }

    return NextResponse.json({
      ok: true,
      retried,
      escalated,
      skipped,
      checked: byOutstanding.size,
      details,
    })
  } catch (err) {
    logger.error('GET /api/cron/retry-failed-calls error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
