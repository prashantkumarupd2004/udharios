/**
 * Dynamic DTMF call audio — pre-generates personalized Hindi audio files
 * for flow-builder-based calls. Files are overwritten per call at static
 * URLs so the (static) Exotel flow can play them.
 *
 * URLs:
 *   /api/voice/dynamic/greeting.wav  — personalized greeting + DTMF prompt
 *   /api/voice/dynamic/opt1.wav      — "I will pay" response
 *   /api/voice/dynamic/opt2.wav      — dispute response
 *   /api/voice/dynamic/opt3.wav      — callback later response
 */
import { synthesizeAgentResponse } from '@/lib/voice-agent'
import { logger } from '@/lib/logger'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function uploadDynamic(name: string, audio: Buffer): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/voice-audio/dynamic/${name}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'audio/wav',
      'x-upsert': 'true',
    },
    body: audio as unknown as BodyInit,
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Dynamic upload failed: ${res.status}`)
  // Serve via our same-domain audio proxy (reliable for Exotel's fetcher)
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://udharios.vercel.app').replace(/\/+$/, '')
  return `${appUrl}/api/voice/audio/dynamic/${name}`
}

export interface DtmfCallContent {
  customerName: string
  merchantName: string
  amountINR: string
  daysOverdue: number
  billRef: string
}

// ---------------------------------------------------------------------------
// Hindi script text builders — Exotel (pre-synthesized audio) aur Vobiz
// (<Speak> text) dono yahi text use karte hain. Sirf transport alag hai.
// ---------------------------------------------------------------------------

export function buildDtmfGreetingText(c: DtmfCallContent): string {
  return (
    `Namaste ${c.customerName}! Main ${c.merchantName} ki taraf se bol rahi hoon. ` +
    `Aapka bill number ${c.billRef}, ${c.amountINR} rupaye, ${c.daysOverdue} din se pending hai. ` +
    `Kripya dhyaan dein. ` +
    `Agar aap aaj payment karenge, to 1 dabayein. ` +
    `Agar aap kal payment karenge, to 2 dabayein. ` +
    `Agar bill me koi vivaad hai, to 3 dabayein. ` +
    `Agar aap baad me baat karna chahte hain, to 4 dabayein.`
  )
}

export function buildDtmfOpt1Text(c: DtmfCallContent): string {
  return (
    `Dhanyavaad ${c.customerName}! ` +
    `Aaj aapke ${c.amountINR} rupaye ke payment ka intezaar rahega. ` +
    `${c.merchantName} aapke sahyog ke liye aabhaari hai. Namaste!`
  )
}

export function buildDtmfOpt2Text(c: DtmfCallContent): string {
  return (
    `Dhanyavaad ${c.customerName}! ` +
    `Kal aapke ${c.amountINR} rupaye ke payment ka intezaar rahega. ` +
    `${c.merchantName} aapke sahyog ke liye aabhaari hai. Namaste!`
  )
}

export function buildDtmfOpt3Text(c: DtmfCallContent): string {
  return (
    `${c.customerName}, aapka vivaad darj kar liya gaya hai. ` +
    `Hamari team jald hi aapse sampark karegi aur bill number ${c.billRef} ki jaanch karegi. ` +
    `Asuvidha ke liye khed hai. Dhanyavaad!`
  )
}

export function buildDtmfOpt4Text(c: DtmfCallContent): string {
  return (
    `Theek hai ${c.customerName}. Hum aapse baad me sampark karenge. ` +
    `Kripya dhyaan rahe ki aapka ${c.amountINR} rupaye ka bill ${c.daysOverdue} din se pending hai. ` +
    `Jald payment karne ki kripya karein. Dhanyavaad, namaste!`
  )
}

/**
 * Generate all 4 audio files for a DTMF collection call.
 * Returns the static URLs (same every call, content overwritten).
 */
export interface VobizCallAudioUrls {
  greeting: string
  opt1: string
  opt2: string
  opt3: string
  opt4: string
}

/**
 * Vobiz ke liye per-call unique Sarvam Hindi audio generate karo.
 * <Play> se instant bajega — Vobiz ke slow/kharab <Speak> TTS ki jagah.
 * Files: vobiz-{callId}-greeting.wav etc. (concurrent calls safe).
 */
export async function prepareVobizCallAudio(
  callId: string,
  c: DtmfCallContent
): Promise<VobizCallAudioUrls> {
  const { synthesizeAgentResponse } = await import('@/lib/voice-agent')
  const safeId = callId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32) || 'x'
  const [greeting, opt1, opt2, opt3, opt4] = await Promise.all([
    synthesizeAgentResponse(buildDtmfGreetingText(c)),
    synthesizeAgentResponse(buildDtmfOpt1Text(c)),
    synthesizeAgentResponse(buildDtmfOpt2Text(c)),
    synthesizeAgentResponse(buildDtmfOpt3Text(c)),
    synthesizeAgentResponse(buildDtmfOpt4Text(c)),
  ])
  const names = [
    `vobiz-${safeId}-greeting.wav`,
    `vobiz-${safeId}-opt1.wav`,
    `vobiz-${safeId}-opt2.wav`,
    `vobiz-${safeId}-opt3.wav`,
    `vobiz-${safeId}-opt4.wav`,
  ]
  const audios = [greeting, opt1, opt2, opt3, opt4]
  // Upload to Supabase (proxy URL ignore karo — direct public URL use karenge)
  await Promise.all(names.map((n, i) => uploadDynamic(n, audios[i])))
  // DIRECT Supabase public URL — hamare proxy ka Vercel cold start skip hota hai (~2-4s bachat).
  // Bucket public hona chahiye.
  const direct = (n: string) => `${SUPABASE_URL}/storage/v1/object/public/voice-audio/dynamic/${n}`
  const urls = { greeting: direct(names[0]), opt1: direct(names[1]), opt2: direct(names[2]), opt3: direct(names[3]), opt4: direct(names[4]) }
  logger.info('Vobiz call audio prepared (direct URLs)', { callId: safeId })
  return urls
}

export async function prepareDtmfCallAudio(c: DtmfCallContent): Promise<Record<string, string>> {
  const [greeting, opt1, opt2, opt3, opt4] = await Promise.all([
    synthesizeAgentResponse(buildDtmfGreetingText(c)),
    synthesizeAgentResponse(buildDtmfOpt1Text(c)),
    synthesizeAgentResponse(buildDtmfOpt2Text(c)),
    synthesizeAgentResponse(buildDtmfOpt3Text(c)),
    synthesizeAgentResponse(buildDtmfOpt4Text(c)),
  ])

  const urls: Record<string, string> = {}
  const uploads = await Promise.all([
    uploadDynamic('greeting.wav', greeting),
    uploadDynamic('opt1.wav', opt1),
    uploadDynamic('opt2.wav', opt2),
    uploadDynamic('opt3.wav', opt3),
    uploadDynamic('opt4.wav', opt4),
  ])
  urls.greeting = uploads[0]
  urls.opt1 = uploads[1]
  urls.opt2 = uploads[2]
  urls.opt3 = uploads[3]
  urls.opt4 = uploads[4]

  logger.info('DTMF call audio prepared', { urls })
  return urls
}
