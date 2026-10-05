/**
 * Razorpay integration for Udhari OS
 * - Payment Links API
 * - Webhook signature verification
 * - Subscriptions API
 */

import crypto from 'crypto'
import { logger } from '@/lib/logger'

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID!
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!

const BASE_URL = 'https://api.razorpay.com/v1'

function authHeader(): string {
  const credentials = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')
  return `Basic ${credentials}`
}

async function razorpayRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    logger.error('Razorpay API error', { path, status: response.status, error })
    throw new Error(`Razorpay API error ${response.status}: ${JSON.stringify(error)}`)
  }

  return response.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Payment Links
// ---------------------------------------------------------------------------

export interface CreatePaymentLinkInput {
  amount: number        // in paise (rupees * 100)
  currency?: string     // default INR
  description: string
  customerName: string
  customerPhone: string
  expiryDate?: number   // Unix timestamp
  notes?: Record<string, string>
  callbackUrl?: string
  callbackMethod?: 'get'
}

export interface RazorpayPaymentLink {
  id: string
  short_url: string
  status: string
  amount: number
  currency: string
  created_at: number
  expire_by?: number
}

export async function createPaymentLink(input: CreatePaymentLinkInput): Promise<RazorpayPaymentLink> {
  return razorpayRequest<RazorpayPaymentLink>('POST', '/payment_links', {
    amount: input.amount,
    currency: input.currency ?? 'INR',
    description: input.description,
    customer: {
      name: input.customerName,
      contact: input.customerPhone,
    },
    notify: {
      sms: false,   // We send our own WhatsApp; disable Razorpay SMS
      email: false,
    },
    reminder_enable: false, // We manage reminders ourselves
    expire_by: input.expiryDate,
    notes: input.notes ?? {},
    callback_url: input.callbackUrl,
    callback_method: input.callbackMethod ?? 'get',
  })
}

export async function cancelPaymentLink(linkId: string): Promise<void> {
  await razorpayRequest('POST', `/payment_links/${linkId}/cancel`)
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// CRITICAL: Must use raw body bytes — never parse JSON before this check
// ---------------------------------------------------------------------------

export function verifyRazorpayWebhookSignature(
  rawBody: Buffer | string,
  signature: string
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex')

    // Use timingSafeEqual to prevent timing attacks
    const sigBuffer = Buffer.from(signature, 'hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')

    if (sigBuffer.length !== expectedBuffer.length) return false
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  } catch (err) {
    logger.error('Webhook signature verification failed', { error: String(err) })
    return false
  }
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export interface CreateSubscriptionInput {
  planId: string
  totalCount?: number   // billing cycles; omit for ongoing
  customerNotify?: number  // 1 = notify customer
  notes?: Record<string, string>
}

export interface RazorpaySubscription {
  id: string
  status: string
  plan_id: string
  current_end: number
  short_url: string
}

export async function createSubscription(input: CreateSubscriptionInput): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>('POST', '/subscriptions', {
    plan_id: input.planId,
    total_count: input.totalCount ?? 120, // 10 years max
    quantity: 1,
    customer_notify: input.customerNotify ?? 1,
    notes: input.notes ?? {},
  })
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await razorpayRequest('POST', `/subscriptions/${subscriptionId}/cancel`, {
    cancel_at_cycle_end: 0,
  })
}

export async function fetchSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>('GET', `/subscriptions/${subscriptionId}`)
}
