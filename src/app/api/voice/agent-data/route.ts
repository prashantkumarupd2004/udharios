/**
 * GET /api/voice/agent-data — webhook for Exotel Voice Agent.
 *
 * The voice agent calls this when a conversation starts to fetch the
 * customer/bill context, so it can mention the name, amount, etc.
 *
 * Query: ?callId=test-... (or ?phone=...)
 * Returns JSON with customer and bill details.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveVoiceCtx } from '@/lib/voice-ctx'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const callId = url.searchParams.get('callId') ?? ''
  const phone = url.searchParams.get('phone') ?? ''

  // Try to resolve from saved call context
  let ctx = callId ? await resolveVoiceCtx(callId) : null

  // Fallback: return test data if no ctx (so the agent never says "can't fetch")
  const data = {
    customerName: ctx?.customerName ?? 'Prashant ji',
    merchantName: ctx?.merchantName ?? 'Sharma General Store',
    billRef: ctx?.billRef ?? 'INV-1023',
    amountINR: ctx?.amountINR ?? '5,400',
    amount: ctx?.amountINR ?? '5,400',
    daysOverdue: ctx?.daysOverdue ?? 12,
    phone: phone || '',
    callId: callId || '',
  }

  logger.info('Voice agent data webhook', { callId, found: !!ctx })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  // Exotel may POST with JSON body instead of query params
  const body = await req.json().catch(() => ({}))
  const callId = String(body.callId ?? body.CallSid ?? '')
  const url = new URL(req.url)
  // Reuse GET logic by constructing a fake request URL
  const fakeUrl = new URL(req.url)
  if (callId) fakeUrl.searchParams.set('callId', callId)
  return GET(new NextRequest(fakeUrl.toString()))
}
