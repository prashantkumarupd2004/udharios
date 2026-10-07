/**
 * WhatsApp Provider abstraction for Udhari OS
 * Swap providers by setting WHATSAPP_PROVIDER env var
 * Supported: aisensy | gupshup | interakt | official (Meta Cloud API)
 */

export interface WhatsAppMessage {
  to: string                    // Phone number with country code, no +
  templateName: string
  language?: string             // default: hi
  components?: TemplateComponent[]
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button'
  sub_type?: 'url' | 'quick_reply'
  index?: number
  parameters: TemplateParameter[]
}

export interface TemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document'
  text?: string
  currency?: { fallback_value: string; code: string; amount_1000: number }
  image?: { link: string }
}

export interface WhatsAppSendResult {
  messageId: string
  status: 'sent' | 'queued' | 'failed'
  error?: string
}

export interface IWhatsAppProvider {
  sendTemplate(msg: WhatsAppMessage): Promise<WhatsAppSendResult>
  sendText(to: string, text: string): Promise<WhatsAppSendResult>
}

// ---------------------------------------------------------------------------
// AiSensy Provider (default)
// ---------------------------------------------------------------------------

class AiSensyProvider implements IWhatsAppProvider {
  private apiKey: string
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.WHATSAPP_API_KEY!
    this.baseUrl = process.env.WHATSAPP_API_BASE_URL ?? 'https://backend.aisensy.com/campaign/t1/api/v2'
  }

  async sendTemplate(msg: WhatsAppMessage): Promise<WhatsAppSendResult> {
    // AiSensy uses a campaign-based API
    const body = {
      apiKey: this.apiKey,
      campaignName: msg.templateName,
      destination: msg.to,
      userName: 'Udhari OS',
      templateParams: msg.components
        ?.find(c => c.type === 'body')
        ?.parameters.map(p => p.text ?? '') ?? [],
      source: 'new-landing-page form',
      media: {},
      buttons: msg.components
        ?.filter(c => c.type === 'button')
        .map(c => ({
          type: c.sub_type,
          index: c.index ?? 0,
        })) ?? [],
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      return { messageId: '', status: 'failed', error: err }
    }

    const data = await response.json()
    return {
      messageId: data.messageId ?? `aisensy-${Date.now()}`,
      status: 'sent',
    }
  }

  async sendText(to: string, text: string): Promise<WhatsAppSendResult> {
    // AiSensy text-only send
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: this.apiKey,
        campaignName: 'text_message',
        destination: to,
        userName: 'Udhari OS',
        templateParams: [text],
        source: 'system',
        media: {},
        buttons: [],
      }),
    })

    if (!response.ok) {
      return { messageId: '', status: 'failed', error: await response.text() }
    }

    const data = await response.json()
    return { messageId: data.messageId ?? '', status: 'sent' }
  }
}

// ---------------------------------------------------------------------------
// Meta Cloud API (Official) Provider
// ---------------------------------------------------------------------------

class MetaCloudProvider implements IWhatsAppProvider {
  private phoneNumberId: string
  private apiKey: string
  private baseUrl = 'https://graph.facebook.com/v19.0'

  constructor() {
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!
    this.apiKey = process.env.WHATSAPP_API_KEY!
  }

  async sendTemplate(msg: WhatsAppMessage): Promise<WhatsAppSendResult> {
    const response = await fetch(
      `${this.baseUrl}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: msg.to,
          type: 'template',
          template: {
            name: msg.templateName,
            language: { code: msg.language ?? 'hi' },
            components: msg.components ?? [],
          },
        }),
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      return { messageId: '', status: 'failed', error: JSON.stringify(err) }
    }

    const data = await response.json()
    return {
      messageId: data.messages?.[0]?.id ?? '',
      status: 'sent',
    }
  }

  async sendText(to: string, text: string): Promise<WhatsAppSendResult> {
    const response = await fetch(
      `${this.baseUrl}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      }
    )

    if (!response.ok) {
      return { messageId: '', status: 'failed', error: await response.text() }
    }

    const data = await response.json()
    return { messageId: data.messages?.[0]?.id ?? '', status: 'sent' }
  }
}

// ---------------------------------------------------------------------------
// Gupshup Provider
// ---------------------------------------------------------------------------

class GupshupProvider implements IWhatsAppProvider {
  private apiKey: string
  private appName: string

  constructor() {
    this.apiKey = process.env.WHATSAPP_API_KEY!
    this.appName = process.env.WHATSAPP_GUPSHUP_APP_NAME ?? 'UdhariOS'
  }

  async sendTemplate(msg: WhatsAppMessage): Promise<WhatsAppSendResult> {
    const params = msg.components
      ?.find(c => c.type === 'body')
      ?.parameters.map(p => p.text ?? '') ?? []

    const response = await fetch('https://api.gupshup.io/sm/api/v1/template/msg', {
      method: 'POST',
      headers: {
        apikey: this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        channel: 'whatsapp',
        source: process.env.EXOTEL_VIRTUAL_NUMBER ?? '',
        destination: msg.to,
        'src.name': this.appName,
        template: JSON.stringify({
          id: msg.templateName,
          params,
        }),
      }),
    })

    if (!response.ok) {
      return { messageId: '', status: 'failed', error: await response.text() }
    }

    const data = await response.json()
    return { messageId: data.messageId ?? '', status: 'sent' }
  }

  async sendText(to: string, text: string): Promise<WhatsAppSendResult> {
    const response = await fetch('https://api.gupshup.io/sm/api/v1/msg', {
      method: 'POST',
      headers: {
        apikey: this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        channel: 'whatsapp',
        source: process.env.EXOTEL_VIRTUAL_NUMBER ?? '',
        destination: to,
        'src.name': this.appName,
        message: JSON.stringify({ type: 'text', text }),
      }),
    })

    if (!response.ok) {
      return { messageId: '', status: 'failed', error: await response.text() }
    }

    const data = await response.json()
    return { messageId: data.messageId ?? '', status: 'sent' }
  }
}

// ---------------------------------------------------------------------------
// Factory — picks provider from env
// ---------------------------------------------------------------------------

let _provider: IWhatsAppProvider | null = null

export function getWhatsAppProvider(): IWhatsAppProvider {
  if (_provider) return _provider

  const providerName = process.env.WHATSAPP_PROVIDER ?? 'aisensy'

  switch (providerName.toLowerCase()) {
    case 'official':
    case 'meta':
      _provider = new MetaCloudProvider()
      break
    case 'gupshup':
      _provider = new GupshupProvider()
      break
    case 'aisensy':
    default:
      _provider = new AiSensyProvider()
  }

  return _provider
}

// ---------------------------------------------------------------------------
// Template builder helpers for the 4 standard templates
// ---------------------------------------------------------------------------

export function buildT1Polite(
  customerName: string,
  merchantName: string,
  amountINR: string,
  dueDate: string
): WhatsAppMessage['components'] {
  return [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: customerName },
        { type: 'text', text: merchantName },
        { type: 'text', text: amountINR },
        { type: 'text', text: dueDate },
      ],
    },
  ]
}

export function buildT2WithLink(
  customerName: string,
  amountINR: string,
  invoiceNo: string,
  paymentUrl: string
): WhatsAppMessage['components'] {
  return [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: customerName },
        { type: 'text', text: amountINR },
        { type: 'text', text: invoiceNo },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: 0,
      parameters: [{ type: 'text', text: paymentUrl }],
    },
  ]
}

export function buildT3Firm(  customerName: string,
  amountINR: string,
  overdueDays: number,
  merchantName: string
): WhatsAppMessage['components'] {
  return [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: customerName },
        { type: 'text', text: amountINR },
        { type: 'text', text: String(overdueDays) },
        { type: 'text', text: merchantName },
      ],
    },
  ]
}

export function buildT4Final(
  customerName: string,
  amountINR: string,
  overdueDays: number,
  merchantName: string
): WhatsAppMessage['components'] {
  return [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: customerName },
        { type: 'text', text: amountINR },
        { type: 'text', text: String(overdueDays) },
        { type: 'text', text: merchantName },
      ],
    },
  ]
}

/**
 * T2 variant — bina gateway wale merchants ke liye.
 * Payment link ki jagah UPI ID ya bank account details bhejta hai.
 *
 * Template me ye parameters honge:
 *   1. customerName, 2. amountINR, 3. invoiceNo,
 *   4. upiId ya "Bank: X, A/c: Y, IFSC: Z"
 */
export function buildT2WithUpiOrBank(
  customerName: string,
  amountINR: string,
  invoiceNo: string,
  paymentInfo: string,
): WhatsAppMessage['components'] {
  return [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: customerName },
        { type: 'text', text: amountINR },
        { type: 'text', text: invoiceNo },
        { type: 'text', text: paymentInfo },
      ],
    },
  ]
}

/**
 * Merchant ke payment details se WhatsApp me bhejne layak string banao.
 * Priority: UPI ID > Bank Account
 * Returns null agar kuch nahi hai.
 */
export function buildMerchantPaymentInfo(merchant: {
  upiVpa?: string | null
  accountHolderName?: string | null
  accountNumber?: string | null
  bankName?: string | null
  ifscCode?: string | null
}): string | null {
  if (merchant.upiVpa) {
    return `UPI: ${merchant.upiVpa}`
  }
  if (merchant.accountNumber) {
    const parts = [`A/c: ${merchant.accountNumber}`]
    if (merchant.bankName) parts.push(`Bank: ${merchant.bankName}`)
    if (merchant.ifscCode) parts.push(`IFSC: ${merchant.ifscCode}`)
    if (merchant.accountHolderName) parts.push(`Name: ${merchant.accountHolderName}`)
    return parts.join(', ')
  }
  return null
}

// ---------------------------------------------------------------------------
// Opt-out detection
// ---------------------------------------------------------------------------

export function isOptOutMessage(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  const optOutKeywords = [
    'stop', 'band karo', 'band kar', 'mat bhejo', 'mat bhejiye',
    'unsubscribe', 'opt out', 'optout', 'cancel', 'no more',
    'rokna', 'rok do', 'nahi chahiye',
  ]
  return optOutKeywords.some(kw => normalized.includes(kw))
}

// ---------------------------------------------------------------------------
// Dispute keyword detection
// ---------------------------------------------------------------------------

export function isDisputeMessage(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  const disputeKeywords = [
    'problem hai', 'dikkat', 'defective', 'kharab', 'maal kharab',
    'galat', 'zyada bill', 'zyada charge', 'nahi mila', 'deliver nahi',
    'returned', 'wapas', 'complaint', 'issue',
  ]
  return disputeKeywords.some(kw => normalized.includes(kw))
}
