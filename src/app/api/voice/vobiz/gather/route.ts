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
import { createDispute } from '@/lib/voice-agent'
import { getWhatsAppProvider, buildT2WithLink } from '@/lib/providers/WhatsappProvider'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

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

  if (!verifyVobizWebhook(request.headers.get('X-Vobiz-Signature-V3'), rawBody)) {
    logger.warn('Vobiz gather webhook: invalid signature — rejecting')
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 403 })
  }

  const callId = request.nextUrl.searchParams.get('callId') ?? ''
  const retried = request.nextUrl.searchParams.get('retried') === '1'
  const params = parseBody(rawBody)
  const digits = (params.Digits ?? params.digits ?? '').trim()
  logger.info('Vobiz gather', { callId, digits })

  if (!callId) {
    return voiceXml(`  <Hangup/>`)
  }

  const call = await prisma.call.findUnique({
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
  })

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
  const gatherAction = (retry: boolean) =>
    `${APP_URL}/api/voice/vobiz/gather?callId=${encodeURIComponent(callId)}${retry ? '&retried=1' : ''}`

  // --- Digit 1: aaj payment — WhatsApp par payment link bhejo ---
  if (digits === '1') {
    const paymentLinkUrl = o.paymentLink
      ? `${APP_URL}/p/${o.paymentLink.id}`
      : undefined
    if (paymentLinkUrl) {
      try {
        const wa = getWhatsAppProvider()
        await wa.sendTemplate({
          to: o.customer.phone,
          templateName: process.env.WA_TEMPLATE_ID_T2 ?? 't2_with_link',
          components: buildT2WithLink(
            o.customer.name,
            formatINR(o.amount.toNumber()),
            o.id,
            paymentLinkUrl
          ),
        })
        logger.info('Vobiz gather: payment link sent on digit 1', { callId })
      } catch (err) {
        logger.error('Vobiz gather: payment link send failed', { callId, error: String(err) })
      }
    }
    await prisma.call.update({
      where: { id: callId },
      data: { outcome: 'paid_already' },
    }).catch((err) => logger.error('Vobiz gather: outcome update failed', { error: String(err) }))
    await appendTranscript(callId, {
      customerSpeech: '[DTMF 1]',
      agentResponse: buildDtmfOpt1Text(content),
      outcome: 'paid_already',
    })
    await appendAuditLog({
      merchantId: call.merchantId,
      actor: 'webhook:vobiz',
      action: AUDIT_ACTIONS.CALL_COMPLETED,
      entity: 'call',
      entityId: callId,
      payload: { digit: '1', outcome: 'paid_already' },
    }).catch(() => {})
    return voiceXml(`  <Speak>${xmlEscape(buildDtmfOpt1Text(content))}</Speak>\n  <Hangup/>`)
  }

  // --- Digit 2: vivaad — dispute create karo ---
  if (digits === '2') {
    await createDispute(
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
      'DTMF 2 — bill me vivaad (Vobiz call)'
    )
    await prisma.call.update({
      where: { id: callId },
      data: { outcome: 'disputed' },
    }).catch((err) => logger.error('Vobiz gather: outcome update failed', { error: String(err) }))
    await appendTranscript(callId, {
      customerSpeech: '[DTMF 2]',
      agentResponse: buildDtmfOpt2Text(content),
      outcome: 'disputed',
    })
    return voiceXml(`  <Speak>${xmlEscape(buildDtmfOpt2Text(content))}</Speak>\n  <Hangup/>`)
  }

  // --- Digit 3: baad me baat karenge ---
  if (digits === '3') {
    await appendTranscript(callId, {
      customerSpeech: '[DTMF 3]',
      agentResponse: buildDtmfOpt3Text(content),
      outcome: 'callback_later',
    })
    return voiceXml(`  <Speak>${xmlEscape(buildDtmfOpt3Text(content))}</Speak>\n  <Hangup/>`)
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
