/**
 * Exotel Dynamic TTS Script Endpoint
 *
 * Exotel's Greeting applet calls this URL (configured as "Read text like a robot" URL)
 * Exotel sends: CallSid, From, To, DialWhomNumber, CustomField (our JSON)
 * We return: plain text for TTS (Content-Type: text/plain)
 *
 * Docs: https://support.exotel.com/support/solutions/articles/48285-greeting-using-dynamic-text-or-audio-from-url
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

interface CustomFieldData {
  callId?: string
  outstandingId?: string
  merchantId?: string
  customerId?: string
  merchantName?: string
  customerName?: string
  amountINR?: string
  retryCount?: number
  autoCall?: boolean
}

/**
 * Format amount for TTS — "4500" -> "4,500 rupees"
 */
function formatAmountForTTS(amountStr: string): string {
  const num = parseFloat(amountStr.replace(/[^0-9.]/g, ''))
  if (isNaN(num)) return `${amountStr} rupees`
  // Indian numbering: 4,500 / 1,00,000
  const formatted = num.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  return `${formatted} rupees`
}

/**
 * Build the TTS script from call data
 */
function buildScript(data: CustomFieldData): string {
  const customerName = data.customerName || 'ji'
  const merchantName = data.merchantName || 'Ugaahi'
  const amount = data.amountINR ? formatAmountForTTS(data.amountINR) : null

  // First name only for natural speech
  const firstName = customerName.split(' ')[0]

  let script = `Namaste ${firstName} ji! Main ${merchantName} ki taraf se bol raha hun. `

  if (amount) {
    script += `Aapka ${amount} ka bhugtan baaki hai. `
  } else {
    script += `Aapka kuch bhugtan baaki hai. `
  }

  script += `Kripya jald se jald settle karein. Dhanyavaad!`

  return script
}

/**
 * Parse CustomField JSON safely
 */
function parseCustomField(raw: string | null): CustomFieldData {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as CustomFieldData
  } catch {
    return {}
  }
}

/**
 * Look up call data from DB by our internal call UUID
 */
async function lookupByCallId(callId: string): Promise<CustomFieldData | null> {
  try {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        merchant: { select: { businessName: true } },
        customer: { select: { name: true } },
        outstanding: { select: { amount: true } },
      },
    })
    if (!call) return null
    return {
      callId: call.id,
      merchantName: call.merchant?.businessName,
      customerName: call.customer?.name,
      amountINR: call.outstanding?.amount?.toString(),
    }
  } catch (err) {
    logger.error('flow-script DB lookup failed', { callId, err })
    return null
  }
}

/**
 * GET handler — returns plain text for Exotel TTS
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const customFieldRaw = params.get('CustomField')
  const callSid = params.get('CallSid')

  logger.info('flow-script hit', { callSid, hasCustomField: !!customFieldRaw })

  // Parse data from CustomField (sent by us in placeCall)
  let data = parseCustomField(customFieldRaw)

  // Fallback: if CustomField missing but we have a callId-like value, try DB
  if (!data.customerName && data.callId) {
    const dbData = await lookupByCallId(data.callId)
    if (dbData) data = { ...data, ...dbData }
  }

  const script = buildScript(data)

  logger.info('flow-script response', { script: script.slice(0, 80) })

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}

/**
 * HEAD handler — Exotel requires HEAD support with same headers as GET
 */
export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}
