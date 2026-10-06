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

/**
 * Generate all 4 audio files for a DTMF collection call.
 * Returns the static URLs (same every call, content overwritten).
 */
export async function prepareDtmfCallAudio(c: DtmfCallContent): Promise<Record<string, string>> {
  const greetingText =
    `Namaste ${c.customerName}! Main ${c.merchantName} ki taraf se Udhari OS se bol rahi hoon. ` +
    `Aapka bill number ${c.billRef}, ${c.amountINR} rupaye, ${c.daysOverdue} din se pending hai. ` +
    `Kripya dhyaan dein. ` +
    `Agar aap aaj payment karna chahte hain, to 1 dabayein. ` +
    `Agar bill me koi vivaad hai, to 2 dabayein. ` +
    `Agar aap baad me baat karna chahte hain, to 3 dabayein.`

  const opt1Text =
    `Dhanyavaad ${c.customerName}! ` +
    `Aapke ${c.amountINR} rupaye ke payment ke liye aapko turant ek UPI payment link bheja jayega. ` +
    `Kripya link par click karke payment poora karein. ${c.merchantName} aapke sahyog ke liye aabhaari hai. Namaste!`

  const opt2Text =
    `${c.customerName}, aapka vivaad darj kar liya gaya hai. ` +
    `Hamari team jald hi aapse sampark karegi aur bill number ${c.billRef} ki jaanch karegi. ` +
    `Asuvidha ke liye khed hai. Dhanyavaad!`

  const opt3Text =
    `Theek hai ${c.customerName}. Hum aapse baad me sampark karenge. ` +
    `Kripya dhyaan rahe ki aapka ${c.amountINR} rupaye ka bill ${c.daysOverdue} din se pending hai. ` +
    `Jald payment karne ki kripya karein. Dhanyavaad, namaste!`

  const [greeting, opt1, opt2, opt3] = await Promise.all([
    synthesizeAgentResponse(greetingText),
    synthesizeAgentResponse(opt1Text),
    synthesizeAgentResponse(opt2Text),
    synthesizeAgentResponse(opt3Text),
  ])

  const urls: Record<string, string> = {}
  const uploads = await Promise.all([
    uploadDynamic('greeting.wav', greeting),
    uploadDynamic('opt1.wav', opt1),
    uploadDynamic('opt2.wav', opt2),
    uploadDynamic('opt3.wav', opt3),
  ])
  urls.greeting = uploads[0]
  urls.opt1 = uploads[1]
  urls.opt2 = uploads[2]
  urls.opt3 = uploads[3]

  logger.info('DTMF call audio prepared', { urls })
  return urls
}
