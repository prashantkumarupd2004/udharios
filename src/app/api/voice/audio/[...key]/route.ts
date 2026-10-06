/**
 * GET /api/voice/audio/<filename> — proxies TTS audio from Supabase Storage.
 *
 * Exotel's <Play> fetches audio from OUR domain reliably (it already fetches
 * our ExoML here), so we serve the WAV through this endpoint instead of
 * linking Supabase directly.
 */
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params
  const filename = key.join('/')

  // Strict validation: only flat WAV filenames from the voice-audio bucket
  if (!/^[a-zA-Z0-9_-]+\.wav$/.test(filename)) {
    return NextResponse.json({ error: 'Invalid audio key' }, { status: 400 })
  }

  const upstream = `${SUPABASE_URL}/storage/v1/object/public/voice-audio/${filename}`
  const res = await fetch(upstream, { signal: AbortSignal.timeout(15000) })
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: 'Audio not found' }, { status: 404 })
  }

  const headers = new Headers()
  headers.set('Content-Type', 'audio/wav')
  headers.set('Cache-Control', 'public, max-age=86400')
  const len = res.headers.get('content-length')
  if (len) headers.set('Content-Length', len)

  return new NextResponse(res.body, { headers })
}
