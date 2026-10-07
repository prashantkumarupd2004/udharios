/**
 * Ugaahi Payment Gateway Abstraction
 *
 * Har payment gateway (Razorpay, Cashfree, PayU, PhonePe) is interface ko
 * implement karega. Merchant apna gateway settings me select karega,
 * aur saara code gateway-agnostic rahega.
 */

export type GatewayId = 'razorpay' | 'cashfree' | 'payu' | 'phonepe' | 'upi_vpa'

export interface GatewayConfig {
  gateway: GatewayId
  /** Encrypted credentials — gateway ke hisaab se fields alag honge */
  credentials: Record<string, string>
  /** Test mode ya live mode */
  testMode: boolean
}

// ---------------------------------------------------------------------------
// Payment Link
// ---------------------------------------------------------------------------

export interface CreatePaymentLinkInput {
  /** Amount in PAISE (rupees * 100) */
  amount: number
  currency?: string          // default 'INR'
  description: string
  customerName: string
  customerPhone: string
  customerEmail?: string
  /** Link expiry — Unix timestamp */
  expiryDate?: number
  /** Outstanding/bill ID for reconciliation */
  referenceId?: string
  notes?: Record<string, string>
  /** Kahan redirect ho payment ke baad */
  callbackUrl?: string
}

export interface PaymentLinkResult {
  /** Gateway ka link ID */
  linkId: string
  /** Customer ko bhejne wala URL */
  shortUrl: string
  /** Full URL (agar alag ho) */
  longUrl?: string
  status: 'created' | 'active'
  expiresAt?: number
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export interface WebhookEvent {
  type: 'payment.captured' | 'payment.failed' | 'link.paid' | 'link.expired' | 'unknown'
  /** Gateway ka payment/link ID */
  gatewayPaymentId: string
  gatewayLinkId?: string
  amount: number              // paise me
  currency: string
  /** Hamara reference (outstanding ID) */
  referenceId?: string
  rawPayload: unknown
}

// ---------------------------------------------------------------------------
// Gateway Interface — har adapter isko implement karega
// ---------------------------------------------------------------------------

export interface PaymentGateway {
  readonly id: GatewayId
  readonly displayName: string

  /**
   * Payment link banao.
   * @param input  Link details
   * @param credentials  Merchant ke gateway credentials (decrypted)
   */
  createPaymentLink(
    input: CreatePaymentLinkInput,
    credentials: Record<string, string>,
    testMode: boolean,
  ): Promise<PaymentLinkResult>

  /**
   * Webhook signature verify karo.
   * @returns true agar signature sahi hai
   */
  verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    credentials: Record<string, string>,
  ): boolean

  /**
   * Webhook payload ko standard event me convert karo.
   */
  parseWebhookEvent(payload: unknown): WebhookEvent

  /**
   * Credential fields jo settings UI me dikhenge.
   * { key, label, placeholder, secret: boolean }
   */
  getCredentialFields(): Array<{
    key: string
    label: string
    placeholder: string
    secret: boolean
    helpText?: string
  }>
}

// ---------------------------------------------------------------------------
// Gateway Metadata (UI ke liye)
// ---------------------------------------------------------------------------

export const GATEWAY_META: Record<GatewayId, { name: string; description: string }> = {
  razorpay: {
    name: 'Razorpay',
    description: 'Payment links, UPI, cards, netbanking',
  },
  cashfree: {
    name: 'Cashfree',
    description: 'Payment links with low TDR',
  },
  payu: {
    name: 'PayU',
    description: 'Enterprise-grade payment gateway',
  },
  phonepe: {
    name: 'PhonePe PG',
    description: 'PhonePe Payment Gateway',
  },
  upi_vpa: {
    name: 'Direct UPI',
    description: 'Apna UPI ID — bina gateway ke (0% fee)',
  },
}
