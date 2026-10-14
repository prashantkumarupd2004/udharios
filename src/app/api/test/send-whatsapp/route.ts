/**
 * POST /api/test/send-whatsapp — Test WhatsApp reminder send.
 *
 * Temporary testing endpoint. Sends a T1_polite template to the given number.
 * Protected by CRON_SECRET (same as cron endpoints).
 *
 * Body: { to: "+918200218733", customerName?: string, amount?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppProvider, buildT1Polite } from '@/lib/providers/WhatsappProvider'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Same auth as cron endpoints
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
      templateName: 'T1_polite',
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
