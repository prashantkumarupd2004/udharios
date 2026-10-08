import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/exotel/call-context?callId=<uuid>
// Exotel Voicebot Tool (Option 2) is endpoint ko call karega.
// Bot ko CustomField se callId milta hai, usse hum merchant/customer/amount dete hain.
// Public hai — Exotel ke servers bina session ke call karenge.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const callId = searchParams.get('callId')

  if (!callId) {
    return NextResponse.json(
      { ok: false, error: 'callId required' },
      { status: 400 }
    )
  }

  try {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        merchant: { select: { businessName: true, upiVpa: true } },
        customer: { select: { name: true, phone: true } },
        outstanding: { select: { amount: true, invoiceNo: true, dueDate: true } },
      },
    })

    if (!call) {
      return NextResponse.json(
        { ok: false, error: 'call not found' },
        { status: 404 }
      )
    }

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
