/**
 * GET /api/cron/pre-due-reminders — Smart pre-due reminder system.
 *
 * User requirement:
 * - Due date se 1 DIN PEHLE → 1 WhatsApp message (ek baar)
 * - Due date WALE DIN → 2 AI voice calls (subah + dopahar)
 *
 * Phases (Vercel Cron se):
 * - ?phase=morning   (9:30 AM IST): WhatsApp to due-tomorrow + Call #1 to due-today
 * - ?phase=afternoon  (3:00 PM IST): Call #2 to due-today (agar abhi tak paid nahi)
 *
 * Guards:
 * - Sirf 9 AM – 9 PM sending window
 * - consent=true, optedOut=false, real phone number
 * - Merchant kill-switch OFF, approved
 * - WhatsApp: ek outstanding ko ek baar (ReminderLog check)
 * - Call #1: din me pehli call
 * - Call #2: sirf agar Call #1 ho chuki aur abhi tak unpaid hai
 *
 * Auth: CRON_SECRET bearer token
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { placeCall } from '@/lib/exotel'
import { isWithinSendingWindow } from '@/lib/date-utils'
import { getWhatsAppProvider, buildT1Polite } from '@/lib/providers/WhatsappProvider'
import { pregenerateGreetingAudio } from '@/lib/tts-greeting'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

const MAX_PER_RUN = 50

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function isValidPhone(phone: string): boolean {
  return /^\+91\d{10}$/.test(phone)
}

async function getEligibleOutstandings(dueDate: Date) {
  const dayStart = startOfDay(dueDate)
  const dayEnd = addDays(dayStart, 1)

  return prisma.outstanding.findMany({
    where: {
      dueDate: { gte: dayStart, lt: dayEnd },
      status: { in: ['upcoming', 'overdue'] },
      remindersPaused: false,
      merchant: { isKillSwitched: false, isApproved: true },
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
    take: MAX_PER_RUN * 2,
  })
}

type OutstandingRow = Awaited<ReturnType<typeof getEligibleOutstandings>>[number]

/**
 * Send 1 WhatsApp reminder (T-1 day before due).
 */
async function sendPreDueWhatsApp(o: OutstandingRow): Promise<boolean> {
  // Already sent WhatsApp for this outstanding recently?
  const twoDaysAgo = addDays(new Date(), -2)
  const alreadySent = await prisma.reminderLog.findFirst({
    where: {
      outstandingId: o.id,
      channel: 'whatsapp',
      sentAt: { gte: twoDaysAgo },
    },
  })
  if (alreadySent) return false

  if (!isValidPhone(o.customer.phone)) return false
  if (!isWithinSendingWindow(o.merchant.quietStart, o.merchant.quietEnd)) return false

  try {
    const provider = getWhatsAppProvider()
    const dueStr = o.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

    const result = await provider.sendTemplate({
      to: o.customer.phone,
      templateName: 't1_polite',
      components: buildT1Polite(
        o.customer.name.split(' ')[0],
        o.merchant.businessName,
        `₹${Number(o.amount).toLocaleString('en-IN')}`,
        dueStr
      ),
    })

    await prisma.reminderLog.create({
      data: {
        merchantId: o.merchantId,
        outstandingId: o.id,
        customerId: o.customerId,
        stage: 0, // pre-due stage
        channel: 'whatsapp',
        templateName: 't1_polite',
        status: result.status === 'failed' ? 'failed' : 'sent',
        externalMsgId: result.messageId ?? null,
        failedReason: result.status === 'failed' ? result.error ?? 'unknown' : null,
      },
    })

    logger.info('Pre-due WhatsApp sent', { outstandingId: o.id, customer: o.customer.name })
    return result.status !== 'failed'
  } catch (err) {
    logger.error('Pre-due WhatsApp failed', { outstandingId: o.id, error: String(err) })
    return false
  }
}

/**
 * Place an AI voice call for due-today outstanding.
 * callNumber: 1 (morning) ya 2 (afternoon)
 */
async function placeDueCall(o: OutstandingRow, callNumber: 1 | 2): Promise<boolean> {
  const todayStart = startOfDay(new Date())

  // Kitni calls aaj ho chuki?
  const callsToday = await prisma.call.count({
    where: {
      outstandingId: o.id,
      createdAt: { gte: todayStart },
    },
  })

  // Call #1: 0 calls honi chahiye. Call #2: exactly 1 call honi chahiye.
  if (callNumber === 1 && callsToday > 0) return false
  if (callNumber === 2 && callsToday !== 1) return false

  if (!isValidPhone(o.customer.phone)) return false
  if (!isWithinSendingWindow(o.merchant.quietStart, o.merchant.quietEnd)) return false

  // Abhi tak paid to nahi ho gaya?
  const fresh = await prisma.outstanding.findUnique({
    where: { id: o.id },
    select: { status: true },
  })
  if (fresh?.status === 'paid') return false

  try {
    // Pre-generate TTS audio pehle (fast Exotel response ke liye)
    pregenerateGreetingAudio({
      customerName: o.customer.name,
      merchantName: o.merchant.businessName,
      amountINR: o.amount.toString(),
    })

    const callRecord = await prisma.call.create({
      data: {
        merchantId: o.merchantId,
        outstandingId: o.id,
        customerId: o.customerId,
        exotelSid: `predue-${Date.now()}-${o.id.slice(0, 8)}`,
        status: 'initiated',
      },
    })

    const exotelResponse = await placeCall({
      to: o.customer.phone,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/exotel?callId=${callRecord.id}`,
      record: true,
      useTtsFlow: true,
      customField: JSON.stringify({
        callId: callRecord.id,
        outstandingId: o.id,
        merchantId: o.merchantId,
        customerId: o.customerId,
        merchantName: o.merchant.businessName,
        customerName: o.customer.name,
        amountINR: o.amount.toString(),
        autoCall: true,
        preDue: true,
        callNumber,
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
      payload: { callId: callRecord.id, auto: true, preDue: true, callNumber },
    }).catch(() => {})

    logger.info('Pre-due call placed', { outstandingId: o.id, callNumber, customer: o.customer.name })
    return true
  } catch (err) {
    logger.error('Pre-due call failed', { outstandingId: o.id, callNumber, error: String(err) })
    return false
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const phase = request.nextUrl.searchParams.get('phase') ?? 'morning'
  const today = new Date()
  const tomorrow = addDays(today, 1)

  const stats = { whatsappSent: 0, callsPlaced: 0, skipped: 0, statusFixed: 0, details: [] as string[] }

  try {
    // ── STEP 0: Status sync — due date nikal gaya to upcoming→overdue ──
    // Ye har run pe chalta hai taaki ledger hamesha sahi dikhe.
    const todayStart = startOfDay(today)
    const syncResult = await prisma.outstanding.updateMany({
      where: {
        dueDate: { lt: todayStart },
        status: 'upcoming',
      },
      data: { status: 'overdue' },
    })
    stats.statusFixed = syncResult.count
    if (syncResult.count > 0) {
      logger.info('Status sync: upcoming→overdue', { count: syncResult.count })
    }

    if (phase === 'morning') {
      // 1. WhatsApp to due-TOMORROW (T-1)
      const dueTomorrow = await getEligibleOutstandings(tomorrow)
      for (const o of dueTomorrow) {
        if (stats.whatsappSent >= MAX_PER_RUN) break
        const sent = await sendPreDueWhatsApp(o)
        if (sent) {
          stats.whatsappSent++
          stats.details.push(`WA: ${o.customer.name} (₹${Number(o.amount).toLocaleString('en-IN')}, due kal)`)
        } else {
          stats.skipped++
        }
      }

      // 2. Call #1 to due-TODAY (morning)
      const dueToday = await getEligibleOutstandings(today)
      for (const o of dueToday) {
        if (stats.callsPlaced >= MAX_PER_RUN) break
        const called = await placeDueCall(o, 1)
        if (called) {
          stats.callsPlaced++
          stats.details.push(`Call#1: ${o.customer.name} (₹${Number(o.amount).toLocaleString('en-IN')})`)
        } else {
          stats.skipped++
        }
      }
    } else if (phase === 'afternoon') {
      // Call #2 to due-TODAY (afternoon) — sirf agar Call #1 ho chuki
      const dueToday = await getEligibleOutstandings(today)
      for (const o of dueToday) {
        if (stats.callsPlaced >= MAX_PER_RUN) break
        const called = await placeDueCall(o, 2)
        if (called) {
          stats.callsPlaced++
          stats.details.push(`Call#2: ${o.customer.name} (₹${Number(o.amount).toLocaleString('en-IN')})`)
        } else {
          stats.skipped++
        }
      }
    } else {
      return NextResponse.json({ error: 'Invalid phase. Use ?phase=morning or ?phase=afternoon' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, phase, ...stats })
  } catch (err) {
    logger.error('Pre-due reminders cron error', { phase, error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
