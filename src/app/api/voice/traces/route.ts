/**
 * GET /api/voice/traces?callId=... — list trace events for a call.
 * Protected by x-test-key (same as test-call).
 */
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  const testKey = req.headers.get('x-test-key') ?? ''
  if (!process.env.SESSION_SECRET || testKey !== process.env.SESSION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const callId = (new URL(req.url).searchParams.get('callId') ?? '').replace(/[^a-zA-Z0-9_-]/g, '_')
  if (!callId) return NextResponse.json({ error: 'Missing callId' }, { status: 400 })

  // List trace files for this call
  const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/voice-audio`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: `traces/${callId}/`, limit: 50, sortBy: { column: 'name', order: 'asc' } }),
  })
  if (!listRes.ok) {
    return NextResponse.json({ error: 'List failed', status: listRes.status }, { status: 502 })
  }
  const files = (await listRes.json()) as Array<{ name: string }>

  // Fetch each trace file's content
  const events = []
  for (const f of files) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/storage/v1/object/public/voice-audio/traces/${callId}/${f.name}`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (r.ok) events.push(await r.json())
    } catch { /* skip */ }
  }

  return NextResponse.json({ callId, events })
}
