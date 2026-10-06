/**
 * Voice call tracer — writes timestamped trace events to Supabase Storage
 * so we can see EXACTLY what happens during a live Exotel call.
 * Read traces via: GET /api/voice/traces?callId=...
 */
import { logger } from '@/lib/logger'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function traceVoiceCall(
  callId: string,
  event: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  try {
    const safeCallId = callId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'unknown'
    const filename = `traces/${safeCallId}/${Date.now()}-${event}.json`
    const body = JSON.stringify({ ts: new Date().toISOString(), event, ...data })
    await fetch(`${SUPABASE_URL}/storage/v1/object/voice-audio/${filename}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'x-upsert': 'true',
      },
      body,
      signal: AbortSignal.timeout(8000),
    })
  } catch (err) {
    logger.error('Voice trace failed', { callId, event, error: String(err) })
  }
}
