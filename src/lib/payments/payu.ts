/**
 * PayU Payment Gateway adapter for Ugaahi
 *
 * - Payment links: PayU Invoicing API (create_invoice) via postservice.php
 *   Fallback: hosted checkout URL (/_payment) agar invoicing enable na ho
 * - Webhook: PayU surl/furl POST — reverse SHA512 hash verification
 *
 * Credentials merchant settings se aate hain (decrypted) — process.env mat use karo.
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

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

const TEST_POSTSERVICE = 'https://test.payu.in/merchant/postservice.php?form=2'
const LIVE_POSTSERVICE = 'https://info.payu.in/merchant/postservice.php?form=2'
const TEST_CHECKOUT = 'https://test.payu.in/_payment'
const LIVE_CHECKOUT = 'https://secure.payu.in/_payment'

function postserviceUrl(testMode: boolean): string {
  return testMode ? TEST_POSTSERVICE : LIVE_POSTSERVICE
}

function checkoutUrl(testMode: boolean): string {
  return testMode ? TEST_CHECKOUT : LIVE_CHECKOUT
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha512Hex(data: string): string {
  return crypto.createHash('sha512').update(data, 'utf8').digest('hex')
}

/** PayU txnid — unique, max 25 chars */
function generateTxnid(): string {
  const rand = crypto.randomBytes(4).toString('hex')
  const ts = Date.now().toString(36)
  return `ugaahi${ts}${rand}`.slice(0, 25)
}

/** Paise → "100.00" format jo PayU chahta hai */
function toRupees(amountPaise: number): string {
  return (amountPaise / 100).toFixed(2)
}

/** Phone — sirf digits, last 10 */
function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

/** Firstname — PayU sirf alphabets allow karta hai */
function cleanName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
  return (cleaned || 'Customer').slice(0, 60)
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a.toLowerCase(), 'hex')
    const bufB = Buffer.from(b.toLowerCase(), 'hex')
    if (bufA.length !== bufB.length) return false
    return crypto.timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

interface PayUCredentials {
  merchantKey: string
  salt: string
}

function getCreds(credentials: Record<string, string>): PayUCredentials {
  const merchantKey = (credentials.merchantKey || '').trim()
  const salt = (credentials.salt || '').trim()
  if (!merchantKey || !salt) {
    throw new Error('PayU credentials missing: merchantKey aur salt dono chahiye')
  }
  return { merchantKey, salt }
}

// ---------------------------------------------------------------------------
// PayU postservice API call
// ---------------------------------------------------------------------------

async function payuPostservice(
  testMode: boolean,
  fields: Record<string, string>,
): Promise<Record<string, unknown>> {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)

  const response = await fetch(postserviceUrl(testMode), {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    throw new Error(`PayU API HTTP ${response.status}`)
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return data
}

// ---------------------------------------------------------------------------
// Invoice response se payment link nikalo
// ---------------------------------------------------------------------------

const LINK_KEYS = [
  'invoice_url',
  'payment_url',
  'pay_url',
  'invoice_link',
  'payment_link',
  'short_url',
  'link',
  'url',
]

function extractLink(data: Record<string, unknown>): string | undefined {
  const pools: Record<string, unknown>[] = [data]
  const nested = data.data
  if (nested && typeof nested === 'object') pools.push(nested as Record<string, unknown>)

  for (const pool of pools) {
    for (const key of LINK_KEYS) {
      const val = pool[key]
      if (typeof val === 'string' && /^https?:\/\//i.test(val)) return val
    }
  }
  return undefined
}

function extractInvoiceId(data: Record<string, unknown>): string | undefined {
  const pools: Record<string, unknown>[] = [data]
  const nested = data.data
  if (nested && typeof nested === 'object') pools.push(nested as Record<string, unknown>)

  for (const pool of pools) {
    for (const key of ['invoice_id', 'invoiceId', 'id']) {
      const val = pool[key]
      if (val !== undefined && val !== null && String(val) !== '') return String(val)
    }
  }
  return undefined
}

function isInvoiceSuccess(data: Record<string, unknown>): boolean {
  const status = data.status
  if (status === 1 || status === '1') return true
  const msg = String(data.msg ?? data.message ?? '').toLowerCase()
  return msg.includes('success')
}

// ---------------------------------------------------------------------------
// Hosted checkout URL (fallback) — /_payment with signed query params
// ---------------------------------------------------------------------------

function buildHostedCheckoutUrl(
  testMode: boolean,
  params: {
    key: string
    txnid: string
    amount: string
    productinfo: string
    firstname: string
    email: string
    phone: string
    surl: string
    furl: string
    udf1: string
    salt: string
  },
): string {
  const { key, txnid, amount, productinfo, firstname, email, phone, surl, furl, udf1, salt } = params
  const hash = sha512Hex(
    [key, txnid, amount, productinfo, firstname, email, udf1, '', '', '', '', '', '', '', '', '', salt].join('|'),
  )

  const qs = new URLSearchParams({
    key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    phone,
    surl,
    furl,
    udf1,
    hash,
  })
  return `${checkoutUrl(testMode)}?${qs.toString()}`
}

// ---------------------------------------------------------------------------
// PayU Gateway
// ---------------------------------------------------------------------------

export class PayUGateway implements PaymentGateway {
  readonly id: GatewayId = 'payu'
  readonly displayName = 'PayU'

  // ---------------------------------------------------------------
  // Payment link banao — Invoicing API (create_invoice)
  // ---------------------------------------------------------------
  async createPaymentLink(
    input: CreatePaymentLinkInput,
    credentials: Record<string, string>,
    testMode: boolean,
  ): Promise<PaymentLinkResult> {
    const { merchantKey: key, salt } = getCreds(credentials)

    const txnid = generateTxnid()
    const amount = toRupees(input.amount)
    const productinfo = (input.description || 'Ugaahi Payment').slice(0, 100)
    const firstname = cleanName(input.customerName)
    const email = (input.customerEmail || 'noreply@ugaahi.com').slice(0, 100)
    const phone = cleanPhone(input.customerPhone)
    const udf1 = (input.referenceId || '').slice(0, 100) // outstanding ID — webhook me wapas milega
    const callbackUrl = input.callbackUrl || ''

    // validation_period — PayU invoice kitne din valid rahega
    let validationPeriod = 7
    if (input.expiryDate) {
      const days = Math.ceil((input.expiryDate * 1000 - Date.now()) / 86400000)
      if (days > 0) validationPeriod = Math.min(days, 365)
    }

    const var1 = JSON.stringify({
      amount,
      txnid,
      productinfo,
      firstname,
      email,
      phone,
      udf1,
      udf2: input.notes?.billRef ?? '',
      surl: callbackUrl,
      furl: callbackUrl,
      validation_period: validationPeriod,
      send_email_now: '0', // Hum khud WhatsApp bhejte hain
    })

    const hash = sha512Hex(`${key}|create_invoice|${var1}|${salt}`)

    // Pehle Invoicing API try karo
    try {
      const data = await payuPostservice(testMode, {
        key,
        command: 'create_invoice',
        var1,
        hash,
      })

      if (isInvoiceSuccess(data)) {
        const linkId = extractInvoiceId(data) || txnid
        const shortUrl = extractLink(data)
        if (shortUrl) {
          logger.info('PayU invoice created', { txnid, linkId })
          return {
            linkId,
            shortUrl,
            status: 'created',
            expiresAt: input.expiryDate,
          }
        }
        logger.warn('PayU invoice bani lekin link nahi mila — hosted checkout fallback', { txnid })
      } else {
        logger.warn('PayU create_invoice fail — hosted checkout fallback', {
          txnid,
          msg: String(data.msg ?? data.message ?? 'unknown'),
        })
      }
    } catch (err) {
      logger.warn('PayU create_invoice error — hosted checkout fallback', {
        txnid,
        error: String(err),
      })
    }

    // Fallback: hosted /_payment URL (har PayU merchant pe kaam karta hai)
    const shortUrl = buildHostedCheckoutUrl(testMode, {
      key,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl: callbackUrl,
      furl: callbackUrl,
      udf1,
      salt,
    })

    logger.info('PayU hosted checkout link created', { txnid })
    return {
      linkId: txnid,
      shortUrl,
      status: 'created',
      expiresAt: input.expiryDate,
    }
  }

  // ---------------------------------------------------------------
  // Webhook signature verify — PayU surl/furl POST ka reverse hash
  // rawBody: URL-encoded form body (raw bytes — parse se pehle!)
  // signature: body me aaya 'hash' field (caller extract karke de sakta hai)
  // ---------------------------------------------------------------
  verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    credentials: Record<string, string>,
  ): boolean {
    try {
      const { merchantKey: key, salt } = getCreds(credentials)

      const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
      const params = new URLSearchParams(body)
      const postedHash = signature || params.get('hash') || ''
      if (!postedHash) return false

      const f = (k: string): string => params.get(k) ?? ''
      const core = [
        f('udf5'),
        f('udf4'),
        f('udf3'),
        f('udf2'),
        f('udf1'),
        f('email'),
        f('firstname'),
        f('productinfo'),
        f('amount'),
        f('txnid'),
        key,
      ]

      const candidates: string[] = []
      const additionalCharges = f('additionalCharges')
      const prefix = additionalCharges ? [additionalCharges] : []

      // Variant 1: salt|status|udf5|...|key (current docs)
      candidates.push([...prefix, salt, f('status'), ...core].join('|'))
      // Variant 2: salt|status|||||||udf5|...|key (purana format — kuch merchants pe)
      candidates.push([...prefix, salt, f('status'), '', '', '', '', '', '', ...core].join('|'))

      return candidates.some((seq) => timingSafeEqualHex(sha512Hex(seq), postedHash))
    } catch (err) {
      logger.error('PayU webhook signature verification failed', { error: String(err) })
      return false
    }
  }

  // ---------------------------------------------------------------
  // Webhook payload → standard event
  // PayU surl/furl POST fields: status, txnid, mihpayid, amount, hash, udf1...
  // ---------------------------------------------------------------
  parseWebhookEvent(payload: unknown): WebhookEvent {
    const p = (payload ?? {}) as Record<string, string>
    const status = (p['status'] ?? '').toLowerCase()

    const type: WebhookEvent['type'] =
      status === 'success'
        ? 'payment.captured'
        : status === 'failure' || status === 'failed'
          ? 'payment.failed'
          : 'unknown'

    const amountPaise = Math.round(parseFloat(p['amount'] || '0') * 100)

    return {
      type,
      gatewayPaymentId: p['mihpayid'] || p['txnid'] || '',
      gatewayLinkId: p['invoice_id'] || undefined,
      amount: Number.isFinite(amountPaise) ? amountPaise : 0,
      currency: 'INR',
      referenceId: p['udf1'] || undefined, // createPaymentLink me outstanding ID yahin rakha tha
      rawPayload: payload,
    }
  }

  // ---------------------------------------------------------------
  // Settings UI ke liye credential fields
  // ---------------------------------------------------------------
  getCredentialFields() {
    return [
      {
        key: 'merchantKey',
        label: 'Merchant Key',
        placeholder: 'e.g. abcd1234EFGH',
        secret: false,
        helpText: 'PayU dashboard → My Account → Merchant Key',
      },
      {
        key: 'salt',
        label: 'Salt',
        placeholder: 'PayU Salt (secret)',
        secret: true,
        helpText: 'PayU dashboard → My Account → Salt. Ye kabhi kisi se share mat karo!',
      },
    ]
  }
}
