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
import { isWithinSendingWindow, formatIndianDate } from '@/lib/date-utils'
import {
  getWhatsAppProvider,
  buildT1Polite,
  buildT2WithUpiOrBank,
  buildMerchantPaymentInfo,
} from '@/lib/providers/WhatsappProvider'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { isEmailConfigured, sendEmail, buildPaymentReminderEmail } from '@/lib/email'
import { logger } from '@/lib/logger'

export const maxDuration = 60

const MAX_CALLS_PER_RUN = 200 // ek invocation ka safety cap (deadline asal governor hai)
const RUN_DEADLINE_MS = 52_000 // 60s function limit se pehle saaf rukna hai
const PLACE_BATCH = 6 // ek saath kitni placements (Sarvam/Vobiz load balance)
const MAX_CHAIN = 40 // ek cron kick se zyada se zyada kitne chained runs

// Provider capacity/congestion errors — saari lines busy, concurrency
// limit, rate limit. In pe call "lagi hi nahi" mani jati hai: attempt
// FREE hoti hai (na daily limit khaye, na gap), agli run turant retry.
function isCapacityError(err: unknown): boolean {
  const msg = String(err)
  return /concurren|capacity|rate.?limit|too many|channel|429|502|503/i.test(msg)
}

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
      // Claim record try se PEHLE banaya — capacity error pe catch me
      // delete karne ke liye id catch ke scope me chahiye.
      const callRecord = await prisma.call.create({
        data: {
          merchantId: o.merchantId,
          outstandingId: o.id,
          customerId: o.customerId,
          exotelSid: `promise-${Date.now()}-${o.id.slice(0, 8)}`,
          status: 'initiated',
        },
      })
      try {

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
        // Capacity error (lines busy) — attempt FREE: record hatao, agli
        // run me turant retry hoga, limit/gap nahi lagega.
        if (isCapacityError(err)) {
          await prisma.call.delete({ where: { id: callRecord.id } }).catch(() => {})
          logger.warn('Promise call capacity — claim released', { outstandingId: o.id })
        }
      }
    })

    // === FAIR ROTATION (DB-level) ===
    // Sirf "300 sabse purane due-date" fetch karna scale pe starvation hai:
    // hazaaron overdues me 300 ke aage wale pool me kabhi aate hi nahi the,
    // unhe call ja hi nahi sakti thi. Ab rotation khud DB karta hai —
    // aaj sabse KAM calls wale pehle, phir jiska last call sabse purana —
    // aur har invocation wahi sahi 300 uthata hai.
    interface RotationRow { id: string; calls_today: number }
    const rotationRows = (await prisma.$queryRaw`
      SELECT o.id AS id,
        (SELECT COUNT(*)::int FROM calls cl
          WHERE cl.outstanding_id = o.id AND cl.created_at >= ${startOfDay}) AS calls_today,
        (SELECT MAX(cl2.created_at) FROM calls cl2
          WHERE cl2.outstanding_id = o.id) AS last_call_at
      FROM outstandings o
      JOIN merchants m ON m.id = o.merchant_id
      JOIN customers c ON c.id = o.customer_id
      WHERE o.due_date <= ${endOfToday}
        AND o.status IN ('overdue', 'upcoming')
        AND o.reminders_paused = false
        AND m.is_kill_switched = false
        AND m.is_approved = true
        AND c.opted_out = false
        AND c.consent = true
        AND c.phone NOT LIKE 'tally-%'
      ORDER BY calls_today ASC, last_call_at ASC NULLS FIRST, o.due_date ASC
      LIMIT 300
    `) as unknown as RotationRow[]

    const callsTodayMap = new Map<string, number>()
    const rotationIndex = new Map<string, number>()
    rotationRows.forEach((r, i) => {
      callsTodayMap.set(r.id, r.calls_today)
      rotationIndex.set(r.id, i)
    })
    const overdueIds = rotationRows.map((r) => r.id)

    // Overdues ka full data (merchant/customer ke saath), rotation order me
    const overduesFetched = overdueIds.length
      ? await prisma.outstanding.findMany({
          where: { id: { in: overdueIds } },
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
        })
      : []
    type FetchedOverdue = (typeof overduesFetched)[number]
    const overdues = overduesFetched
      .slice()
      .sort((a: FetchedOverdue, b: FetchedOverdue) => (rotationIndex.get(a.id) ?? 0) - (rotationIndex.get(b.id) ?? 0))

    // === EMAIL-MODE customers (company wale) ===
    // Inhe calls BILKUL nahi jayengi — sirf professional email reminders
    // (neeche EMAIL PASS me). Query alag try/catch me hai taaki jab tak
    // user reminder_mode column wala SQL na chalaye, call flow safe rahe.
    const emailModeCustomerIds = new Set<string>()
    try {
      const modeRows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM customers WHERE reminder_mode = 'email'
      `
      for (const r of modeRows) emailModeCustomerIds.add(r.id)
    } catch {
      /* column abhi nahi (SQL pending) — koi email-mode customer nahi */
    }
    let emailModeSkipped = 0

    // === PHASE A: saste checks (bina DB) — candidate list ===
    type Candidate = { o: (typeof overdues)[number]; maxCallsToday: number }
    const candidates: Candidate[] = []
    let skipped = 0
    for (const o of overdues) {
      // EMAIL MODE: company customer — calls band, sirf email jayegi
      if (emailModeCustomerIds.has(o.customerId)) {
        emailModeSkipped++
        continue
      }
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
      // Blocked-number pause HATA DIYA GAYA HAI (24 Oct 2026, user order):
      // fail/busy/no-answer hone par bhi auto calls chalte rahenge.
      // Sirf last-call gap check bachta hai.
      const lastCall = await prisma.call.findFirst({
        where: { outstandingId: o.id },
        orderBy: { createdAt: 'desc' },
        select: { status: true, createdAt: true, durationSec: true },
      })

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
        // Capacity error (saari lines busy / provider limit) — attempt
        // FREE karo: claim record delete, taaki nakli call na daily limit
        // khaye na gap lagaye; line khali hote hi agli run retry karegi.
        if (isCapacityError(callErr)) {
          await prisma.call.delete({ where: { id: callRecord.id } }).catch(() => {})
          logger.warn('Auto-call capacity — claim released for retry', { outstandingId: o.id })
        }
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
    // === EMAIL PASS (company customers) ===
    // reminder_mode='email' walo ko professional email reminder.
    // ESCALATION — CALLS wala hi pattern (user ki setting, Oct 23):
    // due se 1 din pehle 1 mail, due din 2, phir roz +2 (4, 6, 8 cap),
    // din bhar dynamic gap ke saath. (Purani 3-din/max-5 cadence hata di.)
    // Poora pass defensive hai — RESEND_API_KEY na ho ya DB migration
    // (email/reminder_mode columns) pending ho to chup-chaap skip;
    // call flow pe koi asar nahi padta.
    const endOfTomorrow = new Date(endOfToday.getTime() + 86400000)
    let emailsSent = 0
    if (isEmailConfigured() && timeLeft() > 5_000) {
      try {
        interface EmailRow {
          id: string
          merchantId: string
          customerId: string
          invoiceNo: string | null
          amount: unknown
          dueDate: Date | string
          merchant: { businessName: string; phone: string }
          customer: { name: string; email: string | null }
          paymentLink: { url: string; shortUrl: string | null } | null
        }
        const emailRows = (await (prisma.outstanding.findMany as any)({
          where: {
            dueDate: { lte: endOfTomorrow },
            status: { in: ['overdue', 'upcoming'] },
            remindersPaused: false,
            merchant: { isKillSwitched: false, isApproved: true },
            customer: {
              reminderMode: 'email',
              email: { not: null },
              optedOut: false,
              consent: true,
            },
          },
          include: {
            merchant: { select: { businessName: true, phone: true } },
            customer: { select: { name: true, email: true } },
            paymentLink: { select: { url: true, shortUrl: true } },
          },
          orderBy: { dueDate: 'asc' },
          take: 40,
        })) as EmailRow[]

        if (emailRows.length) {
          const ids = emailRows.map((r) => r.id)
          interface LogRow { outstandingId: string; sentAt: Date | string }
          const logs = (await (prisma.reminderLog.findMany as any)({
            where: { outstandingId: { in: ids }, channel: 'email', status: 'sent' },
            select: { outstandingId: true, sentAt: true },
            orderBy: { sentAt: 'desc' },
          })) as LogRow[]
          const logMap = new Map<string, { total: number; todayCount: number; lastAt: number }>()
          for (const l of logs) {
            const t = new Date(l.sentAt).getTime()
            const cur = logMap.get(l.outstandingId) ?? { total: 0, todayCount: 0, lastAt: 0 }
            cur.total++
            if (t >= today.getTime()) cur.todayCount++
            if (t > cur.lastAt) cur.lastAt = t
            logMap.set(l.outstandingId, cur)
          }

          // Ek bill ke liye aaj kitni mails — calls wala escalation:
          // due se 1 din pehle = 1, due din = 2, phir roz +2 (8 cap)
          const maxEmailsFor = (r: EmailRow): number => {
            const due = new Date(r.dueDate)
            due.setHours(0, 0, 0, 0)
            const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)
            if (diffDays === 1) return 1 // due se ek din pehle
            if (diffDays > 1) return 0
            const dayIndex = 1 - diffDays // due din = 1, 1 din overdue = 2...
            return Math.min(2 * dayIndex, 8)
          }

          const dueEmails = emailRows.filter((r) => {
            const maxToday = maxEmailsFor(r)
            if (maxToday <= 0) return false
            const info = logMap.get(r.id)
            if ((info?.todayCount ?? 0) >= maxToday) return false
            if (info?.lastAt) {
              // Din bhar ka gap — calls jaisa dynamic (600 min / max per day)
              const gapMin = Math.max(15, Math.floor(600 / maxToday))
              if (Date.now() - info.lastAt < gapMin * 60000) return false
            }
            return true
          })

          await runBatches(dueEmails, 5, async (r: EmailRow) => {
            if (timeLeft() <= 3_000) return
            const reminderNumber = (logMap.get(r.id)?.total ?? 0) + 1
            const dueDayOnly = new Date(r.dueDate)
            dueDayOnly.setHours(0, 0, 0, 0)
            // Signed: -1 = kal due (pre-due mail), 0 = aaj due, +k = k din overdue
            const daysOverdue = Math.round(
              (today.getTime() - dueDayOnly.getTime()) / 86400000
            )
            const { subject, html } = buildPaymentReminderEmail({
              businessName: r.merchant.businessName,
              merchantPhone: r.merchant.phone,
              customerName: r.customer.name,
              invoiceNo: r.invoiceNo ?? '—',
              amount: Number(r.amount),
              dueDate: new Date(r.dueDate),
              daysOverdue,
              paymentLink: r.paymentLink?.shortUrl ?? r.paymentLink?.url ?? null,
              reminderNumber,
            })
            let status: 'sent' | 'failed' = 'sent'
            let externalMsgId: string | undefined
            try {
              const sent = await sendEmail({
                to: r.customer.email as string,
                subject,
                html,
                fromName: r.merchant.businessName,
              })
              externalMsgId = sent.id
              emailsSent++
            } catch (sendErr) {
              status = 'failed'
              logger.error('Email reminder failed', {
                outstandingId: r.id,
                error: String(sendErr),
              })
            }
            await (prisma.reminderLog.create as any)({
              data: {
                merchantId: r.merchantId,
                outstandingId: r.id,
                customerId: r.customerId,
                stage: reminderNumber,
                channel: 'email',
                templateName: 'payment_reminder_v1',
                messageBody: subject,
                status,
                externalMsgId,
              },
            }).catch(() => {})
            if (status === 'sent') {
              await appendAuditLog({
                merchantId: r.merchantId,
                actor: 'system',
                action: AUDIT_ACTIONS.REMINDER_SENT,
                entity: 'outstanding',
                entityId: r.id,
                payload: {
                  channel: 'email',
                  to: r.customer.email,
                  invoiceNo: r.invoiceNo,
                  reminderNumber,
                },
              })
            }
          })
        }
      } catch (emailErr) {
        logger.error('Email reminder pass skipped', { error: String(emailErr) })
      }
    }

    // === WHATSAPP PASS (call-mode customers) ===
    // WhatsApp pe bhi WAHI escalation jo calls/email pe hai (user ki
    // setting): due se 1 din pehle 1, due din 2, phir roz +2 (8 cap),
    // dynamic gap ke saath. Hisaab ReminderLog (channel=whatsapp) se
    // hota hai — isiliye pre-due cron ya purane staged sends pehle se
    // gaye hon to wo bhi count hote hain, double nahi jata.
    // Email-mode customers isme nahi (unhe sirf email jati hai).
    // Template ladder (total count pe): t1_polite -> T2_upi_bank
    // (merchant ka saved UPI/bank ho to). Sirf ye 2 templates bheje jate hain.
    let whatsappSent = 0
    if (process.env.WHATSAPP_API_KEY && timeLeft() > 5_000) {
      try {
        interface WaRow {
          id: string
          merchantId: string
          customerId: string
          invoiceNo: string | null
          amount: unknown
          dueDate: Date | string
          merchant: { businessName: string; quietStart: string; quietEnd: string; upiVpa: string | null; accountHolderName: string | null; accountNumber: string | null; bankName: string | null; ifscCode: string | null }
          customer: { name: string; phone: string }
          paymentLink: { url: string; shortUrl: string | null } | null
        }
        const waRows = (await (prisma.outstanding.findMany as any)({
          where: {
            dueDate: { lte: endOfTomorrow },
            status: { in: ['overdue', 'upcoming'] },
            remindersPaused: false,
            merchant: { isKillSwitched: false, isApproved: true },
            customer: { optedOut: false, consent: true },
          },
          include: {
            merchant: { select: { businessName: true, quietStart: true, quietEnd: true, upiVpa: true, accountHolderName: true, accountNumber: true, bankName: true, ifscCode: true } },
            customer: { select: { name: true, phone: true } },
            paymentLink: { select: { url: true, shortUrl: true } },
          },
          orderBy: { dueDate: 'asc' },
          take: 40,
        })) as WaRow[]

        const waEligible = waRows.filter(
          (r) =>
            !emailModeCustomerIds.has(r.customerId) &&
            /^\+91\d{10}$/.test(r.customer.phone) &&
            isWithinSendingWindow(r.merchant.quietStart, r.merchant.quietEnd)
        )

        if (waEligible.length) {
          const ids = waEligible.map((r) => r.id)
          interface WaLogRow { outstandingId: string; sentAt: Date | string }
          const waLogs = (await (prisma.reminderLog.findMany as any)({
            where: { outstandingId: { in: ids }, channel: 'whatsapp', status: 'sent' },
            select: { outstandingId: true, sentAt: true },
            orderBy: { sentAt: 'desc' },
          })) as WaLogRow[]
          const waLogMap = new Map<string, { total: number; todayCount: number; lastAt: number }>()
          for (const l of waLogs) {
            const t = new Date(l.sentAt).getTime()
            const cur = waLogMap.get(l.outstandingId) ?? { total: 0, todayCount: 0, lastAt: 0 }
            cur.total++
            if (t >= today.getTime()) cur.todayCount++
            if (t > cur.lastAt) cur.lastAt = t
            waLogMap.set(l.outstandingId, cur)
          }

          // Calls/email wala hi max-per-day pattern
          const maxWaFor = (r: WaRow): number => {
            const due = new Date(r.dueDate)
            due.setHours(0, 0, 0, 0)
            const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)
            if (diffDays === 1) return 1 // due se ek din pehle
            if (diffDays > 1) return 0
            const dayIndex = 1 - diffDays
            return Math.min(2 * dayIndex, 8)
          }

          const dueWa = waEligible.filter((r) => {
            const maxToday = maxWaFor(r)
            if (maxToday <= 0) return false
            const info = waLogMap.get(r.id)
            if ((info?.todayCount ?? 0) >= maxToday) return false
            if (info?.lastAt) {
              const gapMin = Math.max(15, Math.floor(600 / maxToday))
              if (Date.now() - info.lastAt < gapMin * 60000) return false
            }
            return true
          })

          const wa = getWhatsAppProvider()
          await runBatches(dueWa, 5, async (r: WaRow) => {
            if (timeLeft() <= 3_000) return
            const total = waLogMap.get(r.id)?.total ?? 0
            const amountINR = `₹${Number(r.amount).toLocaleString('en-IN')}`
            // Sirf 2 templates: t1_polite (pehla msg) aur T2_upi_bank
            // (dobara — merchant ka saved UPI/bank details). Link wala
            // template hata diya (user order).
            let templateName = 't1_polite'
            let components: ReturnType<typeof buildT1Polite> = buildT1Polite(
              r.customer.name,
              r.merchant.businessName,
              amountINR,
              formatIndianDate(new Date(r.dueDate))
            )
            if (total >= 1) {
              const paymentInfo = buildMerchantPaymentInfo(r.merchant)
              if (paymentInfo) {
                templateName = 'T2_upi_bank'
                components = buildT2WithUpiOrBank(
                  r.customer.name,
                  amountINR,
                  r.invoiceNo ?? r.id.slice(0, 8),
                  paymentInfo
                )
              }
              // Payment info save nahi hai to default t1_polite hi jayega
            }

            let status: 'sent' | 'failed' = 'sent'
            let externalMsgId: string | undefined
            let failedReason: string | undefined
            try {
              const result = await wa.sendTemplate({
                to: r.customer.phone.replace(/\D/g, ''),
                templateName,
                components,
              })
              externalMsgId = result.messageId
              if (result.status === 'failed') {
                status = 'failed'
                failedReason = result.error
              } else {
                whatsappSent++
              }
            } catch (sendErr) {
              status = 'failed'
              failedReason = String(sendErr)
              logger.error('WhatsApp pattern send failed', {
                outstandingId: r.id,
                error: failedReason,
              })
            }
            await (prisma.reminderLog.create as any)({
              data: {
                merchantId: r.merchantId,
                outstandingId: r.id,
                customerId: r.customerId,
                stage: total + 1,
                channel: 'whatsapp',
                templateName,
                status,
                externalMsgId,
                failedReason: failedReason ?? null,
              },
            }).catch(() => {})
            if (status === 'sent') {
              await appendAuditLog({
                merchantId: r.merchantId,
                actor: 'system',
                action: AUDIT_ACTIONS.REMINDER_SENT,
                entity: 'outstanding',
                entityId: r.id,
                payload: { channel: 'whatsapp', templateName, count: total + 1 },
              })
            }
          })
        }
      } catch (waErr) {
        logger.error('WhatsApp pattern pass skipped', { error: String(waErr) })
      }
    }

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
      emailsSent,
      whatsappSent,
      emailModeSkipped,
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
