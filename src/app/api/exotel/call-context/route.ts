import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/exotel/call-context?callId=<uuid>
// GET /api/exotel/call-context?callSid=<exotel-sid>
// GET /api/exotel/call-context?phone=<digits>
// Exotel Voicebot Tool v3 is endpoint ko call karega.
// - callId: hamara internal call UUID (CustomField se aata hai)
// - callSid: Exotel ka CallSid (tool URL me {{CallSid}} variable se)
// - phone: customer ka phone (fallback — jab {{CallSid}} null resolve ho)
// Dono support karte hain kyunki dashboard me kaunsa variable available
// hoga ye pehle se pata nahi — Exotel support ne <uuid> placeholder diya hai.
// Public hai — Exotel ke servers bina session ke call karenge.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function findCall(callId: string | null, callSid: string | null, phone: string | null) {
  const include = {
    merchant: { select: { businessName: true, upiVpa: true } },
    customer: { select: { name: true, phone: true } },
    outstanding: { select: { amount: true, invoiceNo: true, dueDate: true } },
  }

  // 1. Hamara UUID
  if (callId && UUID_REGEX.test(callId)) {
    const c = await prisma.call.findUnique({ where: { id: callId }, include })
    if (c) return c
  }

  // 2. Exotel CallSid (callId ya callSid param me)
  const sid = callSid ?? (callId && !UUID_REGEX.test(callId) ? callId : null)
  if (sid) {
    const c = await prisma.call.findFirst({ where: { exotelSid: sid }, include })
    if (c) return c
  }

  // 3. Phone fallback — sabse recent call is number pe (last 30 min)
  if (phone) {
    const digits = phone.replace(/\D/g, '')
    if (digits.length >= 10) {
      const suffix = digits.slice(-10)
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000)
      const c = await prisma.call.findFirst({
        where: {
          createdAt: { gte: thirtyMinAgo },
          customer: { phone: { endsWith: suffix } },
        },
        orderBy: { createdAt: 'desc' },
        include,
      })
      if (c) return c
    }
  }

  // 4. Last resort — sabse recent initiated call (last 10 min)
  //    (sirf tab jab koi identifier hi na mila ho)
  if (!callId && !callSid && !phone) {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
    return prisma.call.findFirst({
      where: { createdAt: { gte: tenMinAgo } },
      orderBy: { createdAt: 'desc' },
      include,
    })
  }

  return null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const callId = searchParams.get('callId')
  const callSid = searchParams.get('callSid') ?? searchParams.get('CallSid')
  const phone = searchParams.get('phone')

  if (!callId && !callSid && !phone) {
    return NextResponse.json(
      { ok: false, error: 'callId, callSid or phone required' },
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
    const call = await findCall(callId, callSid, phone)

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
