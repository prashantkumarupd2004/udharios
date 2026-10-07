/**
 * Razorpay Payment Gateway Adapter
 *
 * Implements PaymentGateway interface for Razorpay.
 * Credentials merchant ke apne honge (settings me save).
 */

import crypto from 'crypto'
import { logger } from '@/lib/logger'
import type {
  PaymentGateway,
  CreatePaymentLinkInput,
  PaymentLinkResult,
  WebhookEvent,
  GatewayId,
} from './types'

const BASE_URL = 'https://api.razorpay.com/v1'

interface RazorpayCredentials {
  keyId: string
  keySecret: string
  webhookSecret: string
}

function getCreds(credentials: Record<string, string>): RazorpayCredentials {
  return {
    keyId: credentials.keyId || '',
    keySecret: credentials.keySecret || '',
    webhookSecret: credentials.webhookSecret || '',
  }
}

function authHeader(creds: RazorpayCredentials): string {
  const token = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')
  return `Basic ${token}`
}

async function api<T>(
  creds: RazorpayCredentials,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': authHeader(creds),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown' }))
    logger.error('Razorpay API error', { path, status: res.status })
    throw new Error(`Razorpay error ${res.status}: ${JSON.stringify(err).slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------

export class RazorpayGateway implements PaymentGateway {
  readonly id: GatewayId = 'razorpay'
  readonly displayName = 'Razorpay'

  async createPaymentLink(
    input: CreatePaymentLinkInput,
    credentials: Record<string, string>,
  ): Promise<PaymentLinkResult> {
    const creds = getCreds(credentials)
    if (!creds.keyId || !creds.keySecret) {
      throw new Error('Razorpay credentials missing — settings me Key ID aur Secret dalo')
    }

    const body: Record<string, unknown> = {
      amount: input.amount, // paise me hi chahiye Razorpay ko
      currency: input.currency ?? 'INR',
      description: input.description,
      customer: {
        name: input.customerName,
        contact: input.customerPhone,
        ...(input.customerEmail ? { email: input.customerEmail } : {}),
      },
      notify: { sms: false, email: false }, // Hum khud WhatsApp bhejte hain
      reminder_enable: false,
      notes: {
        ...(input.notes ?? {}),
        ...(input.referenceId ? { ugaahi_reference: input.referenceId } : {}),
      },
    }
    if (input.expiryDate) body.expire_by = input.expiryDate
    if (input.callbackUrl) {
      body.callback_url = input.callbackUrl
      body.callback_method = 'get'
    }

    const result = await api<{
      id: string
      short_url: string
      status: string
      expire_by?: number
    }>(creds, 'POST', '/payment_links', body)

    return {
      linkId: result.id,
      shortUrl: result.short_url,
      status: 'created',
      expiresAt: result.expire_by,
    }
  }

  verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    credentials: Record<string, string>,
  ): boolean {
    try {
      const creds = getCreds(credentials)
      if (!creds.webhookSecret) return false
      const expected = crypto
        .createHmac('sha256', creds.webhookSecret)
        .update(rawBody)
        .digest('hex')
      const a = Buffer.from(signature, 'hex')
      const b = Buffer.from(expected, 'hex')
      if (a.length !== b.length) return false
      return crypto.timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  parseWebhookEvent(payload: unknown): WebhookEvent {
    const p = payload as {
      event?: string
      payload?: {
        payment_link?: { entity?: { id?: string; notes?: Record<string, string> } }
        payment?: { entity?: { id?: string; amount?: number; currency?: string } }
      }
    }
    const event = p.event ?? ''
    const linkEntity = p.payload?.payment_link?.entity
    const payEntity = p.payload?.payment?.entity

    const base = {
      gatewayPaymentId: payEntity?.id ?? '',
      gatewayLinkId: linkEntity?.id,
      amount: payEntity?.amount ?? 0,
      currency: payEntity?.currency ?? 'INR',
      referenceId: linkEntity?.notes?.ugaahi_reference,
      rawPayload: payload,
    }

    if (event === 'payment_link.paid') {
      return { ...base, type: 'link.paid' as const }
    }
    if (event === 'payment.captured') {
      return { ...base, type: 'payment.captured' as const }
    }
    if (event === 'payment.failed') {
      return { ...base, type: 'payment.failed' as const }
    }
    if (event === 'payment_link.expired' || event === 'payment_link.cancelled') {
      return { ...base, type: 'link.expired' as const }
    }
    return { ...base, type: 'unknown' as const }
  }

  getCredentialFields() {
    return [
      {
        key: 'keyId',
        label: 'Key ID',
        placeholder: 'rzp_live_...',
        secret: false,
        helpText: 'Razorpay Dashboard → Settings → API Keys',
      },
      {
        key: 'keySecret',
        label: 'Key Secret',
        placeholder: '••••••••',
        secret: true,
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Secret',
        placeholder: '••••••••',
        secret: true,
        helpText: 'Razorpay Dashboard → Settings → Webhooks',
      },
    ]
  }
}
