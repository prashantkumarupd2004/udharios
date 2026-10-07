/**
 * GET /api/voice/connect — Dynamic ExoML for outbound AI calls.
 *
 * Exotel ke static dashboard agent ko bypass karke, har call ke liye
 * merchant-specific greeting generate karta hai:
 * "Namaste! Main {merchantName} ki taraf se bol rahi hun..."
 *
 * Query: callId (Call record ka ID)
 * Returns: ExoML XML
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { formatINR, overdueDays } from '@/lib/date-utils'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function GET(request: NextRequest) {
  const callId = request.nextUrl.searchParams.get('callId')

  // Default fallback (agar callId na mile)
  const fallbackSay = 'Namaste! Ye ek payment reminder call hai. Kripya apne vyapari se sampark karein. Dhanyavaad!'

  if (!callId) {
    return new NextResponse(
      `<Response><Say voice="female" language="hi-IN">${fallbackSay}</Say></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }

  try {
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
      return new NextResponse(
        `<Response><Say voice="female" language="hi-IN">${fallbackSay}</Say></Response>`,
        { headers: { 'Content-Type': 'text/xml' } }
      )
    }

    const merchantName = call.outstanding.merchant.businessName
    const customerName = call.outstanding.customer.name
    const amount = formatINR(call.outstanding.amount.toNumber())
    const days = overdueDays(call.outstanding.dueDate)
    const billRef = call.outstanding.invoiceNo

    // Dynamic Hindi script — merchant ke naam ke saath
    const greeting = xmlEscape(
      `Namaste ${customerName} ji! Main ${merchantName} ki taraf se bol rahi hun. ` +
      `Aapka ${billRef ? `bill number ${billRef} ka ` : ''}${amount} ka bhugtan ` +
      `${days > 0 ? `${days} din se ` : ''}baaki hai. Kripya jald se jald settle karein. ` +
      `Dhanyavaad!`
    )

    // ExoML: pehle greeting, phir 5 sec suno, phir dobara repeat karke hangup
    const exoml = `<Response>
  <Say voice="female" language="hi-IN">${greeting}</Say>
  <Pause length="2"/>
  <Say voice="female" language="hi-IN">${xmlEscape(
    `Ek baar phir — ${merchantName} se ${amount} ka payment baaki hai. Kripya jald bhugtan karein. Dhanyavaad, namaste!`
  )}</Say>
  <Hangup/>
</Response>`

    logger.info('Dynamic voice ExoML served', { callId, merchantName })
    return new NextResponse(exoml, {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (err) {
    logger.error('Voice connect error', { error: String(err), callId })
    return new NextResponse(
      `<Response><Say voice="female" language="hi-IN">${fallbackSay}</Say></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }
}
