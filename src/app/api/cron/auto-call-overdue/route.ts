/**
 * GET /api/cron/auto-call-overdue — Daily auto-call for overdue outstandings.
 *
 * Vercel Cron se roz chalega. Har overdue outstanding ke liye:
 * - Sirf 9 AM – 9 PM (merchant ke quiet hours ke bahar)
 * - Sirf real phone number ho (tally-xxx nahi)
 * - consent=true, optedOut=false
 * - Merchant kill-switch OFF ho
 * - Escalation: due date din 2 calls, phir roz +2 (max 8/day); manual limit set ho to wahi
 * - Due date wale din se hi calls (koi grace period nahi)
 *
 * Auth: CRON_SECRET bearer token (Vercel Cron automatic)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { placeVoiceCall } from '@/lib/voice-provider'
import { fetchVobizCall } from '@/lib/vobiz'
import { isWithinSendingWindow } from '@/lib/date-utils'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

export const maxDuration = 60

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
  // Due date aaj ya pehle hai to call ke liye eligible (grace period NAHI hai)
  const endOfToday = new Date(today)
  endOfToday.setHours(23, 59, 59, 999)

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

    // === VOBIZ STATUS SYNC (webhook miss ka fallback) ===
    // 'initiated'/'in-progress' pe atki recent calls ka asal status Vobiz API
    // se kheecho. Isse neeche ki gap / retry / blocked logic ko sahi
    // last-status milta hai (warna sab andha chalta hai).
    try {
      const stale = await prisma.call.findMany({
        where: {
          status: { in: ['initiated', 'in-progress', 'ringing'] },
          createdAt: {
            gte: new Date(Date.now() - 48 * 3600 * 1000),
            lt: new Date(Date.now() - 10 * 60 * 1000),
          },
        },
        select: { id: true, exotelSid: true },
        orderBy: { createdAt: 'asc' },
        take: 30,
      })
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      let synced = 0
      for (const c of stale) {
        if (!uuidRe.test(c.exotelSid)) continue // sirf Vobiz UUID wali calls
        const info = await fetchVobizCall(c.exotelSid)
        if (!info || !info.status || ['initiated', 'queued'].includes(info.status)) continue
        await prisma.call.update({
          where: { id: c.id },
          data: {
            status: info.status,
            ...(info.durationSec != null ? { durationSec: info.durationSec } : {}),
            ...(info.recordingUrl ? { recordingUrl: info.recordingUrl } : {}),
          },
        }).catch(() => {})
        synced++
      }
      if (synced > 0) logger.info('Vobiz status sync: calls updated', { synced })
    } catch (err) {
      logger.error('Vobiz status sync failed', { error: String(err) })
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
        dueDate: { lte: endOfToday },
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
      take: 300, // rotation ke liye bada pool — sort neeche hota hai
    })

    // === FAIR ROTATION (Oct 23 fix) ===
    // Pehle sirf dueDate order tha — naye overdue (recent due date) hamesha
    // line ke aakhir me rehte the, pehli call 11 baje tak atakti thi.
    // Ab: aaj sabse KAM calls wale pehle, phir jiska last call sabse purana.
    const startOfDay = new Date(today)
    interface OverdueSortRow { id: string; dueDate: Date | string }
    interface CallCountRow { outstandingId: string; _count: { _all: number } }
    interface LastCallRow { outstandingId: string; _max: { createdAt: Date | string | null } }
    const sortPool = overdues as unknown as OverdueSortRow[]
    const overdueIds: string[] = sortPool.map((o) => o.id)
    const countRows = (overdueIds.length
      ? await prisma.call.groupBy({
          by: ['outstandingId'],
          where: { outstandingId: { in: overdueIds }, createdAt: { gte: startOfDay } },
          _count: { _all: true },
        })
      : []) as unknown as CallCountRow[]
    const callsTodayMap = new Map<string, number>()
    for (const r of countRows) {
      callsTodayMap.set(r.outstandingId, r._count._all)
    }
    const lastRows = (overdueIds.length
      ? await prisma.call.groupBy({
          by: ['outstandingId'],
          where: { outstandingId: { in: overdueIds } },
          _max: { createdAt: true },
        })
      : []) as unknown as LastCallRow[]
    const lastCallMap = new Map<string, number>()
    for (const r of lastRows) {
      lastCallMap.set(
        r.outstandingId,
        r._max?.createdAt ? new Date(r._max.createdAt).getTime() : 0
      )
    }
    sortPool.sort((a, b) => {
      const ca = callsTodayMap.get(a.id) ?? 0
      const cb = callsTodayMap.get(b.id) ?? 0
      if (ca !== cb) return ca - cb
      const la = lastCallMap.get(a.id) ?? 0
      const lb = lastCallMap.get(b.id) ?? 0
      if (la !== lb) return la - lb
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })

    let called = 0
    let skipped = 0
    const details: string[] = []
    const loopStartedAt = Date.now()

    for (const o of overdues) {
      if (called >= MAX_CALLS_PER_RUN) break
      // Time budget: function timeout se pehle saaf ruk jao — aadhi placement
      // pe kill hone se 'initiated' record reh jata hai bina call gaye.
      if (Date.now() - loopStartedAt > 50_000) {
        logger.info('Auto-call run: time budget reached, baaki agle run me', { called, skipped })
        break
      }

      // === CALL LIMIT: merchant manual setting ya auto escalation ===
      // Merchant ne customer ke liye maxCallsPerDay set kiya to wahi use hoga.
      // Nahi to auto: Day 1: 2 calls, Day 2: 4 calls... (max 8/day cap)
      // Day count: due date wala din = Day 1 (2 calls), agla din Day 2 (4 calls), phir 6, 8 (cap)
      const dueDay = new Date(o.dueDate)
      dueDay.setHours(0, 0, 0, 0)
      const daysOverdue = Math.max(1, Math.round((today.getTime() - dueDay.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      const autoMax = Math.min(2 * daysOverdue, 8)
      // o.customer me maxCallsPerDay include karna hoga (query me select karo)
      const manualMax = (o.customer as any)?.maxCallsPerDay
      const maxCallsToday = manualMax != null && manualMax >= 0 ? manualMax : autoMax

      const callsToday = callsTodayMap.get(o.id) ?? 0
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
