/**
 * Hosts Sarvam TTS audio on Supabase Storage so Exotel's <Play>
 * verb can fetch it over a public URL during a live call.
 */
import { logger } from '@/lib/logger'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = 'voice-audio'

export async function uploadVoiceAudio(
  audio: Buffer,
  filename: string,
  contentType = 'audio/wav'
): Promise<string> {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: new Uint8Array(audio),
  })

  if (!res.ok) {
    const err = await res.text()
    logger.error('Voice audio upload failed', { status: res.status, err })
    throw new Error(`Voice audio upload failed: ${res.status}`)
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`
}

/** Download a call recording (Exotel RecordingUrl) as a Buffer. */
export async function downloadRecording(recordingUrl: string): Promise<Buffer> {
  const res = await fetch(recordingUrl, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Recording download failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
