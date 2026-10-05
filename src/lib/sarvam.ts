/**
 * Sarvam AI integration for Udhari OS
 * - STT (Speech-to-Text): saaras model, Hindi (hi-IN)
 * - TTS (Text-to-Speech): bulbul model, Hindi
 */

import { logger } from '@/lib/logger'

const SARVAM_API_KEY = process.env.SARVAM_API_KEY!
const SARVAM_API_BASE = process.env.SARVAM_API_BASE_URL ?? 'https://api.sarvam.ai'

// ---------------------------------------------------------------------------
// STT (Speech-to-Text) — saaras model
// ---------------------------------------------------------------------------

export interface TranscribeResult {
  transcript: string
  language: string
  confidence?: number
}

/**
 * Transcribe audio bytes to text using Sarvam saaras (Hindi STT)
 * @param audioBuffer - Audio data (WAV/MP3/OGG)
 * @param mimeType - e.g. 'audio/wav'
 * @param languageCode - e.g. 'hi-IN' (default)
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType = 'audio/wav',
  languageCode = 'hi-IN'
): Promise<TranscribeResult> {
  const formData = new FormData()
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType })
  formData.append('file', blob, 'audio.wav')
  formData.append('language_code', languageCode)
  formData.append('model', 'saaras:v1')
  formData.append('with_timestamps', 'false')
  formData.append('with_diarization', 'false')

  const response = await fetch(`${SARVAM_API_BASE}/speech-to-text`, {
    method: 'POST',
    headers: {
      'api-subscription-key': SARVAM_API_KEY,
    },
    body: formData,
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('Sarvam STT failed', { status: response.status, error })
    throw new Error(`Sarvam STT error ${response.status}: ${error}`)
  }

  const data = await response.json()
  return {
    transcript: data.transcript ?? '',
    language: data.language_code ?? languageCode,
    confidence: data.confidence,
  }
}

// ---------------------------------------------------------------------------
// TTS (Text-to-Speech) — bulbul model
// ---------------------------------------------------------------------------

export interface SynthesizeResult {
  audioBase64: string   // base64-encoded audio
  audioUrl?: string     // if Sarvam returns a URL
  mimeType: string
}

export type SarvamVoice =
  | 'meera'    // Female, standard Hindi
  | 'pavithra' // Female, clear Hindi
  | 'maitreyi' // Female, warm
  | 'arvind'   // Male
  | 'amol'     // Male, authoritative

/**
 * Synthesize Hindi text to speech using Sarvam bulbul
 */
export async function synthesizeSpeech(
  text: string,
  voice: SarvamVoice = 'meera',
  languageCode = 'hi-IN',
  speed = 1.0
): Promise<SynthesizeResult> {
  const response = await fetch(`${SARVAM_API_BASE}/text-to-speech`, {
    method: 'POST',
    headers: {
      'api-subscription-key': SARVAM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: languageCode,
      speaker: voice,
      pitch: 0,
      pace: speed,
      loudness: 1.5,
      speech_sample_rate: 8000,   // 8kHz for telephony
      enable_preprocessing: true,
      model: 'bulbul:v1',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('Sarvam TTS failed', { status: response.status, error })
    throw new Error(`Sarvam TTS error ${response.status}: ${error}`)
  }

  const data = await response.json()

  if (data.audios && data.audios[0]) {
    return {
      audioBase64: data.audios[0],
      mimeType: 'audio/wav',
    }
  }

  throw new Error('Sarvam TTS returned no audio data')
}

// ---------------------------------------------------------------------------
// Translate Hindi Devanagari ↔ Latin script
// ---------------------------------------------------------------------------

export async function translateText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string> {
  const response = await fetch(`${SARVAM_API_BASE}/translate`, {
    method: 'POST',
    headers: {
      'api-subscription-key': SARVAM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      source_language_code: sourceLanguage,
      target_language_code: targetLanguage,
      speaker_gender: 'Male',
      mode: 'formal',
      model: 'mayura:v1',
      enable_preprocessing: false,
    }),
  })

  if (!response.ok) return text // fallback to original

  const data = await response.json()
  return data.translated_text ?? text
}
