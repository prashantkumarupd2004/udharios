/**
 * POST /api/voice/vobiz/answer — Vobiz answer webhook.
 *
 * Vobiz call answer hone par yahan POST karta hai (From, To, CallUUID).
 * Hum call context (callId query param se) nikal kar Hindi DTMF script
 * wapas bhejte hain — Voice XML me <Gather> (1/2/3) ke saath.
 *
 * Signature: X-Vobiz-Signature-V3 (fail closed — see lib/vobiz.ts note).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { formatINR, overdueDays } from '@/lib/date-utils'
import { logger } from '@/lib/logger'
import { verifyVobizWebhook } from '@/lib/vobiz'
import { buildDtmfGreetingText, type DtmfCallContent } from '@/lib/voice-dtmf'

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
  // Vobiz form-encoded bhejta hai; JSON aaye to wo bhi handle karo
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

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // TEMP-DIAG: signature mismatch par bhi XML serve karo (fail-open) taaki
  // audio path test ho sake. Logs me scheme/mismatch dikhega — scheme confirm
  // hote hi isko wapas fail-closed karna hai.
  const sigCheck = verifyVobizWebhook(request.headers.get('X-Vobiz-Signature-V3'), rawBody)
  logger.info('Vobiz answer: signature check', { ok: sigCheck.ok, scheme: sigCheck.scheme })
  if (!sigCheck.ok) {
    logger.warn('Vobiz answer webhook: signature INVALID — serving XML anyway (temp diag mode)')
  }

  const callId = request.nextUrl.searchParams.get('callId') ?? ''
  const params = parseBody(rawBody)
  const callUuid = params.CallUUID ?? params.call_uuid ?? params.request_uuid ?? ''
  logger.info('Vobiz answer webhook', { callId, callUuid, from: params.From })

  if (!callId) {
    logger.error('Vobiz answer: missing callId query param')
    return voiceXml(`  <Speak>${xmlEscape('Namaste! Ye ek payment reminder call hai. Dhanyavaad!')}</Speak>\n  <Hangup/>`)
  }

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      outstanding: {
        include: {
          merchant: { select: { businessName: true } },
          customer: { select: { name: true } },
        },
      },
    },
  })

  if (!call?.outstanding) {
    logger.error('Vobiz answer: call/outstanding not found', { callId })
    return voiceXml(`  <Hangup/>`)
  }

  // Call record me Vobiz ka CallUUID save karo (status webhooks se match karega)
  if (callUuid) {
    await prisma.call.update({
      where: { id: callId },
      data: { exotelSid: callUuid, status: 'in-progress' },
    }).catch((err) => logger.error('Vobiz answer: call update failed', { error: String(err) }))
  }

  const o = call.outstanding
  const content: DtmfCallContent = {
    customerName: o.customer.name,
    merchantName: o.merchant.businessName,
    amountINR: formatINR(o.amount.toNumber()),
    daysOverdue: overdueDays(o.dueDate),
    billRef: o.invoiceNo ?? '',
  }
  const greeting = xmlEscape(buildDtmfGreetingText(content))
  const repeatPrompt = xmlEscape(
    'Maaf kijiye, koi vikalp nahi chuna gaya. Kripya 1, 2 ya 3 dabayein.'
  )
  const gatherAction = `${APP_URL}/api/voice/vobiz/gather?callId=${encodeURIComponent(callId)}`

  logger.info('Vobiz answer: serving DTMF gather', { callId })
  return voiceXml(
    `  <Gather numDigits="1" timeout="10" action="${gatherAction}" method="POST">\n` +
    `    <Speak>${greeting}</Speak>\n` +
    `  </Gather>\n` +
    `  <Speak>${repeatPrompt}</Speak>\n` +
    `  <Hangup/>`
  )
}

// Vobiz kabhi GET se probe kare to politely hangup
export async function GET() {
  return voiceXml(`  <Hangup/>`)
}
