/**
 * OCR Provider abstraction for Udhari OS
 * Abstract interface + Stub implementation (wire real OCR via env OCR_PROVIDER)
 */

export interface OcrExtractResult {
  invoiceNo?: string
  amount?: number
  date?: string       // ISO date string
  items?: Array<{ name: string; qty?: number; rate?: number; amount?: number }>
  rawText?: string
  confidence?: number // 0-1
}

export interface IOcrProvider {
  extractFromImage(imageUrl: string): Promise<OcrExtractResult>
  extractFromBuffer(buffer: Buffer, mimeType: string): Promise<OcrExtractResult>
}

// ---------------------------------------------------------------------------
// Stub Provider (default — returns empty extraction)
// ---------------------------------------------------------------------------

class OcrStubProvider implements IOcrProvider {
  async extractFromImage(_imageUrl: string): Promise<OcrExtractResult> {
    // Stub: in production, wire to Google Vision or Azure Form Recognizer
    return {
      rawText: '[OCR stub — configure OCR_PROVIDER env to enable]',
      confidence: 0,
    }
  }

  async extractFromBuffer(_buffer: Buffer, _mimeType: string): Promise<OcrExtractResult> {
    return {
      rawText: '[OCR stub — configure OCR_PROVIDER env to enable]',
      confidence: 0,
    }
  }
}

// ---------------------------------------------------------------------------
// Google Vision Provider
// ---------------------------------------------------------------------------

class GoogleVisionProvider implements IOcrProvider {
  private apiKey: string

  constructor() {
    this.apiKey = process.env.GOOGLE_VISION_API_KEY!
  }

  async extractFromImage(imageUrl: string): Promise<OcrExtractResult> {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { source: { imageUri: imageUrl } },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            },
          ],
        }),
      }
    )

    if (!response.ok) return {}

    const data = await response.json()
    const rawText = data.responses?.[0]?.fullTextAnnotation?.text ?? ''
    return this.parseInvoiceText(rawText)
  }

  async extractFromBuffer(buffer: Buffer, _mimeType: string): Promise<OcrExtractResult> {
    const base64 = buffer.toString('base64')
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            },
          ],
        }),
      }
    )

    if (!response.ok) return {}

    const data = await response.json()
    const rawText = data.responses?.[0]?.fullTextAnnotation?.text ?? ''
    return this.parseInvoiceText(rawText)
  }

  private parseInvoiceText(text: string): OcrExtractResult {
    const result: OcrExtractResult = { rawText: text, confidence: 0.7 }

    // Extract amount (₹ followed by number)
    const amountMatch = text.match(/(?:total|amount|rakam|rashi)[:\s]*[₹rs\.]*\s*([\d,]+(?:\.\d{2})?)/i)
    if (amountMatch) {
      result.amount = parseFloat(amountMatch[1].replace(/,/g, ''))
    }

    // Extract invoice number
    const invoiceMatch = text.match(/(?:invoice|bill|challan|inv)[#\s.:]*([A-Z0-9/-]+)/i)
    if (invoiceMatch) {
      result.invoiceNo = invoiceMatch[1].trim()
    }

    // Extract date
    const dateMatch = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
    if (dateMatch) {
      const [, d, m, y] = dateMatch
      const year = y.length === 2 ? `20${y}` : y
      result.date = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }

    return result
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _ocrProvider: IOcrProvider | null = null

export function getOcrProvider(): IOcrProvider {
  if (_ocrProvider) return _ocrProvider

  const providerName = process.env.OCR_PROVIDER ?? 'stub'

  switch (providerName.toLowerCase()) {
    case 'google':
      _ocrProvider = new GoogleVisionProvider()
      break
    case 'stub':
    default:
      _ocrProvider = new OcrStubProvider()
  }

  return _ocrProvider
}
