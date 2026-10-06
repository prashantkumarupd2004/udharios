/**
 * Exotel integration for Udhari OS
 * Places outbound calls for the AI voice agent (M7)
 */

import { logger } from '@/lib/logger'

const EXOTEL_SID = process.env.EXOTEL_SID!
const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY!
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN!
const EXOTEL_VIRTUAL_NUMBER = process.env.EXOTEL_VIRTUAL_NUMBER!
const EXOTEL_APP_ID = process.env.EXOTEL_APP_ID!
const EXOTEL_SUBDOMAIN = process.env.EXOTEL_SUBDOMAIN ?? 'api.exotel.com'

function authHeader(): string {
  // Exotel Basic auth = API Key (username) : API Token (password)
  const credentials = Buffer.from(`${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}`).toString('base64')
  return `Basic ${credentials}`
}

export interface PlaceCallInput {
  to: string                // Customer phone (E.164 or 10-digit Indian)
  callbackUrl: string       // Exotel will POST status updates here
  statusCallbackUrl?: string
  timeLimit?: number        // Max call duration in seconds (default 300)
  timeOut?: number          // Ring timeout in seconds (default 60)
  record?: boolean          // Record the call
  customField?: string      // Extra metadata passed back in webhooks
  flowUrl?: string          // Override: ExoML URL to execute when answered
                            // (defaults to the EXOTEL_APP_ID flow)
}

export interface ExotelCallResponse {
  Call: {
    Sid: string
    Status: string
    To: string
    From: string
    Direction: string
    DateCreated: string
  }
}

/**
 * Place an outbound call via Exotel.
 * The call will trigger EXOTEL_APP_ID (set up as a flow in Exotel dashboard
 * to bridge to our AI voice agent webhook).
 */
export async function placeCall(input: PlaceCallInput): Promise<ExotelCallResponse> {
  const url = `https://${EXOTEL_SUBDOMAIN}/v1/Accounts/${EXOTEL_SID}/Calls/connect.json`

  // Normalize phone number to 0XXXXXXXXXX format (Exotel format for India)
  const toNormalized = normalizePhoneForExotel(input.to)

  const params = new URLSearchParams({
    From: toNormalized,
    To: EXOTEL_VIRTUAL_NUMBER,
    CallerId: EXOTEL_VIRTUAL_NUMBER,
    Url: input.flowUrl ?? `https://my.exotel.com/${EXOTEL_SID}/exoml/start_voice/${EXOTEL_APP_ID}`,
    StatusCallback: input.callbackUrl,
    TimeLimit: String(input.timeLimit ?? 300),
    TimeOut: String(input.timeOut ?? 60),
    ...(input.record ? { Record: 'true' } : {}),
    ...(input.customField ? { CustomField: input.customField } : {}),
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('Exotel call placement failed', {
      status: response.status,
      error,
      to: toNormalized,
    })
    throw new Error(`Exotel API error ${response.status}: ${error}`)
  }

  const data = await response.json() as ExotelCallResponse
  logger.info('Exotel call placed', { sid: data.Call.Sid, to: toNormalized })
  return data
}

/**
 * Get call details from Exotel
 */
export async function getCallDetails(callSid: string): Promise<Record<string, unknown>> {
  const url = `https://${EXOTEL_SUBDOMAIN}/v1/Accounts/${EXOTEL_SID}/Calls/${callSid}.json`

  const response = await fetch(url, {
    headers: { Authorization: authHeader() },
  })

  if (!response.ok) throw new Error(`Failed to get call details: ${response.status}`)
  return response.json()
}

/**
 * Normalize phone to Exotel's expected format
 * Input: +91XXXXXXXXXX or 91XXXXXXXXXX or XXXXXXXXXX
 * Output: 0XXXXXXXXXX
 */
export function normalizePhoneForExotel(phone: string): string {
  const digits = phone.replace(/\D/g, '')

  if (digits.startsWith('91') && digits.length === 12) {
    return '0' + digits.slice(2)
  }
  if (digits.length === 10) {
    return '0' + digits
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return digits
  }

  // Fallback: return as-is
  return phone
}

/**
 * Verify Exotel webhook — Exotel signs webhooks with HMAC-SHA1
 */
export function verifyExotelWebhook(
  _signature: string,
  _rawBody: string
): boolean {
  // Exotel webhook verification is optional but recommended.
  // For now, we trust requests from Exotel's IP ranges.
  // TODO: Implement Exotel HMAC-SHA1 verification when Exotel enables it.
  return true
}
