/**
 * POST /api/verification/check — Run a background check
 * Body: { checkType, input, input2?, customerId? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { getVerificationProvider, type CheckType } from '@/lib/verification'
import { logger } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.merchantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { checkType, input, input2, customerId } = body as {
    checkType: CheckType; input: string; input2?: string; customerId?: string
  }

  if (!checkType || !input?.trim()) {
    return NextResponse.json({ error: 'checkType aur input chahiye' }, { status: 400 })
  }

  const provider = getVerificationProvider()

  try {
    let result
    switch (checkType) {
      case 'pan_check': result = await provider.panCheck(input); break
      case 'company_check': result = await provider.companyCheck(input); break
      case 'mobile_to_pan': result = await provider.mobileToPan(input); break
      case 'mobile_to_address': result = await provider.mobileToAddress(input); break
      case 'profile_360': result = await provider.profile360(input); break
      case 'pan_to_contact': result = await provider.panToContact(input); break
      case 'credit_report': result = await provider.creditReport(input, input2 ?? ''); break
      default: return NextResponse.json({ error: 'Unknown check type' }, { status: 400 })
    }

    // DB me save karo (history ke liye)
    const saved = await prisma.verification.create({
      data: {
        merchantId: session.merchantId,
        customerId: customerId || null,
        checkType,
        input: result.input,
        provider: provider.id,
        status: result.ok ? 'success' : 'failed',
        result: result.data ? JSON.parse(JSON.stringify(result.data)) : undefined,
        costPaise: result.costPaise ?? 0,
      },
    })

    logger.info('Verification check', { merchantId: session.merchantId, checkType, ok: result.ok })
    return NextResponse.json({ ok: result.ok, result: result.data, error: result.error, id: saved.id, mock: provider.id === 'karza' && !(process.env.KARZA_API_KEY) })
  } catch (e) {
    logger.error('Verification failed', { error: String(e) })
    return NextResponse.json({ ok: false, error: 'Check fail ho gaya' }, { status: 500 })
  }
}

/**
 * GET /api/verification/check — Recent verification history
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.merchantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 50)

  const history = await prisma.verification.findMany({
    where: { merchantId: session.merchantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, checkType: true, input: true, status: true, provider: true, createdAt: true },
  })

  return NextResponse.json({ history })
}
