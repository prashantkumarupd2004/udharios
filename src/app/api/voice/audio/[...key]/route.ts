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

  // Strict validation: flat WAV filenames, optionally under dynamic/ prefix.
  // (dynamic/ zaroori hai — Vobiz/Exotel ke pre-generated Sarvam audios yahin hote hain)
  if (!/^(dynamic\/)?[a-zA-Z0-9_-]+\.wav$/.test(filename)) {
    return NextResponse.json({ error: 'Invalid audio key' }, { status: 400 })
  }

  const upstream = `${SUPABASE_URL}/storage/v1/object/public/voice-audio/${filename}`
  let res = await fetch(upstream, { signal: AbortSignal.timeout(15000) })

  // Bucket public na ho to service-role key se retry karo
  if (!res.ok) {
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (svcKey) {
      const authed = upstream.replace('/object/public/', '/object/')
      res = await fetch(authed, {
        signal: AbortSignal.timeout(15000),
        headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` },
      })
    }
  }

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
