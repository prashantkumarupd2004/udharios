import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /p/[id] — payment link redirect
// WhatsApp template button: https://udharios.vercel.app/p/{{4}}
// {{4}} = payment_links.id → yahan se actual gateway URL pe redirect
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const link = await prisma.paymentLink.findUnique({
    where: { id },
    select: { shortUrl: true, status: true },
  })

  if (!link || !link.shortUrl) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Already paid ya expired to bhi redirect kar do (gateway khud batayega)
  return NextResponse.redirect(link.shortUrl)
}
