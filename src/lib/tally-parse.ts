/**
 * src/lib/tally-parse.ts — Parse Tally bill-wise outstanding exports.
 *
 * Supports:
 *  1. Tally XML export (Gateway of Tally → Display → Statements of Accounts
 *     → Outstandings → Receivables → bill-wise → Export → XML). The parser is
 *     tolerant: it scans for known tag variants because exact tags differ
 *     across Tally versions.
 *  2. CSV with headers: bill_ref, party_name, amount, pending_amount,
 *     bill_date, due_date, party_phone, voucher_type
 */

import { XMLParser } from 'fast-xml-parser'
import Papa from 'papaparse'
import type { TallyBillInput } from '@/lib/tally'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(String(v).replace(/[₹,\s]/g, ''))
  return isNaN(n) ? 0 : n
}

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

/** Tally dates come as YYYYMMDD, "12-Oct-2024", or ISO. Normalize to YYYY-MM-DD. */
export function normalizeTallyDate(v: unknown): string {
  const s = str(v)
  if (!s) return ''
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }
  // DD-Mon-YYYY e.g. 12-Oct-2024, ya DD-Mon-YY e.g. 1-Apr-26
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/)
  if (m) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    }
    const mm = months[m[2].toLowerCase()]
    if (mm) {
      let yyyy = m[3]
      if (yyyy.length === 2) yyyy = (parseInt(yyyy) > 50 ? '19' : '20') + yyyy
      return `${yyyy}-${mm}-${m[1].padStart(2, '0')}`
    }
  }
  // Already ISO-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return ''
}

/** Pick the first non-empty value from candidate keys (case-insensitive). */
function pick(obj: Record<string, unknown>, keys: string[]): string {
  const lower: Record<string, unknown> = {}
  for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k]
  for (const k of keys) {
    const v = str(lower[k.toLowerCase()])
    if (v) return v
  }
  return ''
}

const BILL_REF_KEYS = ['billname', 'billref', 'billno', 'billnumber', 'vouchernumber', 'vchno', 'refno', 'invoiceno']
const PARTY_KEYS = ['partyname', 'ledgername', 'dspvchledger', 'party', 'ledger', 'accountname', 'billparty']
const AMOUNT_KEYS = ['billamount', 'amount', 'dspvchamt', 'vchamt', 'debitamount', 'billcl']
const PENDING_KEYS = ['billsdueamt', 'billsosdue', 'billpending', 'pendingamt', 'osamt', 'balance', 'closingbalance', 'netamount', 'billcl', 'billoverdue']
const BILL_DATE_KEYS = ['billdate', 'date', 'dspvchdate', 'vchdate']
const DUE_DATE_KEYS = ['billdue', 'duedate', 'billduedate', 'creditduedate']
const PHONE_KEYS = ['partyphone', 'phone', 'mobileno', 'contactno']
const VCHTYPE_KEYS = ['vouchertypename', 'vchtype', 'vouchertype']

function rowToBill(obj: Record<string, unknown>, tallyCompany?: string): TallyBillInput | null {
  const billRef = pick(obj, BILL_REF_KEYS)
  const partyName = pick(obj, PARTY_KEYS)
  if (!billRef || !partyName) return null

  const amount = Math.abs(num(pick(obj, AMOUNT_KEYS)))
  const pendingRaw = pick(obj, PENDING_KEYS)
  const pendingAmount = pendingRaw ? Math.abs(num(pendingRaw)) : amount
  const billDate = normalizeTallyDate(pick(obj, BILL_DATE_KEYS))
  const dueDate = normalizeTallyDate(pick(obj, DUE_DATE_KEYS))

  return {
    billRef,
    partyName,
    partyPhone: pick(obj, PHONE_KEYS) || undefined,
    amount: amount || pendingAmount,
    pendingAmount,
    billDate: billDate || new Date().toISOString().slice(0, 10),
    dueDate: dueDate || undefined,
    voucherType: pick(obj, VCHTYPE_KEYS) || undefined,
    tallyCompany,
  }
}

// ---------------------------------------------------------------------------
// Tally XML
// ---------------------------------------------------------------------------

/**
 * Kuch Tally exports me bill data aise hota hai:
 *   <BILLFIXED><BILLREF>3</BILLREF><BILLPARTY>X</BILLPARTY></BILLFIXED>
 *   <BILLCL>-200000</BILLCL><BILLDUE>3-Apr-26</BILLDUE>
 * Sibling tags (amount/due) ko BILLFIXED object me merge karo taaki
 * row detection (billref + party ek hi object me) kaam kare.
 * Repeated tags arrays bante hain — index-wise parallel merge.
 */
function mergeBillFixedSiblings(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) mergeBillFixedSiblings(item)
    return
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    const bfKey = Object.keys(obj).find((k) => k.toLowerCase() === 'billfixed')
    if (bfKey) {
      const bfVal = obj[bfKey]
      const bfArr = Array.isArray(bfVal) ? bfVal : [bfVal]
      const siblingVals: Record<string, unknown[]> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (k === bfKey) continue
        const lk = k.toLowerCase()
        if (Array.isArray(v) && v.length === bfArr.length) {
          siblingVals[lk] = v
        } else if (v === null || typeof v !== 'object') {
          siblingVals[lk] = bfArr.map(() => v)
        }
      }
      bfArr.forEach((bf, i) => {
        if (bf && typeof bf === 'object' && !Array.isArray(bf)) {
          const rec = bf as Record<string, unknown>
          for (const [lk, arr] of Object.entries(siblingVals)) {
            if (!(lk in rec)) rec[lk] = arr[i]
          }
        }
      })
    }
    for (const v of Object.values(obj)) mergeBillFixedSiblings(v)
  }
}

/** Recursively collect candidate row objects from parsed XML. */
function collectRows(node: unknown, out: Array<Record<string, unknown>>): void {  if (Array.isArray(node)) {
    for (const item of node) collectRows(item, out)
    return
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    const keys = Object.keys(obj).map((k) => k.toLowerCase())
    const looksLikeBillRow =
      BILL_REF_KEYS.some((k) => keys.includes(k)) && PARTY_KEYS.some((k) => keys.includes(k))
    if (looksLikeBillRow) {
      out.push(obj)
    } else {
      for (const v of Object.values(obj)) collectRows(v, out)
    }
  }
}

export function parseTallyXml(xml: string, tallyCompany?: string): { bills: TallyBillInput[]; warnings: string[] } {
  const warnings: string[] = []
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true })
  let parsed: unknown
  try {
    parsed = parser.parse(xml)
  } catch {
    return { bills: [], warnings: ['XML parse nahi ho paya — sahi Tally XML file upload karein'] }
  }

  const rows: Array<Record<string, unknown>> = []
  mergeBillFixedSiblings(parsed)
  collectRows(parsed, rows)

  const bills: TallyBillInput[] = []
  for (const r of rows) {
    const bill = rowToBill(r, tallyCompany)
    if (bill) bills.push(bill)
  }

  if (bills.length === 0) {
    warnings.push(
      'Koi bill nahi mila. Tally me bill-wise Outstanding Receivables report kholkar XML export karein.'
    )
  }
  return { bills, warnings }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const CSV_HEADERS: Record<string, string[]> = {
  billRef: ['bill_ref', 'billref', 'bill_no', 'billno', 'invoice_no', 'ref'],
  partyName: ['party_name', 'partyname', 'party', 'ledger', 'ledger_name', 'customer'],
  partyPhone: ['party_phone', 'phone', 'mobile', 'contact'],
  amount: ['amount', 'bill_amount', 'total'],
  pendingAmount: ['pending_amount', 'pending', 'os_amount', 'balance', 'due_amount'],
  billDate: ['bill_date', 'date', 'billdate'],
  dueDate: ['due_date', 'duedate'],
  voucherType: ['voucher_type', 'vch_type', 'type'],
}

export function parseTallyCsv(csv: string, tallyCompany?: string): { bills: TallyBillInput[]; warnings: string[] } {
  const warnings: string[] = []
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return { bills: [], warnings: ['CSV parse nahi ho paya'] }
  }

  // Map actual headers → our fields
  const headerMap: Record<string, string> = {}
  const actualHeaders = parsed.meta.fields ?? []
  for (const h of actualHeaders) {
    const hl = h.toLowerCase().trim()
    for (const [field, variants] of Object.entries(CSV_HEADERS)) {
      if (variants.includes(hl)) headerMap[field] = h
    }
  }

  if (!headerMap.billRef || !headerMap.partyName) {
    return {
      bills: [],
      warnings: ['CSV me bill_ref aur party_name columns chahiye — template download karke dekhein'],
    }
  }

  const bills: TallyBillInput[] = []
  for (const row of parsed.data) {
    const get = (f: string) => str(row[headerMap[f]])
    const billRef = get('billRef')
    const partyName = get('partyName')
    if (!billRef || !partyName) continue
    const amount = num(get('amount'))
    const pendingRaw = get('pendingAmount')
    bills.push({
      billRef,
      partyName,
      partyPhone: get('partyPhone') || undefined,
      amount: amount || num(pendingRaw),
      pendingAmount: pendingRaw ? num(pendingRaw) : amount,
      billDate: normalizeTallyDate(get('billDate')) || new Date().toISOString().slice(0, 10),
      dueDate: normalizeTallyDate(get('dueDate')) || undefined,
      voucherType: get('voucherType') || undefined,
      tallyCompany,
    })
  }

  return { bills, warnings }
}

// ---------------------------------------------------------------------------
// Tally customer master (ledger list)
// ---------------------------------------------------------------------------

const LEDGER_NAME_KEYS = ['ledgername', 'name', 'accountname']
const LEDGER_PARENT_KEYS = ['parent', 'groupname', 'parentgroup']
const LEDGER_PHONE_KEYS = ['ledgerphone', 'phone', 'mobileno', 'contactno', 'ledgermobile']
const LEDGER_ADDR_KEYS = ['address', 'ledgeraddress', 'address1']
const LEDGER_GSTIN_KEYS = ['gstin', 'ledg gstin', 'partygstin']

function isDebtor(parent: string): boolean {
  const p = parent.toLowerCase()
  return p.includes('sundry debtor') || p === 'debtors'
}

/** Recursively collect ledger-master candidate nodes. */
function collectLedgers(node: unknown, out: Array<Record<string, unknown>>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectLedgers(item, out)
    return
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    const keys = Object.keys(obj).map((k) => k.toLowerCase().replace(/^@_/, ''))
    const hasName =
      LEDGER_NAME_KEYS.some((k) => keys.includes(k)) ||
      Object.keys(obj).some((k) => k.toLowerCase() === '@_name')
    const hasParent = LEDGER_PARENT_KEYS.some((k) => keys.includes(k))
    if (hasName && hasParent) {
      out.push(obj)
    } else {
      for (const v of Object.values(obj)) collectLedgers(v, out)
    }
  }
}

export interface TallyLedgerInput {
  name: string
  phone?: string
  address?: string
  gstin?: string
}

/**
 * Parse Tally ledger master XML (e.g. "List of Accounts" export).
 * Returns only Sundry Debtors (customers), skipping suppliers/others.
 */
export function parseTallyLedgers(xml: string): { customers: TallyLedgerInput[]; warnings: string[] } {
  const warnings: string[] = []
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true })
  let parsed: unknown
  try {
    parsed = parser.parse(xml)
  } catch {
    return { customers: [], warnings: ['XML parse nahi ho paya'] }
  }

  const rows: Array<Record<string, unknown>> = []
  collectLedgers(parsed, rows)

  const seen = new Set<string>()
  const customers: TallyLedgerInput[] = []
  for (const r of rows) {
    const parent = pick(r, LEDGER_PARENT_KEYS)
    if (!isDebtor(parent)) continue
    // Name may be an XML attribute: <LEDGER NAME="...">
    const attrName =
      str(r['@_NAME'] ?? r['@_name'] ?? r['@_ledgername'] ?? '')
    const name = pick(r, LEDGER_NAME_KEYS) || attrName
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    customers.push({
      name,
      phone: pick(r, LEDGER_PHONE_KEYS) || undefined,
      address: pick(r, LEDGER_ADDR_KEYS) || undefined,
      gstin: pick(r, LEDGER_GSTIN_KEYS) || undefined,
    })
  }

  return { customers, warnings }
}

export const CSV_TEMPLATE =
  'bill_ref,party_name,party_phone,amount,pending_amount,bill_date,due_date,voucher_type\n' +
  'INV-1001,Ramesh Kirana,9876543210,5400,5400,2026-09-20,2026-10-05,Sales\n' +
  'INV-1002,Suresh Traders,,12500,8000,2026-09-25,2026-10-10,Sales\n'
