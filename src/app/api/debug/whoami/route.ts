/**
 * GET /api/debug/whoami — Debug: current session ka merchant kaun hai?
 * Isse pata chalega login kis merchant me hai aur usme kitne customers hain.
 */
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getSession()
  if (!session?.merchantId) {
    return NextResponse.json({ loggedIn: false, message: 'Koi session nahi — login karo' })
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: session.merchantId },
    select: {
      id: true, businessName: true, phone: true, email: true,
      _count: { select: { customers: true } },
    },
  })

  const totalMerchants = await prisma.merchant.count()

  return NextResponse.json({
    loggedIn: true,
    sessionMerchantId: session.merchantId,
    sessionUserId: session.userId,
    merchantFound: !!merchant,
    merchant: merchant ? {
      businessName: merchant.businessName,
      phone: merchant.phone,
      email: merchant.email,
      customerCount: merchant._count.customers,
    } : null,
    totalMerchantsInDb: totalMerchants,
  })
}
