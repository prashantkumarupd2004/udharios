/**
 * POST /api/calls/trigger — Trigger an AI voice call for an outstanding
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { triggerCallSchema } from '@/validations'
import { placeVoiceCall } from '@/lib/voice-provider'
import { isWithinSendingWindow } from '@/lib/date-utils'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { pregenerateGreetingAudio } from '@/lib/tts-greeting'

async function getMerchantId(request: NextRequest): Promise<string | null> {
  const session = await getSession()
    if (!session?.merchantId) return null
return session.merchantId ?? null
}

export async function POST(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { outstandingId, skipQuietHours } = triggerCallSchema.parse(body)

    const outstanding = await prisma.outstanding.findFirst({
      where: { id: outstandingId, merchantId },
      include: {
        merchant: { select: { businessName: true, quietStart: true, quietEnd: true } },
        customer: { select: { name: true, phone: true, optedOut: true } },
      },
    })

    if (!outstanding) {
      return NextResponse.json({ error: 'Outstanding not found' }, { status: 404 })
    }

    if (outstanding.customer.optedOut) {
      return NextResponse.json({ error: 'Customer has opted out' }, { status: 400 })
    }

    if (outstanding.status === 'paid') {
      return NextResponse.json({ error: 'Already paid' }, { status: 400 })
    }

    // Merchant ne is ledger ke reminders manually pause kiye hain
    if (outstanding.remindersPaused) {
      return NextResponse.json(
        { error: 'Reminders is ledger ke liye paused hain — pehle resume karo' },
        { status: 409 }
      )
    }

    // Check sending window (skipQuietHours = testing ke liye)
    if (!skipQuietHours && !isWithinSendingWindow(outstanding.merchant.quietStart, outstanding.merchant.quietEnd)) {
      return NextResponse.json(
        { error: 'Quiet hours mein call nahi ho sakta (9 PM – 9 AM)' },
        { status: 400 }
      )
    }

    // Generate a unique call SID placeholder
    const callSid = `manual-${Date.now()}`

    // Create call record first
    const callRecord = await prisma.call.create({
      data: {
        merchantId,
        outstandingId,
        customerId: outstanding.customerId,
        exotelSid: callSid,
        status: 'initiated',
      },
    })

    // Place the call via the active voice provider (Vobiz primary / Exotel backup).
    // Exotel: dashboard flow URL (stable). Custom voiceUrl Exotel allow nahi karta
    // (call drop). Dynamic ke liye dashboard agent me variables use karne honge.
    // Vobiz: answer_url par Hindi DTMF script (<Speak>/<Gather>) serve hota hai.
    let providerResponse
    try {
      providerResponse = await placeVoiceCall(merchantId, {
        to: outstanding.customer.phone,
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/exotel?callId=${callRecord.id}`,
        record: true,
        // TTS flow: personalized name+amount via dynamic TTS (reliable)
        useTtsFlow: true,
        customField: JSON.stringify({
          callId: callRecord.id,
          outstandingId,
          merchantId,
          customerId: outstanding.customerId,
          merchantName: outstanding.merchant.businessName,
          customerName: outstanding.customer.name,
          amountINR: outstanding.amount.toString(),
        }),
      })

      // Update with real provider call ID
      await prisma.call.update({
        where: { id: callRecord.id },
        data: { exotelSid: providerResponse.providerCallId },
      })

      // Pre-generate premium TTS audio NOW (background) so it's ready
      // when Exotel's flow hits /api/exotel/flow-script seconds later.
      // Without this, flow-script takes 6-7s to generate → Exotel timeout → no audio.
      // (Sirf Exotel ke liye — Vobiz <Speak> se seedha bolta hai.)
      if (providerResponse.provider === 'exotel') {
        pregenerateGreetingAudio({
          customerName: outstanding.customer.name,
          merchantName: outstanding.merchant.businessName,
          amountINR: outstanding.amount.toString(),
        })
      }
    } catch (callErr) {
      await prisma.call.update({
        where: { id: callRecord.id },
        data: { status: 'failed' },
      })
      const errMsg = callErr instanceof Error ? callErr.message : String(callErr)
      logger.error('Voice call placement failed', { error: errMsg })
      return NextResponse.json({ error: `Call placement failed: ${errMsg}` }, { status: 502 })
    }

    await appendAuditLog({
      merchantId,
      actor: 'merchant',
      action: AUDIT_ACTIONS.CALL_PLACED,
      entity: 'outstanding',
      entityId: outstandingId,
      payload: {
        callId: callRecord.id,
        provider: providerResponse?.provider,
        providerCallId: providerResponse?.providerCallId,
        customerPhone: outstanding.customer.phone,
      },
    })

    logger.info('AI voice call triggered', {
      merchantId,
      outstandingId,
      callId: callRecord.id,
    })

    return NextResponse.json({
      call: callRecord,
      message: `Call shuru ho gayi — ${outstanding.customer.name} ke phone par ring ho rahi hai`,
    }, { status: 201 })
  } catch (err) {
    logger.error('POST /api/calls/trigger error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
