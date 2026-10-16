/**
 * src/lib/universal-import.ts — Universal Bill Import engine
 *
 * Bahut se merchants Tally use nahi karte — Vyapar app, myBillBook, ya
 * Excel me billing karte hain. Ye module unki PDF / Excel / CSV files ko
 * "samajhta" hai: document kis type ka hai (invoice vs credit note vs
 * ledger vs receipt), aur usme se bill-wise data nikalta hai.
 *
 * Flow: upload → preview (no DB writes) → merchant review → import
 * Import ke time tally.ts ke reusable sync functions use hote hain —
 * bill→outstanding mirroring ka logic duplicate nahi kiya gaya.
 */

export type DocumentKind =
  | 'invoice'
  | 'credit_note'
  | 'debit_note'
  | 'ledger'
  | 'receipt'
  | 'unknown'

export interface ParsedBill {
  kind: DocumentKind
  billRef: string
  partyName: string
  partyPhone?: string
  amount: number
  pendingAmount: number
  billDate: string // YYYY-MM-DD
  dueDate?: string // YYYY-MM-DD
  rawText?: string
}

export interface ClassifyResult {
  kind: DocumentKind
  confidence: number // 0..1
}

// ---------------------------------------------------------------------------
// Document classification — keyword scoring, English + Hindi/Hinglish
// ---------------------------------------------------------------------------

const CLASSIFY_RULES: { kind: DocumentKind; terms: string[] }[] = [
  {
    kind: 'credit_note',
    terms: ['credit note', 'credit memo', 'sales return', 'क्रेडिट नोट', 'जमा पर्ची'],
  },
  {
    kind: 'debit_note',
    terms: ['debit note', 'purchase return', 'डेबिट नोट'],
  },
  {
    kind: 'receipt',
    terms: [
      'payment received',
      'payment receipt',
      'money receipt',
      'received with thanks',
      'रसीद',
      'भुगतान प्राप्त',
    ],
  },
  {
    kind: 'ledger',
    terms: [
      'ledger account',
      'account statement',
      'statement of account',
      'ledger',
      'खाता',
      'बही',
      'खाता बही',
    ],
  },
  {
    kind: 'invoice',
    terms: [
      'tax invoice',
      'sales invoice',
      'invoice',
      'challan',
      'bill of supply',
      'बिल',
      'बीजक',
      'चालान',
    ],
  },
]

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let idx = 0
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++
    idx += needle.length
  }
  return count
}

export function classifyDocument(text: string): ClassifyResult {
  const lower = text.toLowerCase()
  let best: DocumentKind = 'unknown'
  let bestScore = 0
  let totalScore = 0

  for (const rule of CLASSIFY_RULES) {
    let score = 0
    for (const term of rule.terms) {
      score += countOccurrences(lower, term.toLowerCase())
    }
    totalScore += score
    if (score > bestScore) {
      bestScore = score
      best = rule.kind
    }
  }

  if (totalScore === 0) return { kind: 'unknown', confidence: 0 }
  return { kind: best, confidence: Math.min(1, bestScore / totalScore) }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** "1,25,000.00" / "₹ 5,400" → 125000 */
function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[₹\s]/g, '').replace(/,/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function toIso(y: string, m: string, d: string): string | null {
  const year = y.length === 2 ? (Number(y) > 50 ? `19${y}` : `20${y}`) : y
  const dd = d.padStart(2, '0')
  const mm = m.padStart(2, '0')
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null
  return `${year}-${mm}-${dd}`
}

/** Pehli sensible date dhoondo — pehle "Date" label ke aas-paas, phir kahin bhi.
 *  NOTE: YYYY-MM-DD pattern SABSE PEHLE try hota hai, warna DD-MM-YYYY
 *  uske andar ka "24-10-01" match karke galat year bana deta hai. */
function extractDate(text: string): string | null {
  // Pehle "Date" / "Dated" / "दिनांक" ke aas-paas dekho
  const dateLabelIdx = text.search(/(?:invoice\s*)?date|dated|दिनांक/i)
  const searchZones = dateLabelIdx >= 0
    ? [text.slice(dateLabelIdx, dateLabelIdx + 120), text]
    : [text]

  for (const zone of searchZones) {
    // 1. YYYY-MM-DD (2024-10-12)
    let m = zone.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
    if (m) {
      const iso = toIso(m[1], m[2], m[3])
      if (iso) return iso
    }
    // 2. DD-MM-YYYY / DD/MM/YYYY (12-10-2024) — Indian format
    m = zone.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
    if (m) {
      const iso = toIso(m[3], m[2], m[1])
      if (iso) return iso
    }
    // 3. DD-Mon-YYYY (12-Oct-2024)
    m = zone.match(/(\d{1,2})[\s\-](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-](\d{2,4})/i)
    if (m) {
      const iso = toIso(m[3], MONTHS[m[2].toLowerCase().slice(0, 3)], m[1])
      if (iso) return iso
    }
  }
  return null
}

/** Bill/Invoice number — specific patterns pehle ("Invoice No:", "Bill #"),
 *  generic fallback me digit zaroori (warna "TAX INVOICE" ke baad ka
 *  pehla shabd uth jaata hai) */
function extractBillRef(text: string): string {
  const patterns = [
    /(?:invoice|bill)\s*no\.?\s*[#.:-]*\s*([A-Za-z0-9][A-Za-z0-9\/\-]{0,30})/i,
    /(?:invoice|bill)\s*#\s*([A-Za-z0-9][A-Za-z0-9\/\-]{0,30})/i,
    /(?:inv(?:oice)?\.?|bill\.?)[\s#.:-]{1,3}([A-Za-z0-9][A-Za-z0-9\/\-]{0,30})/i,
  ]
  for (let i = 0; i < patterns.length; i++) {
    const m = text.match(patterns[i])
    if (!m) continue
    const v = m[1].replace(/[#:\s.\-]+$/, '')
    if (v.length < 2) continue
    // Generic fallback (3rd pattern) me kam se kam ek digit hona chahiye
    if (i === 2 && !/\d/.test(v)) continue
    return v
  }
  return ''
}

function extractPhone(text: string): string | undefined {
  const m = text.match(/(?:\+91[\s\-]?)?([6-9]\d{9})/)
  return m ? m[1] : undefined
}

// ---------------------------------------------------------------------------
// PDF text → ParsedBill
// ---------------------------------------------------------------------------

export function parsePdfText(text: string): { bill: ParsedBill; warnings: string[] } {
  const warnings: string[] = []
  const { kind, confidence } = classifyDocument(text)

  // --- bill / invoice number ---
  let billRef = extractBillRef(text)
  if (!billRef) {
    warnings.push('Bill number nahi mila — preview me khud daalein')
    billRef = `PDF-${Date.now().toString(36).toUpperCase()}`
  }

  // --- party name ---
  const partyMatch = text.match(
    /(?:billed?\s*to|bill\s*to|customer(?:\s*name)?|party(?:\s*name)?|buyer|m\/s\.?)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 .&'_\-]{1,60})/i
  )
  const partyName = partyMatch ? partyMatch[1].trim().replace(/\s+/g, ' ') : ''
  if (!partyName) warnings.push('Party ka naam nahi mila — preview me khud daalein')

  const partyPhone = extractPhone(text)

  // --- amounts: labeled priority, phir largest sensible ---
  const amountLabels = [
    /(?:balance\s*due|amount\s*payable|net\s*payable)\s*[:₹\s]*([\d,]+\.?\d*)/i,
    /(?:grand\s*total|net\s*amount|total\s*amount|invoice\s*total)\s*[:₹\s]*([\d,]+\.?\d*)/i,
    /(?:^|\n)\s*total\s*[:₹\s]*([\d,]+\.?\d*)/im,
  ]
  let amount = 0
  let pendingAmount: number | null = null

  const balanceMatch = text.match(/(?:balance\s*due|amount\s*payable|net\s*payable)\s*[:₹\s]*([\d,]+\.?\d*)/i)
  if (balanceMatch) pendingAmount = parseMoney(balanceMatch[1])

  for (const re of amountLabels) {
    const m = text.match(re)
    if (m) {
      const v = parseMoney(m[1])
      if (v > 0) {
        amount = v
        break
      }
    }
  }
  if (amount <= 0) {
    // Fallback: 2-decimal wala sabse bada number
    const nums = text.match(/[\d,]+\.\d{2}/g) ?? []
    for (const n of nums) {
      const v = parseMoney(n)
      if (v > amount && v < 100000000) amount = v
    }
    if (amount <= 0) warnings.push('Amount nahi mila — preview me khud daalein')
  }
  if (pendingAmount === null) pendingAmount = amount

  // --- date ---
  const billDate = extractDate(text) ?? new Date().toISOString().slice(0, 10)
  if (!extractDate(text)) warnings.push('Bill date nahi mili — aaj ki date li gayi hai')

  if (confidence < 0.5 && kind !== 'unknown') {
    warnings.push(`Document type pakka nahi (${kind}) — sahi hai ya nahi check karein`)
  }

  return {
    bill: {
      kind,
      billRef,
      partyName,
      partyPhone,
      amount: Math.round(amount * 100) / 100,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      billDate,
      rawText: text.slice(0, 2000),
    },
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Excel rows → ParsedBill[]
// ---------------------------------------------------------------------------

const HEADER_KEYWORDS: Record<string, string[]> = {
  name: ['customer', 'party', 'name', 'client', 'buyer', 'account'],
  phone: ['phone', 'mobile', 'contact', 'tel', 'ph'],
  billRef: ['invoice', 'bill', 'inv', 'voucher', 'ref', 'bill no'],
  amount: ['total', 'net', 'grand', 'amount', 'invoice value'],
  pending: ['balance', 'due', 'pending', 'outstanding', 'payable', 'receivable'],
  date: ['date', 'bill date', 'invoice date', 'due date', 'dated'],
}

function headerScore(cell: string): number {
  const c = String(cell).toLowerCase()
  if (!c.trim()) return 0
  let s = 0
  for (const keys of Object.values(HEADER_KEYWORDS)) {
    for (const k of keys) {
      if (c.includes(k)) {
        s++
        break
      }
    }
  }
  return s
}

function mapColumn(header: string): keyof typeof HEADER_KEYWORDS | null {
  const c = header.toLowerCase()
  let best: keyof typeof HEADER_KEYWORDS | null = null
  let bestLen = 0
  for (const [field, keys] of Object.entries(HEADER_KEYWORDS) as [keyof typeof HEADER_KEYWORDS, string[]][]) {
    for (const k of keys) {
      if (c.includes(k) && k.length > bestLen) {
        best = field
        bestLen = k.length
      }
    }
  }
  return best
}

function excelDateToIso(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel serial date (epoch 1899-12-30)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return d.toISOString().slice(0, 10)
  }
  if (typeof v === 'string' && v.trim()) {
    return extractDate(v) ?? null
  }
  return null
}

export function parseExcelRows(rows: unknown[][]): { bills: ParsedBill[]; warnings: string[] } {
  const warnings: string[] = []
  const bills: ParsedBill[] = []

  if (!rows || rows.length === 0) return { bills, warnings: ['Sheet khaali hai'] }

  // Header row: pehli row jisme ≥2 known keywords hon
  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = (rows[i] ?? []) as unknown[]
    const score = row.reduce<number>((s, c) => s + headerScore(String(c ?? '')), 0)
    if (score >= 2) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) {
    return { bills, warnings: ['Header row nahi mili — pehli row me Customer/Bill/Amount jaise headings hone chahiye'] }
  }

  const headers = (rows[headerIdx] as unknown[]).map((h) => String(h ?? ''))
  const colMap = new Map<number, keyof typeof HEADER_KEYWORDS>()
  headers.forEach((h, i) => {
    const f = mapColumn(h)
    if (f && ![...colMap.values()].includes(f)) colMap.set(i, f)
  })

  if (!colMap.has(-1 as never) && ![...colMap.values()].includes('name')) {
    warnings.push('Customer/Party wala column nahi mila — naam wali rows skip hongi')
  }

  // Document kind: header text se guess karo (ledger sheet vs bill list)
  const headerText = headers.join(' ')
  const docKind = classifyDocument(headerText).kind
  const rowKind: DocumentKind = docKind === 'unknown' ? 'invoice' : docKind

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[]
    if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue

    const get = (field: keyof typeof HEADER_KEYWORDS): string => {
      for (const [i, f] of colMap) {
        if (f === field) return String(row[i] ?? '').trim()
      }
      return ''
    }

    const partyName = get('name').replace(/\s+/g, ' ').trim()
    if (!partyName || partyName.length < 2) continue

    const amountRaw = get('amount')
    const pendingRaw = get('pending')
    const amount = parseMoney(amountRaw || pendingRaw)
    const pendingAmount = pendingRaw ? parseMoney(pendingRaw) : amount
    if (amount <= 0 && pendingAmount <= 0) continue

    const dateRaw = (() => {
      for (const [i, f] of colMap) {
        if (f === 'date') return row[i]
      }
      return ''
    })()
    const billDate = excelDateToIso(dateRaw) ?? new Date().toISOString().slice(0, 10)

    const billRefRaw = get('billRef').trim()
    const phoneRaw = get('phone')
    const phoneM = phoneRaw.match(/([6-9]\d{9})/)

    bills.push({
      kind: rowKind,
      billRef: billRefRaw || `XLS-${r}`,
      partyName,
      partyPhone: phoneM ? phoneM[1] : undefined,
      amount: Math.round(amount * 100) / 100,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      billDate,
    })
  }

  if (bills.length === 0) warnings.push('Header ke neeche koi valid bill row nahi mili')
  return { bills, warnings }
}

// ---------------------------------------------------------------------------
// Kind → UI labels/badges
// ---------------------------------------------------------------------------

export const KIND_LABELS: Record<DocumentKind, { hi: string; en: string }> = {
  invoice: { hi: 'Bill / Invoice', en: 'Bill / Invoice' },
  credit_note: { hi: 'Credit Note', en: 'Credit Note' },
  debit_note: { hi: 'Debit Note', en: 'Debit Note' },
  ledger: { hi: 'Khata / Ledger', en: 'Ledger' },
  receipt: { hi: 'Receipt / Rasid', en: 'Receipt' },
  unknown: { hi: 'Pata nahi — check karein', en: 'Unknown — review needed' },
}
