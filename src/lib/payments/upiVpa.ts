/**
 * Direct UPI Adapter — bina gateway ke!
 *
 * Merchant apna UPI ID dalta hai, hum UPI deep link banate hain:
 *   upi://pay?pa=merchant@upi&pn=Name&am=100&cu=INR&tn=Bill+1
 *
 * 0% fee! Chhote merchants ke liye best.
 */

import type {
  PaymentGateway,
  CreatePaymentLinkInput,
  PaymentLinkResult,
  WebhookEvent,
  GatewayId,
} from './types'

export class UpiVpaGateway implements PaymentGateway {
  readonly id: GatewayId = 'upi_vpa'
  readonly displayName = 'Direct UPI'

  async createPaymentLink(
    input: CreatePaymentLinkInput,
    credentials: Record<string, string>,
  ): Promise<PaymentLinkResult> {
    const vpa = credentials.vpa?.trim()
    if (!vpa || !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(vpa)) {
      throw new Error('Sahi UPI ID dalo settings me (jaise: dukan@okhdfcbank)')
    }

    const amountRupees = (input.amount / 100).toFixed(2)
    const params = new URLSearchParams({
      pa: vpa,
      pn: input.customerName.slice(0, 50),
      am: amountRupees,
      cu: input.currency ?? 'INR',
      tn: (input.description || `Ugaahi payment ${input.referenceId ?? ''}`).slice(0, 80),
    })
    const upiUrl = `upi://pay?${params.toString()}`
    const linkId = `upi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    return {
      linkId,
      shortUrl: upiUrl,
      status: 'created',
      expiresAt: input.expiryDate,
    }
  }

  verifyWebhookSignature(): boolean {
    // Direct UPI me webhook nahi hota — merchant manually "Paid" mark karega
    return false
  }

  parseWebhookEvent(payload: unknown): WebhookEvent {
    return {
      type: 'unknown',
      gatewayPaymentId: '',
      amount: 0,
      currency: 'INR',
      rawPayload: payload,
    }
  }

  getCredentialFields() {
    return [
      {
        key: 'vpa',
        label: 'UPI ID (VPA)',
        placeholder: 'dukannaaam@okhdfcbank',
        secret: false,
        helpText: 'Google Pay / PhonePe / Paytm me apni UPI ID dekho',
      },
    ]
  }
}
