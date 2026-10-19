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
import { placeVoiceCall } from '@/lib/voice-provider'
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
    // === PROMISE FOLLOW-UP ===
    // 1. Expired promises (promisedDate < aaj, abhi bhi open): broken mark karo,
    //    outstanding wapas 'overdue' → normal calls resume honge
    const expiredPromises = await prisma.promise.findMany({
      where: {
        promisedDate: { lt: today },
        status: 'open',
        outstanding: { status: 'promised' },
      },
      select: { id: true, outstandingId: true },
    })
    for (const p of expiredPromises) {
      await Promise.all([
        prisma.promise.update({ where: { id: p.id }, data: { status: 'broken' } }),
        prisma.outstanding.update({ where: { id: p.outstandingId }, data: { status: 'overdue' } }),
      ]).catch((err) => logger.error('Promise expiry failed', { promiseId: p.id, error: String(err) }))
    }
    if (expiredPromises.length > 0) {
      logger.info('Expired promises → overdue', { count: expiredPromises.length })
    }

    // 2. Due promises (promisedDate = aaj): reminder call lagao
    //    (yeh alag se handle hoga — neeche duePromises section me)
    const duePromises = await prisma.outstanding.findMany({
      where: {
        status: 'promised',
        remindersPaused: false,
        promises: { some: { promisedDate: today, status: 'open' } },
        merchant: { isKillSwitched: false, isApproved: true },
        customer: {
          optedOut: false,
          consent: true,
          phone: { not: { startsWith: 'tally-' } },
        },
      },
      include: {
        merchant: {
          select: { id: true, businessName: true, quietStart: true, quietEnd: true },
        },
        customer: {
          select: { id: true, name: true, phone: true, maxCallsPerDay: true },
        },
      },
      take: 20, // promise reminders ka alag budget
    })

    let promiseCalled = 0
    for (const o of duePromises) {
      // Double-dial guard
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const alreadyCalled = await prisma.call.findFirst({
        where: { outstandingId: o.id, createdAt: { gte: dayAgo } },
      })
      if (alreadyCalled) continue
      if (!isWithinSendingWindow(o.merchant.quietStart, o.merchant.quietEnd)) continue
      if (!/^\+91\d{10}$/.test(o.customer.phone)) continue

      try {
        const callRecord = await prisma.call.create({
          data: {
            merchantId: o.merchantId,
            outstandingId: o.id,
            customerId: o.customerId,
            exotelSid: `promise-${Date.now()}-${o.id.slice(0, 8)}`,
            status: 'initiated',
          },
        })

        // Vobiz ya Exotel — merchant ke voice provider se
        const { placeVoiceCall } = await import('@/lib/voice-provider')
        await placeVoiceCall(o.merchantId, {
          to: o.customer.phone,
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/exotel?callId=${callRecord.id}`,
          record: true,
          customField: JSON.stringify({
            callId: callRecord.id,
            outstandingId: o.id,
            merchantId: o.merchantId,
            customerId: o.customerId,
            merchantName: o.merchant.businessName,
            customerName: o.customer.name,
            amountINR: o.amount.toString(),
            promiseReminder: true, // <-- promise reminder flag
            autoCall: true,
          }),
        })
        promiseCalled++
        logger.info('Promise reminder call placed', { outstandingId: o.id, customer: o.customer.name })
      } catch (err) {
        logger.error('Promise reminder call failed', { outstandingId: o.id, error: String(err) })
      }
    }

    // Overdue outstandings nikalo
    const overdues = await prisma.outstanding.findMany({
      where: {
        dueDate: { lt: graceDate },
        status: { in: ['overdue', 'upcoming'] },
        remindersPaused: false,
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
          select: { id: true, name: true, phone: true, maxCallsPerDay: true },
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

      // === CALL LIMIT: merchant manual setting ya auto escalation ===
      // Merchant ne customer ke liye maxCallsPerDay set kiya to wahi use hoga.
      // Nahi to auto: Day 1: 2 calls, Day 2: 4 calls... (max 8/day cap)
      const daysOverdue = Math.max(1, Math.ceil((today.getTime() - new Date(o.dueDate).getTime()) / (1000 * 60 * 60 * 24)))
      const autoMax = Math.min(2 * daysOverdue, 8)
      // o.customer me maxCallsPerDay include karna hoga (query me select karo)
      const manualMax = (o.customer as any)?.maxCallsPerDay
      const maxCallsToday = manualMax != null && manualMax >= 0 ? manualMax : autoMax

      const startOfDay = new Date(today)
      const callsToday = await prisma.call.count({
        where: { outstandingId: o.id, createdAt: { gte: startOfDay } },
      })
      if (callsToday >= maxCallsToday) {
        skipped++
        continue
      }

      // === BLOCKED NUMBER DETECTION ===
      // Lagatar 5+ fail (busy/failed/no-answer) = number block ho sakta hai → calls pause
      const recentCalls = await prisma.call.findMany({
        where: { customerId: o.customerId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { status: true },
      })
      if (recentCalls.length >= 5) {
        const allFailed = recentCalls.every(c =>
          ['failed', 'busy', 'no-answer', 'canceled'].includes(c.status)
        )
        if (allFailed) {
          // Blocked — auto calls pause, manual allowed
          logger.info('Skipping possibly blocked number', {
            customerId: o.customerId,
            customerName: o.customer.name,
          })
          skipped++
          continue
        }
      }

      // Last call ka status check — retry logic
      const lastCall = await prisma.call.findFirst({
        where: { outstandingId: o.id },
        orderBy: { createdAt: 'desc' },
        select: { status: true, createdAt: true, durationSec: true },
      })
      if (lastCall) {
        const minsSinceLastCall = (Date.now() - new Date(lastCall.createdAt).getTime()) / (1000 * 60)
        const lastFailed = ['failed', 'busy', 'no-answer', 'canceled'].includes(lastCall.status)
        const cutShort = lastCall.status === 'completed' && (lastCall.durationSec ?? 0) < 10
        // Gap: daily limit ke hisaab se adjust karo
        // 10-hour window (9 AM - 7 PM) me maxCallsToday calls → gap = 600 / maxCallsToday
        // Manual limit set hai to aggressive calling allowed
        const windowMins = 10 * 60 // 9 AM - 7 PM
        const dynamicGap = Math.max(15, Math.floor(windowMins / Math.max(1, maxCallsToday)))
        // Failed/busy/cut → half gap; successful → full gap
        const minGapMins = (lastFailed || cutShort) ? Math.max(10, Math.floor(dynamicGap / 2)) : dynamicGap
        if (minsSinceLastCall < minGapMins) {
          skipped++
          continue
        }
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

        const voiceResult = await placeVoiceCall(o.merchantId, {
          to: o.customer.phone,
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/exotel?callId=${callRecord.id}`,
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
          data: { exotelSid: voiceResult.providerCallId },
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
      expiredPromises: expiredPromises.length,
      promiseReminders: promiseCalled,
      details,
    })
  } catch (err) {
    logger.error('Auto-call cron error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
