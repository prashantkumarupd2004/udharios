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

// ---------------------------------------------------------------------------
// Tally "Ledger Account" PDF → har transaction line se ek ParsedBill
//
// Tally ledger export ka format (pdf-parse ke baad):
//   "01 Apr 26Cr GST SALES 1SalesSF-0213,078.00-18,99,116.18 Dr"   (date wali line)
//   "Cr GST SALES 1SalesSF-05343,539.00-16,20,397.18 Dr"            (continuation — date nahi)
//   "02 Apr 26Dr The Kalupur Co Op Bank( CC / AC )Receipt10-3,63,639.0015,35,477.18 Dr"
//   "01 Apr 26Opening Balance18,86,038.18"                          (skip — opening balance)
//
// Strategy: line ko RIGHT se peel karo (balance → credit → debit → vch no →
// vch type → date/side/particulars), kyunki left side chipka hota hai.
// ---------------------------------------------------------------------------

function parseLedgerDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()]
  if (!mon || day < 1 || day > 31) return null
  let year = parseInt(m[3], 10)
  if (year < 100) year = year < 50 ? 2000 + year : 1900 + year
  return `${year}-${mon}-${String(day).padStart(2, '0')}`
}

interface LedgerTxn {
  date: string
  vchType: string
  vchNo: string
  debit: number
  credit: number
}

/** Ek ledger line parse karo. Continuation lines ke liye fallbackDate do. */
function parseLedgerLine(
  line: string,
  fallbackDate: string | null,
  prevSigned: number | null
): (LedgerTxn & { newSigned: number }) | null {
  let s = line.trim()
  if (!s) return null

  // 1. Balance peel: "<amount> Dr|Cr" line ke end me (hamesha hota hai).
  //    Credit aur balance chipke hote hain ("3,63,639.0015,35,477.18") — isliye
  //    Indian number grouping (15,35,477.18) se exact balance start nikalo,
  //    taaki greedy match credit ke digits na kha jaye.
  const balM = s.match(/(\d{1,2}(?:,\d{2})*,\d{3}\.\d{2}|\d{1,3}\.\d{2})\s*(Dr|Cr)\s*$/)
  if (!balM || balM.index === undefined) return null
  const newSigned = (balM[2] === 'Cr' ? -1 : 1) * parseMoney(balM[1])
  s = s.slice(0, balM.index).trim()

  // 2. Voucher-type peel (title-case Sales/Receipt; particulars me "GST SALES" caps me hota hai).
  //    Uske baad vch-no + debit + credit chipke hote hain (SF-02 + 13,078.00).
  const typeM = s.match(
    /(Sales|Receipt|Payment|Journal|Purchase|Contra|Credit\s*Note|Debit\s*Note)\s*([A-Za-z0-9\-\/]*(?:-|[\d,]+\.\d{2})(?:-|[\d,]+\.\d{2}))\s*$/
  )
  if (!typeM || typeM.index === undefined) return null
  const vchType = typeM[1].replace(/\s+/g, ' ')
  const segment = typeM[2]
  s = s.slice(0, typeM.index).trim()

  // 3. Vch-no/amount segment ko balance checksum se sahi jagah split karo
  const split = splitVchAmounts(segment, prevSigned, newSigned)
  if (!split) return null

  // 4. Head: "[date]Dr|Cr particulars" ya "Dr|Cr particulars" (continuation line)
  const headM = s.match(/^(?:(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}))?\s*(Dr|Cr)\s+(.+)$/)
  if (!headM) return null
  const dateStr = headM[1] ? parseLedgerDate(headM[1]) : fallbackDate
  if (!dateStr) return null

  return { date: dateStr, vchType, vchNo: split.vchNo, debit: split.debit, credit: split.credit, newSigned }
}

/**
 * Vch-no/amount segment (e.g. "SF-0213,078.00-") ko sahi jagah split karo.
 * Vch-no aur amount chipke hote hain — "SF-02"+"13,078.00" vs "SF-021"+"3,078.00"
 * dono dikhne me valid lagte hain. Ledger ka running balance checksum batata
 * hai kaun sa split sahi hai: prevBalance + debit - credit == newBalance.
 */
function splitVchAmounts(
  segment: string,
  prevSigned: number | null,
  newSigned: number
): { vchNo: string; debit: number; credit: number } | null {
  const prefixM = segment.match(/^([A-Za-z0-9\-\/]*)/)
  const prefix = prefixM ? prefixM[1] : ''
  const isCleanAmount = (a: string) =>
    a === '-' || /^[1-9][\d,]*\.\d{2}$/.test(a) || /^0\.\d{2}$/.test(a)

  let fallback: { vchNo: string; debit: number; credit: number } | null = null
  for (let len = prefix.length; len >= 0; len--) {
    const vchNo = prefix.slice(0, len)
    const rest = segment.slice(len)
    const m = rest.match(/^(-|[\d,]+\.\d{2})(-|[\d,]+\.\d{2})$/)
    if (!m) continue
    if (!isCleanAmount(m[1]) || !isCleanAmount(m[2])) continue
    const debit = m[1] === '-' ? 0 : parseMoney(m[1])
    const credit = m[2] === '-' ? 0 : parseMoney(m[2])
    const cand = { vchNo, debit, credit }
    if (!fallback) fallback = cand
    if (prevSigned !== null && Math.abs(prevSigned + debit - credit - newSigned) < 0.011) {
      return cand // checksum match — yehi sahi split hai
    }
  }
  return fallback // balance continuity nahi mili to pehla sane candidate
}

/** Tally ledger party name: "PARTY NAME\nLedger Account" pattern */
function extractLedgerParty(text: string): string {
  const m = text.match(/^([^\n]{2,80})\n\s*Ledger Account/mi)
  return m ? m[1].trim().replace(/\s+/g, ' ') : ''
}

export function parseLedgerPdfText(text: string): { bills: ParsedBill[]; warnings: string[] } {
  // Naya multi-line format check karo (TallyPrime: date, Dr/Cr, amount alag lines me)
  // e.g. "1-Apr-26 Cr\nOpening Balance\n44,939.00"
  const multiLine = parseLedgerPdfMultiLine(text)
  if (multiLine.bills.length > 0) {
    return multiLine
  }
  // Purana single-line format (fallback)
  return parseLedgerPdfSingleLine(text)
}

/**
 * TallyPrime multi-line ledger format:
 * Har transaction 3-5 lines me hoti hai:
 *   "3-Apr-26 Dr The Kalupur Co Op Bank( CC / AC )"  (date + Dr/Cr + particulars)
 *   "Receipt"                                        (voucher type)
 *   "13"                                             (voucher no)
 *   "44,939.00"                                      (amount)
 */
function parseLedgerPdfMultiLine(text: string): { bills: ParsedBill[]; warnings: string[] } {
  const warnings: string[] = []
  const bills: ParsedBill[] = []
  const partyName = extractLedgerParty(text) || 'Unknown'

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // Step 1: Transactions (date lines, in order)
  const dateRe = /^(\d{1,2}-[A-Za-z]{3}-\d{2,4})\s*(Dr|Cr)?\s*(.*)$/
  const txns: { date: string; drCr: string; particulars: string }[] = []
  for (const line of lines) {
    const m = line.match(dateRe)
    if (m) {
      if (/to\s+\d{1,2}-[A-Za-z]{3}/.test(line)) continue // header skip
      const dateStr = parseLedgerDate(m[1]) || parseDashedDate(m[1])
      if (dateStr) txns.push({ date: dateStr, drCr: m[2] || '', particulars: m[3].trim() })
    }
  }

  // Step 2: Voucher types aur numbers (in order)
  const vchTypeRe = /^(Receipt|Sales|Payment|Journal|Purchase|Contra|Credit\s*Note|Debit\s*Note)$/i
  const vchTypes: string[] = []
  const vchNos: string[] = []
  for (const line of lines) {
    const tm = line.match(vchTypeRe)
    if (tm) {
      vchTypes.push(tm[1])
    } else if (/^[A-Za-z0-9\-\/]+$/.test(line) && line.length < 20 && !/^[\d,]+\.\d{2}$/.test(line)) {
      if (!dateRe.test(line) && !/^(Page|Particulars|Date|Vch|Debit|Credit|Dr|Cr|Opening|Closing)/i.test(line)) {
        vchNos.push(line)
      }
    }
  }

  // Step 3: Amounts ("Debit" ke baad se, "Dr"/"Closing" tak)
  const amountRe = /^([\d,]+\.\d{2})$/
  const amounts: number[] = []
  let inAmountSection = false
  for (const line of lines) {
    if (/^Debit$/i.test(line)) { inAmountSection = true; continue }
    if (inAmountSection) {
      if (/^(Dr|Credit|Closing Balance)$/i.test(line)) break
      const am = line.match(amountRe)
      if (am) amounts.push(parseMoney(am[1]))
    }
  }

  // Step 4: Zip karo
  let txnIdx = 0, amtIdx = 0, typeIdx = 0, noIdx = 0

  // Opening balance (pehla txn)
  if (txns.length > 0 && amounts.length > 0) {
    const hasOpening = lines.some((l, idx) => /opening\s+balance/i.test(l) && idx < 25)
    if (hasOpening) {
      const amt = amounts[0]
      const isCr = txns[0].drCr.toLowerCase() === 'cr'
      bills.push({
        kind: isCr ? 'credit_note' : 'invoice',
        billRef: 'OPENING-BALANCE',
        partyName,
        amount: Math.round(amt * 100) / 100,
        pendingAmount: Math.round(amt * 100) / 100,
        billDate: txns[0].date,
      })
      txnIdx = 1; amtIdx = 1
      warnings.push(`Opening Balance \u20B9${amt.toLocaleString('en-IN')} add kiya gaya`)
    }
  }

  for (; txnIdx < txns.length; txnIdx++) {
    const txn = txns[txnIdx]
    const vchType = vchTypes[typeIdx++] || ''
    const vchNo = vchNos[noIdx++] || ''
    const amount = amounts[amtIdx++] || 0
    if (amount <= 0) continue
    let kind: DocumentKind
    const vt = vchType.toLowerCase()
    if (vt === 'sales') kind = 'invoice'
    else if (vt === 'receipt') kind = 'receipt'
    else if (vt.includes('credit')) kind = 'credit_note'
    else if (vt.includes('debit')) kind = 'debit_note'
    else kind = txn.drCr.toLowerCase() === 'dr' ? 'debit_note' : 'receipt'
    bills.push({
      kind,
      billRef: vchNo || `LEDGER-${txn.date.replace(/-/g, '')}-${txnIdx}`,
      partyName,
      amount: Math.round(amount * 100) / 100,
      pendingAmount: Math.round(amount * 100) / 100,
      billDate: txn.date,
    })
  }

  if (bills.length === 0) warnings.push('Ledger me koi transaction nahi mili')
  return { bills, warnings }
}

function parseDashedDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const mon = MONTHS[m[2].toLowerCase()]
  if (!mon || day < 1 || day > 31) return null
  let year = parseInt(m[3], 10)
  if (year < 100) year = year < 50 ? 2000 + year : 1900 + year
  return `${year}-${mon}-${String(day).padStart(2, '0')}`
}

function parseLedgerPdfSingleLine(text: string): { bills: ParsedBill[]; warnings: string[] } {
  const warnings: string[] = []
  const bills: ParsedBill[] = []
  const partyName = extractLedgerParty(text)
  if (!partyName) warnings.push('Ledger me party ka naam nahi mila — preview me check karein')
  // Ledger me party ka phone nahi hota (header me company ka hota hai) — galat phone attach na ho
  warnings.push('Phone number ledger PDF me nahi hota — zaroorat ho to customer me baad me add karein')

  let currentDate: string | null = null
  let skipped = 0
  let openingSkipped = false

  // Opening balance = pehli transaction ka prev balance.
  // Isko SKIP nahi karte — ek bill bana ke import karte hain, warna poora hisaab gadbad
  // ho jayega (receipts opening ke dues pe bhi lagte hain). Dr = customer se lena (invoice),
  // Cr = customer ko dena/advance (credit note). Date = opening wali line ki date.
  let prevSigned: number | null = null
  let openingBill: ParsedBill | null = null
  const obLineM = text.match(/^(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})[^\n]*?opening\s+balance\s*([\d,]+\.\d{2})\s*(Dr|Cr)?/im)
  if (obLineM) {
    const obAmount = parseMoney(obLineM[2])
    const obSide = obLineM[3] ? obLineM[3].toLowerCase() : 'dr'
    const obDate = parseLedgerDate(obLineM[1]) ?? new Date().toISOString().slice(0, 10)
    prevSigned = (obSide === 'cr' ? -1 : 1) * obAmount
    if (obAmount > 0) {
      openingBill = {
        kind: obSide === 'cr' ? 'credit_note' : 'invoice',
        billRef: 'OPENING-BALANCE',
        partyName,
        amount: Math.round(obAmount * 100) / 100,
        pendingAmount: Math.round(obAmount * 100) / 100,
        billDate: obDate,
      }
    }
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (/opening\s+balance/i.test(line)) {
      openingSkipped = true
      continue
    }
    const txn = parseLedgerLine(line, currentDate, prevSigned)
    if (!txn) {
      // date wali line thi lekin parse nahi hui — date tracker update mat karo
      const d = line.match(/^(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/)
      if (d) {
        const parsed = parseLedgerDate(d[1])
        if (parsed) currentDate = parsed
      }
      continue
    }
    currentDate = txn.date
    prevSigned = txn.newSigned

    const amount = Math.max(txn.debit, txn.credit)
    if (amount <= 0) {
      skipped++
      continue
    }
    // Customer ledger me: Sales=udhaari badi, Receipt=payment mila (kam hui),
    // Credit Note=kam hui, Debit Note=badi, Payment/Journal=direction se decide
    let kind: DocumentKind
    if (txn.vchType === 'Sales') kind = 'invoice'
    else if (txn.vchType === 'Receipt') kind = 'receipt'
    else if (/credit/i.test(txn.vchType)) kind = 'credit_note'
    else if (/debit/i.test(txn.vchType)) kind = 'debit_note'
    else kind = txn.debit > 0 ? 'debit_note' : 'receipt' // Payment/Journal/Purchase/Contra: direction se

    bills.push({
      kind,
      billRef: txn.vchNo || `LEDGER-${txn.date.replace(/-/g, '')}`,
      partyName,
      amount: Math.round(amount * 100) / 100,
      pendingAmount: Math.round(amount * 100) / 100,
      billDate: txn.date,
    })
  }

  if (openingBill) {
    bills.unshift(openingBill)
    warnings.push(
      `Opening Balance ₹${openingBill.amount.toLocaleString('en-IN')} (${openingBill.billDate}) opening dues ke roop me add kiya gaya`
    )
  }
  if (skipped > 0) warnings.push(`${skipped} zero-amount entries skip ki gayin`)
  if (bills.length === 0) {
    warnings.push('Ledger me koi transaction nahi mili — format alag ho sakta hai')
  }
  return { bills, warnings }
}

export function parsePdfText(text: string): { bills: ParsedBill[]; warnings: string[] } {
  const { kind: docKind, confidence: docConfidence } = classifyDocument(text)
  // Tally "Ledger Account" PDF: har transaction line alag bill/receipt banti hai
  if (docKind === 'ledger') {
    return parseLedgerPdfText(text)
  }

  const warnings: string[] = []

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

  const kind = docKind
  const confidence = docConfidence
  if (confidence < 0.5 && kind !== 'unknown') {
    warnings.push(`Document type pakka nahi (${kind}) — sahi hai ya nahi check karein`)
  }

  return {
    bills: [
      {
        kind,
        billRef,
        partyName,
        partyPhone,
        amount: Math.round(amount * 100) / 100,
        pendingAmount: Math.round(pendingAmount * 100) / 100,
        billDate,
        rawText: text.slice(0, 2000),
      },
    ],
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
