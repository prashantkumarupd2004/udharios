/**
 * POST /api/voice/vobiz/gather — Vobiz DTMF digit handler.
 *
 * Customer ke 1/2/3 dabane par:
 *   1 → "aaj payment" — WhatsApp par payment link bhejo, outcome 'paid_already'
 *   2 → "vivaad" — dispute create karo, outcome 'disputed'
 *   3 → "baad me baat" — transcript me note, politely hangup
 *   (koi digit nahi / galat digit → ek baar dobara puchho, phir hangup)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { formatINR, overdueDays } from '@/lib/date-utils'
import { logger } from '@/lib/logger'
import { verifyVobizWebhook } from '@/lib/vobiz'
import {
  buildDtmfGreetingText,
  buildDtmfOpt1Text,
  buildDtmfOpt2Text,
  buildDtmfOpt3Text,
  type DtmfCallContent,
} from '@/lib/voice-dtmf'
import { createDispute, createPromise } from '@/lib/voice-agent'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { resolveVoiceCtx } from '@/lib/voice-ctx'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://udharios.vercel.app').replace(/\/+$/, '')

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function voiceXml(body: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${body}\n</Response>`
  return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } })
}

function parseBody(raw: string): Record<string, string> {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) out[k] = String(v ?? '')
    return out
  } catch {
    const out: Record<string, string> = {}
    for (const [k, v] of new URLSearchParams(raw)) out[k] = v
    return out
  }
}

async function appendTranscript(callId: string, entry: Record<string, unknown>) {
  try {
    const call = await prisma.call.findUnique({ where: { id: callId }, select: { transcript: true } })
    const existing = (call?.transcript as unknown[]) ?? []
    const newTranscript = [
      ...existing,
      { ...entry, timestamp: new Date().toISOString() },
    ]
    const updateData: Record<string, unknown> = { transcript: newTranscript }
    await prisma.call.update({
      where: { id: callId },
      data: updateData,
    })
  } catch (err) {
    logger.error('Vobiz gather: transcript append failed', { callId, error: String(err) })
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // TEMP-DIAG: fail-open with logging (see answer route note)
  const sigCheck = verifyVobizWebhook(request.headers.get('X-Vobiz-Signature-V3'), rawBody)
  logger.info('Vobiz gather: signature check', { ok: sigCheck.ok, scheme: sigCheck.scheme })
  if (!sigCheck.ok) {
    logger.warn('Vobiz gather webhook: signature INVALID — processing anyway (temp diag mode)')
  }

  const callId = request.nextUrl.searchParams.get('callId') ?? ''
  const retried = request.nextUrl.searchParams.get('retried') === '1'
  const params = parseBody(rawBody)
  const digits = (params.Digits ?? params.digits ?? '').trim()
  logger.info('Vobiz gather', { callId, digits })

  if (!callId) {
    return voiceXml(`  <Hangup/>`)
  }

  // Audio URLs query params me (tez) — DB se nahi nikalne padte
  const sp2 = request.nextUrl.searchParams
  const qpAudio = sp2.get('ag')
    ? { greeting: sp2.get('ag')!, opt1: sp2.get('a1') ?? '', opt2: sp2.get('a2') ?? '', opt3: sp2.get('a3') ?? '' }
    : null

  // DB queries PARALLEL me — sequential nahi (tez)
  const [call, ctxAudio] = await Promise.all([
    prisma.call.findUnique({
      where: { id: callId },
      include: {
        outstanding: {
          include: {
            merchant: { select: { businessName: true } },
            customer: { select: { name: true, phone: true } },
            paymentLink: { select: { id: true } },
          },
        },
      },
    }),
    qpAudio ? Promise.resolve(null) : resolveVoiceCtx(callId).catch(() => null),
  ])
  const vobizAudio = qpAudio ?? ctxAudio?.vobizAudio ?? null

  if (!call?.outstanding) {
    logger.error('Vobiz gather: call/outstanding not found', { callId })
    return voiceXml(`  <Hangup/>`)
  }

  const o = call.outstanding
  const content: DtmfCallContent = {
    customerName: o.customer.name,
    merchantName: o.merchant.businessName,
    amountINR: formatINR(o.amount.toNumber()),
    daysOverdue: overdueDays(o.dueDate),
    billRef: o.invoiceNo ?? '',
  }
  const gatherActionRaw = (retry: boolean) =>
    `${APP_URL}/api/voice/vobiz/gather?callId=${encodeURIComponent(callId)}${retry ? '&retried=1' : ''}` +
    (vobizAudio?.greeting
      ? `&ag=${encodeURIComponent(vobizAudio.greeting)}&a1=${encodeURIComponent(vobizAudio.opt1)}` +
        `&a2=${encodeURIComponent(vobizAudio.opt2)}&a3=${encodeURIComponent(vobizAudio.opt3)}`
      : '')
  // XML attribute me & → &amp; zaroori (warna Vobiz parser fail → call cut)
  const gatherAction = (retry: boolean) => xmlEscape(gatherActionRaw(retry))
  const speakOrPlay = (key: 'opt1' | 'opt2' | 'opt3', text: string) =>
    vobizAudio?.[key]
      ? `<Play>${xmlEscape(vobizAudio[key])}</Play>`
      : `<Speak>${xmlEscape(text)}</Speak>`

  // Promise helper — digit 1 (aaj) / 2 (kal): promise save + dhanyavaad + hangup
  const savePromise = async (daysFromNow: number, digitLabel: string) => {
    const promisedDate = new Date()
    promisedDate.setDate(promisedDate.getDate() + daysFromNow)
    promisedDate.setHours(0, 0, 0, 0)
    // Dono writes PARALLEL me — sequential me slow tha
    await Promise.all([
      createPromise(
        {
          callId,
          outstandingId: o.id,
          merchantId: call.merchantId,
          customerId: call.customerId,
          merchantName: o.merchant.businessName,
          customerName: o.customer.name,
          amountINR: formatINR(o.amount.toNumber()),
          daysOverdue: overdueDays(o.dueDate),
          billRef: o.invoiceNo ?? undefined,
        },
        promisedDate
      ).catch((err) =>
        logger.error('Vobiz gather: promise save failed', { callId, error: String(err) })
      ),
      prisma.call.update({
        where: { id: callId },
        data: { outcome: 'promised' },
      }).catch((err) => logger.error('Vobiz gather: outcome update failed', { error: String(err) })),
    ])
    logger.info('Vobiz gather: promise saved', { callId, digitLabel, promisedDate: promisedDate.toISOString().slice(0, 10) })
  }

  // --- Digit 1: "aaj kar dunga" — promise TODAY, dhanyavaad, hangup ---
  if (digits === '1') {
    await savePromise(0, '1-aaj').catch((err) =>
      logger.error('Vobiz gather: promise save failed', { callId, error: String(err) })
    )
    // Logs background me — XML turant wapas (tez jawab)
    appendTranscript(callId, {
      customerSpeech: '[DTMF 1 — aaj kar dunga]',
      agentResponse: buildDtmfOpt1Text(content),
      outcome: 'promised',
    }).catch(() => {})
    appendAuditLog({
      merchantId: call.merchantId,
      actor: 'webhook:vobiz',
      action: AUDIT_ACTIONS.CALL_COMPLETED,
      entity: 'call',
      entityId: callId,
      payload: { digit: '1', outcome: 'promised', promise: 'today' },
    }).catch(() => {})
    return voiceXml(`  ${speakOrPlay('opt1', buildDtmfOpt1Text(content))}\n  <Hangup/>`)
  }

  // --- Digit 2: "kal kar dunga" — promise TOMORROW, dhanyavaad, hangup ---
  if (digits === '2') {
    await savePromise(1, '2-kal').catch((err) =>
      logger.error('Vobiz gather: promise save failed', { callId, error: String(err) })
    )
    // Logs background me — XML turant wapas (tez jawab)
    appendTranscript(callId, {
      customerSpeech: '[DTMF 2 — kal kar dunga]',
      agentResponse: buildDtmfOpt2Text(content),
      outcome: 'promised',
    }).catch(() => {})
    appendAuditLog({
      merchantId: call.merchantId,
      actor: 'webhook:vobiz',
      action: AUDIT_ACTIONS.CALL_COMPLETED,
      entity: 'call',
      entityId: callId,
      payload: { digit: '2', outcome: 'promised', promise: 'tomorrow' },
    }).catch(() => {})
    return voiceXml(`  ${speakOrPlay('opt2', buildDtmfOpt2Text(content))}\n  <Hangup/>`)
  }


  // --- Digit 3: vivaad — dispute create karo ---
  if (digits === '3') {
    // Dispute + outcome PARALLEL me — transcript background me (tez jawab)
    await Promise.all([
      createDispute(
        {
          callId,
          outstandingId: o.id,
          merchantId: call.merchantId,
          customerId: call.customerId,
          merchantName: o.merchant.businessName,
          customerName: o.customer.name,
          amountINR: formatINR(o.amount.toNumber()),
          daysOverdue: overdueDays(o.dueDate),
          billRef: o.invoiceNo ?? undefined,
        },
        'DTMF 3 — bill me vivaad (Vobiz call)'
      ),
      prisma.call.update({
        where: { id: callId },
        data: { outcome: 'disputed' },
      }).catch((err) => logger.error('Vobiz gather: outcome update failed', { error: String(err) })),
    ])
    appendTranscript(callId, {
      customerSpeech: '[DTMF 3]',
      agentResponse: buildDtmfOpt3Text(content),
      outcome: 'disputed',
    }).catch(() => {})
    return voiceXml(`  ${speakOrPlay('opt3', buildDtmfOpt3Text(content))}\n  <Hangup/>`)
  }
  // --- Galat / koi digit nahi: ek baar dobara puchho, phir hangup ---
  if (!retried) {
    const greeting = xmlEscape(buildDtmfGreetingText(content))
    return voiceXml(
      `  <Gather numDigits="1" timeout="10" action="${gatherAction(true)}" method="POST">\n` +
      `    <Speak>${xmlEscape('Maaf kijiye, samajh nahi aaya. Kripya 1, 2 ya 3 dabayein.')}</Speak>\n` +
      `  </Gather>\n` +
      `  <Speak>${greeting}</Speak>\n` +
      `  <Hangup/>`
    )
  }

  await appendTranscript(callId, {
    customerSpeech: '[DTMF timeout]',
    agentResponse: 'Koi jawab nahi mila — call samapt.',
    outcome: 'no_answer',
  })
  return voiceXml(
    `  <Speak>${xmlEscape('Koi jawab nahi mila. Hum baad me dobara sampark karenge. Dhanyavaad!')}</Speak>\n  <Hangup/>`
  )
}

export async function GET() {
  return voiceXml(`  <Hangup/>`)
}
