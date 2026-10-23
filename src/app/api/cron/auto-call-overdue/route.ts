/**
 * GET /api/cron/auto-call-overdue — Daily auto-call for overdue outstandings.
 *
 * HEAVY-USE ENGINE (Oct 23): pehle sequential loop tha — ek run me ~10 calls
 * hi ban paati theen, din bhar ki capacity ~200. Ab:
 * - Parallel batches (6 concurrent placements) — per-call latency overlap
 * - Self-chain: time budget khatm ho aur kaam bacha ho to run khud ko
 *   dobara trigger karta hai (after()) — 9–7 window me lagatar processing,
 *   cron entries sirf kickstart/safety ka kaam karti hain
 * - Claim + recheck race guard: parallel/overlapping runs ek hi customer ko
 *   double call nahi laga sakte, daily cap kabhi cross nahi hota
 * - Fair rotation: aaj sabse kam calls wale pehle (neeche dekho)
 *
 * Rules (unchanged):
 * - Sirf 9 AM – 7 PM IST (merchant quiet hours ke andar aur narrow ho sakta hai)
 * - Sirf real phone number ho (tally-xxx nahi), consent=true, optedOut=false
 * - Merchant kill-switch OFF ho
 * - Escalation: due date wala din 2 calls, phir roz +2 (max 8/day);
 *   merchant ne manual limit set kiya ho to wahi (0 = band)
 * - Koi grace period NAHI hai — due date wale din se hi calls
 *
 * Auth: CRON_SECRET bearer token (Vercel Cron automatic)
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { placeVoiceCall } from '@/lib/voice-provider'
import { fetchVobizCall } from '@/lib/vobiz'
import { isWithinSendingWindow } from '@/lib/date-utils'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

export const maxDuration = 60

const MAX_CALLS_PER_RUN = 200 // ek invocation ka safety cap (deadline asal governor hai)
const RUN_DEADLINE_MS = 52_000 // 60s function limit se pehle saaf rukna hai
const PLACE_BATCH = 6 // ek saath kitni placements (Sarvam/Vobiz load balance)
const MAX_CHAIN = 40 // ek cron kick se zyada se zyada kitne chained runs

export async function GET(request: NextRequest) {
  // Vercel Cron auth
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runStartedAt = Date.now()
  const timeLeft = () => RUN_DEADLINE_MS - (Date.now() - runStartedAt)
  const chainDepth = parseInt(request.nextUrl.searchParams.get('chain') ?? '0', 10) || 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Due date aaj ya pehle hai to call ke liye eligible (grace period NAHI hai)
  const endOfToday = new Date(today)
  endOfToday.setHours(23, 59, 59, 999)
  const startOfDay = new Date(today)

  /**
   * Items ko parallel batches me chalao. Deadline aa jaye to ruk jao aur
   * false return karo (matlab: kuch items bina process hue reh gaye).
   */
  async function runBatches<T>(
    items: T[],
    size: number,
    fn: (item: T) => Promise<void>
  ): Promise<{ complete: boolean; started: number }> {
    let started = 0
    for (let i = 0; i < items.length; i += size) {
      if (timeLeft() <= 4_000) return { complete: false, started }
      const slice = items.slice(i, i + size)
      started += slice.length
      await Promise.allSettled(slice.map((it) => fn(it)))
    }
    return { complete: true, started }
  }

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
    // se kheecho (parallel batches me). Isse neeche ki gap / retry / blocked
    // logic ko sahi last-status milta hai (warna sab andha chalta hai).
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
        take: 20,
      })
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const syncable: { id: string; exotelSid: string }[] = []
      for (const c of stale) {
        if (uuidRe.test(c.exotelSid)) syncable.push(c) // sirf Vobiz UUID wali calls
      }
      let synced = 0
      await runBatches(syncable, 10, async (c: { id: string; exotelSid: string }) => {
        const info = await fetchVobizCall(c.exotelSid)
        if (!info || !info.status || ['initiated', 'queued'].includes(info.status)) return
        await prisma.call.update({
          where: { id: c.id },
          data: {
            status: info.status,
            ...(info.durationSec != null ? { durationSec: info.durationSec } : {}),
            ...(info.recordingUrl ? { recordingUrl: info.recordingUrl } : {}),
          },
        }).catch(() => {})
        synced++
      })
      if (synced > 0) logger.info('Vobiz status sync: calls updated', { synced })
    } catch (err) {
      logger.error('Vobiz status sync failed', { error: String(err) })
    }

    // 2. Due promises (promisedDate = aaj): reminder call lagao (parallel batches)
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
    const promiseCandidates: typeof duePromises = []
    for (const o of duePromises) {
      // Double-dial guard
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const alreadyCalled = await prisma.call.findFirst({
        where: { outstandingId: o.id, createdAt: { gte: dayAgo } },
      })
      if (alreadyCalled) continue
      if (!isWithinSendingWindow(o.merchant.quietStart, o.merchant.quietEnd)) continue
      if (!/^\+91\d{10}$/.test(o.customer.phone)) continue
      promiseCandidates.push(o)
    }
    await runBatches(promiseCandidates, PLACE_BATCH, async (o: (typeof duePromises)[number]) => {
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
            promiseReminder: true, // <-- promise reminder flag
            autoCall: true,
          }),
        })
        await prisma.call.update({
          where: { id: callRecord.id },
          data: { exotelSid: voiceResult.providerCallId },
        }).catch(() => {})
        promiseCalled++
        logger.info('Promise reminder call placed', { outstandingId: o.id, customer: o.customer.name })
      } catch (err) {
        logger.error('Promise reminder call failed', { outstandingId: o.id, error: String(err) })
      }
    })

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

    // === FAIR ROTATION ===
    // Pehle sirf dueDate order tha — naye overdue (recent due date) hamesha
    // line ke aakhir me rehte the, pehli call 11 baje tak atakti thi.
    // Ab: aaj sabse KAM calls wale pehle, phir jiska last call sabse purana.
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

    // === PHASE A: saste checks (bina DB) — candidate list ===
    type Candidate = { o: (typeof overdues)[number]; maxCallsToday: number }
    const candidates: Candidate[] = []
    let skipped = 0
    for (const o of overdues) {
      // CALL LIMIT: merchant manual setting ya auto escalation
      // Day count: due date wala din = Day 1 (2 calls), agla din Day 2 (4), phir 6, 8 (cap)
      const dueDay = new Date(o.dueDate)
      dueDay.setHours(0, 0, 0, 0)
      const daysOverdue = Math.max(1, Math.round((today.getTime() - dueDay.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      const autoMax = Math.min(2 * daysOverdue, 8)
      const manualMax = (o.customer as unknown as { maxCallsPerDay?: number | null })?.maxCallsPerDay
      const maxCallsToday = manualMax != null && manualMax >= 0 ? manualMax : autoMax

      if ((callsTodayMap.get(o.id) ?? 0) >= maxCallsToday) {
        skipped++
        continue
      }
      // Sending window check (9 AM – 7 PM IST)
      if (!isWithinSendingWindow(o.merchant.quietStart, o.merchant.quietEnd)) {
        skipped++
        continue
      }
      // Valid Indian mobile check
      if (!/^\+91\d{10}$/.test(o.customer.phone)) {
        skipped++
        continue
      }
      candidates.push({ o, maxCallsToday })
    }

    // === PHASE B: parallel batches me asal checks + placement ===
    let called = 0
    const details: string[] = []

    const placeForCandidate = async ({ o, maxCallsToday }: Candidate): Promise<void> => {
      // BLOCKED NUMBER DETECTION: lagatar 5+ fail = number block ho sakta
      // hai → auto calls pause (manual allowed). Aur last-call gap check.
      const [recentCalls, lastCall] = await Promise.all([
        prisma.call.findMany({
          where: { customerId: o.customerId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { status: true },
        }),
        prisma.call.findFirst({
          where: { outstandingId: o.id },
          orderBy: { createdAt: 'desc' },
          select: { status: true, createdAt: true, durationSec: true },
        }),
      ])

      if (recentCalls.length >= 5) {
        const allFailed = recentCalls.every((c) =>
          ['failed', 'busy', 'no-answer', 'canceled'].includes(c.status)
        )
        if (allFailed) {
          logger.info('Skipping possibly blocked number', {
            customerId: o.customerId,
            customerName: o.customer.name,
          })
          skipped++
          return
        }
      }

      // Gap: daily limit ke hisaab se — 10-hour window (9 AM–7 PM) me
      // maxCallsToday calls → gap = 600 / maxCallsToday.
      // Failed/busy/cut-short → half gap; successful → full gap.
      let minGapMins = 0
      if (lastCall) {
        const minsSinceLastCall = (Date.now() - new Date(lastCall.createdAt).getTime()) / (1000 * 60)
        const lastFailed = ['failed', 'busy', 'no-answer', 'canceled'].includes(lastCall.status)
        const cutShort = lastCall.status === 'completed' && (lastCall.durationSec ?? 0) < 10
        const windowMins = 10 * 60
        const dynamicGap = Math.max(15, Math.floor(windowMins / Math.max(1, maxCallsToday)))
        minGapMins = (lastFailed || cutShort) ? Math.max(10, Math.floor(dynamicGap / 2)) : dynamicGap
        if (minsSinceLastCall < minGapMins) {
          skipped++
          return
        }
      }

      // === CLAIM + RECHECK (race guard) ===
      // Pehle record banao (claim), phir fresh count/gap verify karo.
      // Koi parallel/overlapping run ne isi beech claim kar diya ho to
      // hum peeche hat jayenge — double call aur cap-cross dono impossible.
      const callRecord = await prisma.call.create({
        data: {
          merchantId: o.merchantId,
          outstandingId: o.id,
          customerId: o.customerId,
          exotelSid: `auto-${Date.now()}-${o.id.slice(0, 8)}`,
          status: 'initiated',
        },
      })
      const [freshCount, rivalClaim] = await Promise.all([
        prisma.call.count({
          where: { outstandingId: o.id, createdAt: { gte: startOfDay } },
        }),
        prisma.call.findFirst({
          where: { outstandingId: o.id, id: { not: callRecord.id } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ])
      const rivalTooFresh =
        rivalClaim != null &&
        minGapMins > 0 &&
        Date.now() - new Date(rivalClaim.createdAt).getTime() < minGapMins * 60 * 1000
      if (freshCount > maxCallsToday || rivalTooFresh) {
        await prisma.call.delete({ where: { id: callRecord.id } }).catch(() => {})
        skipped++
        return
      }

      try {
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

    let capStopped = false
    const batchResult = await runBatches(candidates, PLACE_BATCH, async (cand) => {
      if (called >= MAX_CALLS_PER_RUN) {
        capStopped = true // run-cap ki wajah se ye candidate reh gaya → chain chahiye
        skipped++
        return
      }
      await placeForCandidate(cand)
    })
    // Kaam bacha hai agar: kuch candidates bina start hue reh gaye (deadline),
    // ya run-cap hit hone se kuch candidates place hue bina reh gaye
    const workRemaining = !batchResult.complete || capStopped

    // === SELF-CHAIN ===
    // Kaam bacha hai to response ke baad khud ko dobara trigger karo —
    // isse 9–7 window me processing lagatar chalti rehti hai bina
    // Vercel cron ki 30-min cadence pe nirbhar hue. Cron kicks
    // har 30 min pe chain ko restart/safety deti hain.
    let chained = false
    if (workRemaining && chainDepth < MAX_CHAIN) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://udharios.vercel.app').replace(/\/+$/, '')
      chained = true
      after(async () => {
        try {
          await fetch(`${appUrl}/api/cron/auto-call-overdue?chain=${chainDepth + 1}`, {
            headers: cronSecret ? { authorization: `Bearer ${cronSecret}` } : {},
            signal: AbortSignal.timeout(4_000),
          })
        } catch {
          /* request Vercel tak pahunch gaya to invocation start ho gaya hoga;
             warna agli cron kick chain ko phir zinda kar degi */
        }
      })
    }

    return NextResponse.json({
      ok: true,
      checked: overdues.length,
      called,
      skipped,
      expiredPromises: expiredPromises.length,
      promiseReminders: promiseCalled,
      chained,
      chainDepth,
      details,
    })
  } catch (err) {
    logger.error('Auto-call cron error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
