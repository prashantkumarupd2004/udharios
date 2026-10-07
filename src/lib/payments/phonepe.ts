/**
 * PhonePe Payment Gateway adapter for Ugaahi
 * Implements the PaymentGateway interface (src/lib/payments/types.ts)
 *
 * Uses PhonePe PG v2 Pay Page API:
 *   Test: https://api-preprod.phonepe.com/apis/pg-sandbox
 *   Live: https://api.phonepe.com/apis/hermes
 *
 * Flow:
 *  1. createPaymentLink -> POST /pg/v1/pay (base64 payload + X-VERIFY)
 *     PhonePe returns a hosted Pay Page URL -> customer ko bhejo
 *  2. Payment ke baad PhonePe callbackUrl pe POST karta hai
 *     (base64 response + X-VERIFY header) -> verify + parse
 *
 * NOTE: Credentials function params se aate hain — process.env kabhi use nahi hota.
 */

import crypto from 'crypto'
import { logger } from '@/lib/logger'
import type {
  CreatePaymentLinkInput,
  PaymentGateway,
  PaymentLinkResult,
  WebhookEvent,
} from './types'

const TEST_BASE_URL = 'https://api-preprod.phonepe.com/apis/pg-sandbox'
const LIVE_BASE_URL = 'https://api.phonepe.com/apis/hermes'
const PAY_PATH = '/pg/v1/pay'

interface PhonePeCredentials {
  merchantId: string
  saltKey: string
  saltIndex: string
}

function getCreds(credentials: Record<string, string>): PhonePeCredentials {
  const merchantId = credentials.merchantId?.trim()
  const saltKey = credentials.saltKey?.trim()
  const saltIndex = credentials.saltIndex?.trim() || '1'
  if (!merchantId || !saltKey) {
    throw new Error('PhonePe credentials missing: merchantId aur saltKey zaroori hain')
  }
  return { merchantId, saltKey, saltIndex }
}

/** X-VERIFY header banao: SHA256(base64Payload + apiPath + saltKey) + "###" + saltIndex */
function buildXVerify(base64Payload: string, apiPath: string, saltKey: string, saltIndex: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(base64Payload + apiPath + saltKey)
    .digest('hex')
  return `${hash}###${saltIndex}`
}

/** Unique merchantTransactionId: referenceId_timestamp (PhonePe me har txn unique hona chahiye) */
function buildMerchantTransactionId(referenceId?: string): string {
  const ts = Date.now()
  const safe = (referenceId || 'TXN').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'TXN'
  return `${safe}_${ts}`
}

/** merchantTransactionId se wapas referenceId nikalo (aakhri _<timestamp> hatao) */
function extractReferenceId(merchantTransactionId: string): string | undefined {
  const m = merchantTransactionId.match(/^(.*)_(\d{13,})$/)
  if (!m) return merchantTransactionId || undefined
  if (m[1] === 'TXN') return undefined
  return m[1] || undefined
}

// ---------------------------------------------------------------------------
// PhonePe response types
// ---------------------------------------------------------------------------

interface PhonePePayResponse {
  success: boolean
  code: string
  message: string
  data?: {
    merchantId: string
    merchantTransactionId: string
    instrumentResponse?: {
      type: string
      redirectInfo?: {
        url: string
        method: string
      }
    }
  }
}

interface PhonePeCallbackData {
  merchantId?: string
  merchantTransactionId?: string
  transactionId?: string
  amount?: number
  paymentState?: string
  responseCode?: string
}

interface PhonePeCallbackDecoded {
  success: boolean
  code: string
  message: string
  data?: PhonePeCallbackData
}

/** Callback payload ko decode karo — string (base64), {response: base64}, ya decoded object */
function decodeCallbackPayload(payload: unknown): PhonePeCallbackDecoded | null {
  try {
    if (typeof payload === 'string') {
      const trimmed = payload.trim()
      if (!trimmed) return null
      // Base64 hai ya plain JSON?
      const json = trimmed.startsWith('{')
        ? trimmed
        : Buffer.from(trimmed, 'base64').toString('utf8')
      return JSON.parse(json) as PhonePeCallbackDecoded
    }
    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>
      if (typeof obj.response === 'string') {
        return decodeCallbackPayload(obj.response)
      }
      return obj as unknown as PhonePeCallbackDecoded
    }
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Gateway implementation
// ---------------------------------------------------------------------------

export class PhonePeGateway implements PaymentGateway {
  readonly id = 'phonepe' as const
  readonly displayName = 'PhonePe PG'

  async createPaymentLink(
    input: CreatePaymentLinkInput,
    credentials: Record<string, string>,
    testMode: boolean,
  ): Promise<PaymentLinkResult> {
    const { merchantId, saltKey, saltIndex } = getCreds(credentials)
    const baseUrl = testMode ? TEST_BASE_URL : LIVE_BASE_URL

    if (!Number.isFinite(input.amount) || input.amount < 100) {
      throw new Error('PhonePe: amount kam se kam ₹1 (100 paise) hona chahiye')
    }

    const merchantTransactionId = buildMerchantTransactionId(input.referenceId)

    const payload = {
      merchantId,
      merchantTransactionId,
      merchantUserId: input.customerPhone.replace(/\D/g, '').slice(-10) || 'UGAHAI_USER',
      amount: Math.round(input.amount), // paise me — conversion nahi chahiye
      redirectUrl: input.callbackUrl ?? '',
      redirectMode: 'POST',
      callbackUrl: input.callbackUrl ?? '',
      mobileNumber: input.customerPhone.replace(/\D/g, '').slice(-10),
      paymentInstrument: { type: 'PAY_PAGE' },
    }

    const base64Payload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
    const xVerify = buildXVerify(base64Payload, PAY_PATH, saltKey, saltIndex)

    let res: Response
    try {
      res = await fetch(`${baseUrl}${PAY_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
        },
        body: JSON.stringify({ request: base64Payload }),
      })
    } catch (err) {
      logger.error('PhonePe pay API network error', { error: String(err), testMode })
      throw new Error(`PhonePe se connect nahi ho paya: ${String(err)}`)
    }

    const data = (await res.json().catch(() => null)) as PhonePePayResponse | null
    if (!res.ok || !data?.success) {
      logger.error('PhonePe pay API error', {
        status: res.status,
        code: data?.code,
        message: data?.message,
        testMode,
      })
      throw new Error(`PhonePe error ${data?.code ?? res.status}: ${data?.message ?? 'Unknown error'}`)
    }

    const redirectUrl = data.data?.instrumentResponse?.redirectInfo?.url
    if (!redirectUrl) {
      logger.error('PhonePe pay API: redirect URL missing', { code: data.code, testMode })
      throw new Error('PhonePe ne payment page URL nahi diya')
    }

    logger.info('PhonePe payment link created', {
      merchantTransactionId,
      amount: input.amount,
      testMode,
    })

    return {
      linkId: merchantTransactionId,
      shortUrl: redirectUrl,
      longUrl: redirectUrl,
      status: 'active',
      expiresAt: input.expiryDate,
    }
  }

  /**
   * PhonePe callback verification.
   * PhonePe callbackUrl pe base64 response bhejta hai, X-VERIFY header ke saath:
   *   X-VERIFY = SHA256(base64Response + saltKey) + "###" + saltIndex
   * rawBody = raw base64 response string (parse karne se PEHLE verify karo!)
   */
  verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    credentials: Record<string, string>,
  ): boolean {
    try {
      const { saltKey, saltIndex } = getCreds(credentials)
      const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody
      const base64Response = bodyStr.trim()

      const expected = buildXVerify(base64Response, '', saltKey, saltIndex)
      const sigBuf = Buffer.from(signature.trim())
      const expBuf = Buffer.from(expected)

      if (sigBuf.length !== expBuf.length) return false
      return crypto.timingSafeEqual(sigBuf, expBuf)
    } catch (err) {
      logger.error('PhonePe webhook signature verification failed', { error: String(err) })
      return false
    }
  }

  parseWebhookEvent(payload: unknown): WebhookEvent {
    const decoded = decodeCallbackPayload(payload)

    const fallback: WebhookEvent = {
      type: 'unknown',
      gatewayPaymentId: '',
      amount: 0,
      currency: 'INR',
      rawPayload: payload,
    }
    if (!decoded?.data) return fallback

    const d = decoded.data
    const state = (d.paymentState || '').toUpperCase()
    const type: WebhookEvent['type'] =
      state === 'COMPLETED' ? 'payment.captured'
      : state === 'FAILED' ? 'payment.failed'
      : 'unknown'

    return {
      type,
      gatewayPaymentId: d.transactionId || d.merchantTransactionId || '',
      gatewayLinkId: d.merchantTransactionId,
      amount: typeof d.amount === 'number' ? Math.round(d.amount) : 0, // paise me
      currency: 'INR',
      referenceId: d.merchantTransactionId
        ? extractReferenceId(d.merchantTransactionId)
        : undefined,
      rawPayload: payload,
    }
  }

  getCredentialFields() {
    return [
      {
        key: 'merchantId',
        label: 'Merchant ID',
        placeholder: 'e.g. PGTESTPAYUAT / M22...',
        secret: false,
        helpText: 'PhonePe dashboard se milta hai',
      },
      {
        key: 'saltKey',
        label: 'Salt Key',
        placeholder: 'Salt key yahan paste karein',
        secret: true,
        helpText: 'Kabhi share mat karo — ye payment sign karta hai',
      },
      {
        key: 'saltIndex',
        label: 'Salt Index',
        placeholder: '1',
        secret: false,
        helpText: 'Aam taur pe "1" hota hai',
      },
    ]
  }
}

export const phonepeGateway = new PhonePeGateway()
export default phonepeGateway
