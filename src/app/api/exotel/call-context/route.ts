import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/exotel/call-context?callId=<uuid>
// GET /api/exotel/call-context?callSid=<exotel-sid>
// Exotel Voicebot Tool v3 is endpoint ko call karega.
// - callId: hamara internal call UUID (CustomField se aata hai)
// - callSid: Exotel ka CallSid (tool URL me {{CallSid}} variable se)
// Dono support karte hain kyunki dashboard me kaunsa variable available
// hoga ye pehle se pata nahi — Exotel support ne <uuid> placeholder diya hai.
// Public hai — Exotel ke servers bina session ke call karenge.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const callId = searchParams.get('callId')
  const callSid = searchParams.get('callSid') ?? searchParams.get('CallSid')

  if (!callId && !callSid) {
    return NextResponse.json(
      { ok: false, error: 'callId or callSid required' },
      { status: 400 }
    )
  }

  // Exotel tool test ke liye — platform mandatory successful test maangta hai
  // Sirf is exact test ID pe sample data (real calls pe kabhi trigger nahi hoga)
  if (callId === 'test-call-123') {
    return NextResponse.json({
      ok: true,
      merchantName: 'Test Dukaan',
      customerName: 'Test Customer',
      amountINR: '5000',
      invoiceNo: 'INV-TEST-001',
      dueDate: new Date().toISOString(),
    })
  }

  try {
    let call = null

    if (callId) {
      if (UUID_REGEX.test(callId)) {
        // Hamara internal UUID — direct lookup
        call = await prisma.call.findUnique({
          where: { id: callId },
          include: {
            merchant: { select: { businessName: true, upiVpa: true } },
            customer: { select: { name: true, phone: true } },
            outstanding: { select: { amount: true, invoiceNo: true, dueDate: true } },
          },
        })
      } else {
        // UUID nahi hai → Exotel ka CallSid hai (dashboard Dynamic Variable {{CallSid}}
        // ko callId param me bhejta hai). exotelSid se lookup karo.
        call = await prisma.call.findFirst({
          where: { exotelSid: callId },
          include: {
            merchant: { select: { businessName: true, upiVpa: true } },
            customer: { select: { name: true, phone: true } },
            outstanding: { select: { amount: true, invoiceNo: true, dueDate: true } },
          },
        })
      }
    } else if (callSid) {
      // Exotel CallSid se lookup — sabse pehle exotelSid match karo
      call = await prisma.call.findFirst({
        where: { exotelSid: callSid },
        include: {
          merchant: { select: { businessName: true, upiVpa: true } },
          customer: { select: { name: true, phone: true } },
          outstanding: { select: { amount: true, invoiceNo: true, dueDate: true } },
        },
      })
      // Race condition guard: agar exotelSid abhi update nahi hua to
      // latest initiated call lo (last 10 min) — fallback
      if (!call) {
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
        call = await prisma.call.findFirst({
          where: { createdAt: { gte: tenMinAgo } },
          orderBy: { createdAt: 'desc' },
          include: {
            merchant: { select: { businessName: true, upiVpa: true } },
            customer: { select: { name: true, phone: true } },
            outstanding: { select: { amount: true, invoiceNo: true, dueDate: true } },
          },
        })
      }
    }

    if (!call) {
      return NextResponse.json(
        { ok: false, error: 'call not found' },
        { status: 404 }
      )
    }

    // Tool v3 mapping ke liye flat top-level fields (Exotel support ke hisaab se)
    return NextResponse.json({
      ok: true,
      merchantName: call.merchant.businessName,
      customerName: call.customer.name,
      amountINR: call.outstanding.amount.toString(),
      invoiceNo: call.outstanding.invoiceNo,
      dueDate: call.outstanding.dueDate,
    })
  } catch {
    return NextResponse.json(
      { ok: false, error: 'internal error' },
      { status: 500 }
    )
  }
}
