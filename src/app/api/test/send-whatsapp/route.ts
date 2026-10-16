/**
 * POST /api/test/send-whatsapp — Test WhatsApp reminder send.
 *
 * Temporary testing endpoint. Sends a t1_polite template to the given number.
 * Protected by CRON_SECRET (same as cron endpoints). Fail-closed: denied
 * unless CRON_SECRET is set AND the bearer token matches.
 *
 * Body: { to: "+918200218733", customerName?: string, amount?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getWhatsAppProvider, buildT1Polite } from '@/lib/providers/WhatsappProvider'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/** Constant-time string comparison (resists timing attacks). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export async function POST(request: NextRequest) {
  // Same auth as cron endpoints — but FAIL CLOSED: if CRON_SECRET is unset,
  // nobody gets in (previously the guard was skipped entirely).
  const authHeader = request.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !safeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const to = body.to as string
    if (!to || !/^\+91\d{10}$/.test(to)) {
      return NextResponse.json({ error: 'Valid +91 number required' }, { status: 400 })
    }

    const customerName = (body.customerName as string) || 'Test Customer'
    const amount = (body.amount as string) || '₹5,000'
    const dueDate = 'Kal'

    const provider = getWhatsAppProvider()
    const result = await provider.sendTemplate({
      to,
      templateName: 't1_polite',
      components: buildT1Polite(customerName.split(' ')[0], 'Test Business', amount, dueDate),
    })

    logger.info('Test WhatsApp sent', { to, status: result.status })

    return NextResponse.json({
      ok: result.status !== 'failed',
      status: result.status,
      messageId: result.messageId,
      error: result.error,
    })
  } catch (err) {
    logger.error('Test WhatsApp failed', { error: String(err) })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
