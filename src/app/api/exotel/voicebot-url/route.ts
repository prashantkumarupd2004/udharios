import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/exotel/voicebot-url
// Exotel Voicebot applet me "stream URL" ki jagah ye HTTPS URL set karo.
// Exotel har call pe is URL ko hit karega (?CallSid=... ke saath),
// hum DB se merchant/customer/amount nikaal ke dynamic WSS URL return karenge.
//
// Response format: { "url": "wss://..." }
// WSS URL me custom params (max 256 chars total, max 3 params) bot ko milenge.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // Exotel CallSid — alag-alag naam se aa sakta hai
  const callSid =
    searchParams.get('CallSid') ??
    searchParams.get('callSid') ??
    searchParams.get('CallSid'.toLowerCase())

  // Base voicebot WSS endpoint — Exotel ko wss:// chahiye, https:// nahi!
  // (Exotel support ne confirm kiya: dynamic endpoint must return wss:// URL)
  const baseUrl =
    process.env.EXOTEL_VOICEBOT_URL ??
    'wss://voicebot.in.exotel.com/voicebot/api/v1/accounts/infotronicsmedia1/bots/9b2449e8-d0f5-4318-8c12-8c4c0a35a578/dp-endpoint'

  if (!callSid) {
    // CallSid nahi mila to bina params ke base URL de do
    return NextResponse.json({ url: baseUrl })
  }

  try {
    const call = await prisma.call.findUnique({
      where: { exotelSid: callSid },
      include: {
        merchant: { select: { businessName: true } },
        customer: { select: { name: true } },
        outstanding: { select: { amount: true } },
      },
    })

    if (!call) {
      return NextResponse.json({ url: baseUrl })
    }

    const params = new URLSearchParams({
      merchantName: call.merchant.businessName,
      customerName: call.customer.name,
      amountINR: call.outstanding.amount.toString(),
    })

    return NextResponse.json({
      url: `${baseUrl}?${params.toString()}`,
    })
  } catch {
    return NextResponse.json({ url: baseUrl })
  }
}
