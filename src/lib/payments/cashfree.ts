/**
 * Cashfree Payment Gateway adapter for Ugaahi
 *
 * Implements the PaymentGateway interface (src/lib/payments/types.ts):
 * - Payment Links API (x-api-version: 2023-08-01)
 * - Webhook signature verification (HMAC-SHA256 over timestamp + raw body)
 *
 * NOTE: Cashfree signs `x-webhook-timestamp + rawBody` (NOT just the body).
 * The webhook route must pass the timestamp-prepended body as `rawBody`
 * to verifyWebhookSignature — see that method's docs.
 */

import crypto from 'crypto'
import { logger } from '@/lib/logger'
import type {
  CreatePaymentLinkInput,
  GatewayId,
  PaymentGateway,
  PaymentLinkResult,
  WebhookEvent,
} from './types'

const SANDBOX_BASE_URL = 'https://sandbox.cashfree.com/pg'
const LIVE_BASE_URL = 'https://api.cashfree.com/pg'
const API_VERSION = '2023-08-01'

interface CashfreeLinkResponse {
  cf_link_id?: number
  link_id: string
  link_url: string
  link_status?: string
  link_expiry_time?: string
}

/** Phone ko 10-digit Indian format me normalize karo */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

/** link_notes values strings hone chahiye */
function stringifyNotes(notes?: Record<string, string>): Record<string, string> {
  if (!notes) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(notes)) out[k] = String(v)
  return out
}

export class CashfreeGateway implements PaymentGateway {
  readonly id: GatewayId = 'cashfree'
  readonly displayName = 'Cashfree'

  // -------------------------------------------------------------------------
  // Payment Link
  // -------------------------------------------------------------------------

  async createPaymentLink(
    input: CreatePaymentLinkInput,
    credentials: Record<string, string>,
    testMode: boolean,
  ): Promise<PaymentLinkResult> {
    const appId = credentials['appId']
    const secretKey = credentials['secretKey']
    if (!appId || !secretKey) {
      throw new Error('Cashfree credentials missing: appId and secretKey required')
    }

    const baseUrl = testMode ? SANDBOX_BASE_URL : LIVE_BASE_URL

    // Cashfree link_id unique hona chahiye — reuse pe 409 aata hai
    const ref = (input.referenceId ?? 'ugaahi').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
    const linkId = `${ref}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

    // Input paise me aata hai, Cashfree ko rupees chahiye
    const amountRupees = input.amount / 100

    const body: Record<string, unknown> = {
      link_id: linkId,
      link_amount: Math.round(amountRupees * 100) / 100,
      link_currency: input.currency ?? 'INR',
      link_purpose: input.description.slice(0, 255),
      customer_details: {
        customer_phone: normalizePhone(input.customerPhone),
        customer_name: input.customerName,
        ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      },
      link_notes: {
        ...(input.referenceId ? { referenceId: input.referenceId } : {}),
        ...stringifyNotes(input.notes),
      },
      // Reminders hum khud WhatsApp/SMS se bhejte hain — Cashfree wale band
      link_notify: { send_sms: false, send_email: false },
      link_auto_reminders: false,
    }
    if (input.expiryDate) {
      body['link_expiry_time'] = new Date(input.expiryDate * 1000).toISOString()
    }
    if (input.callbackUrl) {
      body['link_meta'] = { return_url: input.callbackUrl }
    }

    const response = await fetch(`${baseUrl}/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': API_VERSION,
        'x-client-id': appId,
        'x-client-secret': secretKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      logger.error('Cashfree API error', { status: response.status, error })
      throw new Error(`Cashfree API error ${response.status}: ${JSON.stringify(error)}`)
    }

    const data = (await response.json()) as CashfreeLinkResponse
    logger.info('Cashfree payment link created', { linkId: data.link_id })

    return {
      linkId: data.link_id,
      shortUrl: data.link_url,
      longUrl: data.link_url,
      status: 'created',
      expiresAt: data.link_expiry_time
        ? Math.floor(new Date(data.link_expiry_time).getTime() / 1000)
        : undefined,
    }
  }

  // -------------------------------------------------------------------------
  // Webhook signature verification
  // CRITICAL: Cashfree signs `x-webhook-timestamp + rawBody` (base64 digest).
  // Isliye route handler ko `x-webhook-timestamp` header ki value ko raw body
  // ke AAGE jodkar `rawBody` me pass karna chahiye. Raw bytes hi use karo —
  // JSON parse karke re-stringify karne se signature toot jayega.
  // -------------------------------------------------------------------------

  verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    credentials: Record<string, string>,
  ): boolean {
    const secretKey = credentials['secretKey']
    if (!secretKey || !signature) return false
    try {
      const expected = crypto.createHmac('sha256', secretKey).update(rawBody).digest('base64')

      const sigBuffer = Buffer.from(signature.trim(), 'base64')
      const expectedBuffer = Buffer.from(expected, 'base64')

      if (sigBuffer.length !== expectedBuffer.length) return false
      return crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    } catch (err) {
      logger.error('Cashfree webhook signature verification failed', { error: String(err) })
      return false
    }
  }

  // -------------------------------------------------------------------------
  // Webhook event parsing
  // Cashfree envelope: { data: {...}, type: "PAYMENT_LINK_EVENT", ... }
  // Link fields `data` ke andar FLAT hote hain (koi data.link wrapper nahi).
  // Amounts strings me aate hain — yahan paise (number) me convert hote hain.
  // -------------------------------------------------------------------------

  parseWebhookEvent(payload: unknown): WebhookEvent {
    const p = (payload ?? {}) as Record<string, unknown>
    const type = typeof p['type'] === 'string' ? p['type'] : ''
    const data = (p['data'] ?? {}) as Record<string, unknown>

    const toPaise = (v: unknown): number => {
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
      return Number.isFinite(n) ? Math.round(n * 100) : 0
    }
    const str = (v: unknown): string => (v == null ? '' : String(v))

    // PAYMENT_LINK_EVENT — har link_status transition pe fire hota hai
    if (type === 'PAYMENT_LINK_EVENT') {
      const linkStatus = str(data['link_status']).toUpperCase()
      const eventType: WebhookEvent['type'] =
        linkStatus === 'PAID' ? 'link.paid' : linkStatus === 'EXPIRED' ? 'link.expired' : 'unknown'

      const order = (data['order'] ?? {}) as Record<string, unknown>
      const linkNotes = (data['link_notes'] ?? {}) as Record<string, unknown>

      return {
        type: eventType,
        gatewayPaymentId: str(order['transaction_id'] ?? order['order_id']),
        gatewayLinkId: data['link_id'] != null ? str(data['link_id']) : undefined,
        amount: toPaise(data['link_amount_paid'] ?? data['link_amount']),
        currency: str(data['link_currency']) || 'INR',
        referenceId:
          linkNotes['referenceId'] != null ? str(linkNotes['referenceId']) : undefined,
        rawPayload: payload,
      }
    }

    // Order-level payment events (har underlying order ke liye alag se aate hain)
    if (type === 'PAYMENT_SUCCESS_WEBHOOK' || type === 'PAYMENT_FAILED_WEBHOOK') {
      const payment = (data['payment'] ?? {}) as Record<string, unknown>
      const order = (data['order'] ?? {}) as Record<string, unknown>

      return {
        type: type === 'PAYMENT_SUCCESS_WEBHOOK' ? 'payment.captured' : 'payment.failed',
        gatewayPaymentId: str(payment['cf_payment_id']),
        amount: toPaise(payment['payment_amount'] ?? order['order_amount']),
        currency: str(payment['payment_currency'] ?? order['order_currency']) || 'INR',
        rawPayload: payload,
      }
    }

    return {
      type: 'unknown',
      gatewayPaymentId: '',
      amount: 0,
      currency: 'INR',
      rawPayload: payload,
    }
  }

  // -------------------------------------------------------------------------
  // Credential fields (settings UI)
  // -------------------------------------------------------------------------

  getCredentialFields(): Array<{
    key: string
    label: string
    placeholder: string
    secret: boolean
    helpText?: string
  }> {
    return [
      {
        key: 'appId',
        label: 'App ID (Client ID)',
        placeholder: 'e.g. TEST1234567890abcdef',
        secret: false,
        helpText: 'Cashfree Dashboard → Developers → API Keys se copy karein',
      },
      {
        key: 'secretKey',
        label: 'Secret Key (Client Secret)',
        placeholder: 'Paste secret key',
        secret: true,
        helpText: 'Kabhi share na karein — webhook signature verification me bhi yehi use hota hai',
      },
    ]
  }
}
