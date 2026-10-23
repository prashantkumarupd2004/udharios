/**
 * POST /api/merchant/test-whatsapp — Merchant apne (ya kisi) number pe
 * ek test WhatsApp reminder bhej ke check kar sakta hai ki WhatsApp
 * system chal raha hai ya nahi (Settings → Reminders → WhatsApp Test).
 *
 * CRON_SECRET wale /api/test/send-whatsapp ka merchant version —
 * session-auth hai, koi secret nahi chahiye. Rate limit: 5/hour
 * (audit-log count se).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import {
  getWhatsAppProvider,
  buildT1Polite,
} from '@/lib/providers/WhatsappProvider'
import { appendAuditLog } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Sabse common failure pehle hi saaf bata do
    if (!process.env.WHATSAPP_API_KEY) {
      return NextResponse.json(
        { error: 'WHATSAPP_API_KEY Vercel env me set nahi hai — pehle wo set karo' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const raw = String(body.to ?? '').replace(/\D/g, '')
    const to =
      raw.length === 10
        ? `+91${raw}`
        : raw.length === 12 && raw.startsWith('91')
          ? `+${raw}`
          : ''
    if (!/^\+91\d{10}$/.test(to)) {
      return NextResponse.json(
        { error: 'Sahi 10-digit mobile number daalo' },
        { status: 400 }
      )
    }

    // Halki rate-limit: 5 test per hour per merchant
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recent = await prisma.auditLog.count({
      where: {
        merchantId: session.merchantId,
        action: 'whatsapp.test',
        createdAt: { gte: hourAgo },
      },
    })
    if (recent >= 5) {
      return NextResponse.json(
        { error: 'Ek ghante me 5 test ho gaye — thodi der baad try karo' },
        { status: 429 }
      )
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: session.merchantId },
      select: { businessName: true },
    })

    const provider = getWhatsAppProvider()
    const result = await provider.sendTemplate({
      to,
      templateName: 't1_polite',
      components: buildT1Polite(
        'Test',
        merchant?.businessName ?? 'Test Business',
        '₹5,000',
        'Kal'
      ),
    })

    await appendAuditLog({
      merchantId: session.merchantId,
      actor: 'merchant',
      action: 'whatsapp.test',
      entity: 'merchant',
      entityId: session.merchantId,
      payload: { to, status: result.status, messageId: result.messageId },
    })

    logger.info('Merchant WhatsApp test', {
      merchantId: session.merchantId,
      to,
      status: result.status,
    })

    return NextResponse.json({
      ok: result.status !== 'failed',
      status: result.status,
      messageId: result.messageId,
      error: result.error ?? null,
    })
  } catch (err) {
    logger.error('POST /api/merchant/test-whatsapp error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
