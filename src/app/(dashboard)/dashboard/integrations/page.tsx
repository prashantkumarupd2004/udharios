'use client'

import { useEffect, useState } from 'react'
import {
  Plug, Upload, Copy, Check, RefreshCw, FileUp, Download,
  Building2, KeyRound, AlertCircle, Search, ReceiptText, Clock,
  FileSpreadsheet, X,
} from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { KIND_LABELS } from '@/lib/universal-import'

interface TallyStatus {
  connected: boolean
  companyName?: string
  lastSyncAt?: string
  lastBillCount?: number
  totalBills?: number
  pendingBills?: number
  pendingAmount?: number
}

interface Bill {
  id: string
  billRef: string
  partyName: string
  partyPhone?: string
  amount: number
  pendingAmount: number
  billDate: string
  dueDate?: string
  voucherType?: string
  source: string
  syncedAt: string
}

interface ImpBill {
  kind: string
  billRef: string
  partyName: string
  partyPhone?: string
  amount: number
  pendingAmount: number
  billDate: string
}

const KIND_BADGE: Record<string, string> = {
  invoice: 'bg-blue-50 text-blue-700 border-blue-200',
  credit_note: 'bg-green-50 text-green-700 border-green-200',
  debit_note: 'bg-amber-50 text-amber-700 border-amber-200',
  ledger: 'bg-purple-50 text-purple-700 border-purple-200',
  receipt: 'bg-teal-50 text-teal-700 border-teal-200',
  unknown: 'bg-slate-100 text-slate-500 border-slate-300',
}

const KIND_OPTIONS = ['invoice', 'credit_note', 'debit_note', 'ledger', 'receipt']

function inr(n: number): string {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export default function IntegrationsPage() {
  const { lang } = useLanguage()
  const hi = lang === 'hi'

  const [status, setStatus] = useState<TallyStatus | null>(null)
  const [loading, setLoading] = useState(true)

  // connect form
  const [companyName, setCompanyName] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [keyCopied, setKeyCopied] = useState(false)

  // upload
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string>('')
  const [uploadError, setUploadError] = useState('')

  // bills
  const [bills, setBills] = useState<Bill[]>([])
  const [search, setSearch] = useState('')
  const [pendingOnly, setPendingOnly] = useState(true)

  // universal import (PDF / Excel — Vyapar & others)
  const [impFile, setImpFile] = useState<File | null>(null)
  const [impPreviewing, setImpPreviewing] = useState(false)
  const [impBills, setImpBills] = useState<ImpBill[]>([])
  const [impKind, setImpKind] = useState('')
  const [impWarnings, setImpWarnings] = useState<string[]>([])
  const [impError, setImpError] = useState('')
  const [impImporting, setImpImporting] = useState(false)
  const [impResult, setImpResult] = useState('')

  const loadStatus = async () => {
    const res = await fetch('/api/integrations/tally/status')
    if (res.ok) setStatus(await res.json())
    setLoading(false)
  }

  const loadBills = async () => {
    const params = new URLSearchParams({ limit: '20', pendingOnly: String(pendingOnly) })
    if (search) params.set('search', search)
    const res = await fetch(`/api/integrations/tally/bills?${params}`)
    if (res.ok) {
      const data = await res.json()
      setBills(data.bills)
    }
  }

  useEffect(() => { loadStatus() }, [])
  useEffect(() => { loadBills() }, [pendingOnly])

  const handleConnect = async () => {
    if (companyName.trim().length < 2) return
    setConnecting(true)
    try {
      const res = await fetch('/api/integrations/tally/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: companyName.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setNewKey(data.apiKey)
        loadStatus()
      }
    } finally {
      setConnecting(false)
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setUploadResult('')
    setUploadError('')
    try {
      const form = new FormData()
      form.append('file', file)
      if (status?.companyName) form.append('companyName', status.companyName)
      const res = await fetch('/api/integrations/tally/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok) {
        const master = data.customersFromMaster
        const masterMsg = master && (master.created + master.matched) > 0
          ? (hi ? `, ${master.created} customers master se` : `, ${master.created} from customer master`)
          : ''
        setUploadResult(
          hi
            ? `${data.billsFound} bills mile — ${data.outstandingsUpserted} udhaari records bane/update hue, ${data.customersCreated} customers auto-add${masterMsg}`
            : `${data.billsFound} bills found — ${data.outstandingsUpserted} ledger records created/updated, ${data.customersCreated} customers auto-added${masterMsg}`
        )
        loadStatus()
        loadBills()
      } else {
        setUploadError(data.error ?? 'Upload failed')
      }
    } catch {
      setUploadError(hi ? 'Network error' : 'Network error')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-6" />
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="h-64 bg-white rounded-3xl border border-slate-200 animate-pulse" />)}
        </div>
      </div>
    )
  }

  // ---- universal import handlers ----
  const handleImpPreview = async () => {
    if (!impFile) return
    setImpPreviewing(true)
    setImpError('')
    setImpResult('')
    setImpBills([])
    setImpWarnings([])
    try {
      const form = new FormData()
      form.append('file', impFile)
      form.append('action', 'preview')
      const res = await fetch('/api/integrations/import', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok) {
        setImpBills(data.bills ?? [])
        setImpKind(data.fileKind ?? '')
        setImpWarnings(data.warnings ?? [])
      } else {
        setImpError(data.error ?? 'Preview failed')
      }
    } catch {
      setImpError(hi ? 'Network error' : 'Network error')
    } finally {
      setImpPreviewing(false)
    }
  }

  const updateImpRow = (idx: number, patch: Partial<ImpBill>) => {
    setImpBills((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)))
  }

  const removeImpRow = (idx: number) => {
    setImpBills((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleImpImport = async () => {
    if (impBills.length === 0) return
    if (!confirm(hi ? `${impBills.length} bills import karein?` : `Import ${impBills.length} bills?`)) return
    setImpImporting(true)
    setImpError('')
    setImpResult('')
    try {
      const form = new FormData()
      form.append('action', 'import')
      form.append('bills', JSON.stringify(impBills))
      const res = await fetch('/api/integrations/import', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok) {
        setImpResult(
          hi
            ? `${data.imported} records import hue — ${data.outstandingsUpserted} udhaari records bane/update hue${data.skipped > 0 ? `, ${data.skipped} skip hue` : ''}`
            : `${data.imported} records imported — ${data.outstandingsUpserted} ledger records created/updated${data.skipped > 0 ? `, ${data.skipped} skipped` : ''}`
        )
        setImpBills([])
        setImpFile(null)
        loadStatus()
        loadBills()
      } else {
        setImpError(data.error ?? 'Import failed')
      }
    } catch {
      setImpError(hi ? 'Network error' : 'Network error')
    } finally {
      setImpImporting(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          {hi ? 'Tally Sync 🔗' : 'Tally Sync 🔗'}
        </h1>
        <p className="text-slate-500 mt-1 text-[15px]">
          {hi
            ? 'Tally ke bills Ugaahi me — bill number samajh ke automatic reminders'
            : 'Tally bills into Ugaahi — automatic reminders that understand bill numbers'}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* -------- connect / status card -------- */}
        <div className="bg-white rounded-3xl border border-green-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-amber-600 flex items-center justify-center shadow-md shadow-green-500/25">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-900 text-lg">Tally Prime</h2>
              <p className="text-xs text-slate-500 font-medium">
                {status?.connected ? (
                  <span className="inline-flex items-center gap-1 text-green-700 font-bold">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    {hi ? 'Connected' : 'Connected'} — {status.companyName}
                  </span>
                ) : (
                  <span className="text-slate-400">{hi ? 'Abhi connected nahi' : 'Not connected yet'}</span>
                )}
              </p>
            </div>
          </div>

          {status?.connected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#FDF9F1] rounded-2xl p-3.5 border border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">{hi ? 'Bills' : 'Bills'}</p>
                  <p className="text-xl font-extrabold text-slate-900">{status.totalBills ?? 0}</p>
                </div>
                <div className="bg-[#FDF9F1] rounded-2xl p-3.5 border border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">{hi ? 'Pending' : 'Pending'}</p>
                  <p className="text-xl font-extrabold text-green-600">{status.pendingBills ?? 0}</p>
                </div>
                <div className="bg-[#FDF9F1] rounded-2xl p-3.5 border border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">{hi ? 'Rashi' : 'Amount'}</p>
                  <p className="text-xl font-extrabold text-slate-900">{inr(status.pendingAmount ?? 0)}</p>
                </div>
              </div>
              {status.lastSyncAt && (
                <p className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  {hi ? 'Aakhri sync: ' : 'Last sync: '}
                  {new Date(status.lastSyncAt).toLocaleString('en-IN')}
                  {status.lastBillCount ? ` (${status.lastBillCount} bills)` : ''}
                </p>
              )}

              {/* API key display (one-time) */}
              {newKey ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-amber-800 mb-2">
                    <KeyRound className="w-4 h-4" />
                    {hi ? 'Sync agent ke liye API key (ek baar dikhegi!)' : 'API key for sync agent (shown once!)'}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white border border-amber-200 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-800 break-all">
                      {newKey}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(newKey)
                        setKeyCopied(true)
                        setTimeout(() => setKeyCopied(false), 2000)
                      }}
                      className="btn-ghost px-3.5 py-2.5 !text-sm"
                    >
                      {keyCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-amber-700 mt-2">
                    {hi
                      ? 'Ise Tally Sync Agent me paste karein — dobara nahi dikhegi'
                      : 'Paste this into the Tally Sync Agent — it won’t be shown again'}
                  </p>
                </div>
              ) : (
                <div>
                  <label className="field-label">{hi ? 'Tally company ka naam' : 'Tally company name'}</label>
                  <div className="flex gap-2">
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder={status.companyName ?? (hi ? 'e.g. Gupta Traders' : 'e.g. Gupta Traders')}
                      className="field"
                    />
                    <button onClick={handleConnect} disabled={connecting || companyName.trim().length < 2} className="btn-primary px-5 whitespace-nowrap">
                      {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : (hi ? 'Nayi key' : 'New key')}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {hi ? 'Nayi key banane se purani agent key kaam karna band kar degi' : 'Generating a new key disables the old agent key'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="field-label">{hi ? 'Tally me company ka naam *' : 'Company name in Tally *'}</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={hi ? 'e.g. Gupta Traders' : 'e.g. Gupta Traders'}
                  className="field"
                />
                <p className="text-xs text-slate-400 mt-1.5">
                  {hi ? 'Tally Prime me Gateway of Tally par jo naam dikhta hai, wahi likhein' : 'Enter the exact name shown on Tally’s Gateway screen'}
                </p>
              </div>
              <button onClick={handleConnect} disabled={connecting || companyName.trim().length < 2} className="btn-primary w-full py-3.5">
                {connecting
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <><Plug className="w-4 h-4" /> {hi ? 'Tally connect karein' : 'Connect Tally'}</>}
              </button>
            </div>
          )}
        </div>

        {/* -------- upload card -------- */}
        <div className="bg-white rounded-3xl border border-green-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center">
              <FileUp className="w-6 h-6 text-green-700" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-900 text-lg">{hi ? 'Bills upload karein' : 'Upload bills'}</h2>
              <p className="text-xs text-slate-500 font-medium">{hi ? 'Tally XML ya CSV — bina agent ke' : 'Tally XML or CSV — no agent needed'}</p>
            </div>
          </div>

          <div className="bg-[#FDF9F1] border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center">
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <label className="cursor-pointer">
              <span className="btn-ghost px-5 py-2.5 !text-sm">
                {file ? file.name : (hi ? 'File chunein' : 'Choose file')}
              </span>
              <input
                type="file"
                accept=".xml,.csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-xs text-slate-400 mt-2">XML / CSV • max 10MB</p>
          </div>

          <div className="mt-4 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-900">
            <p className="font-bold mb-1.5">{hi ? 'Tally se kaise nikalein:' : 'How to export from Tally:'}</p>
            <ol className="list-decimal list-inside space-y-1 text-[13px] leading-relaxed">
              <li>{hi ? 'Gateway of Tally → Display → Statements of Accounts → Outstandings → Receivables' : 'Gateway of Tally → Display → Statements of Accounts → Outstandings → Receivables'}</li>
              <li>{hi ? 'Bill-wise view kholein → Alt+E (Export) → Format: XML' : 'Open bill-wise view → Alt+E (Export) → Format: XML'}</li>
              <li>{hi ? 'File yahan upload karein — bills apne aap sync ho jayenge' : 'Upload the file here — bills sync automatically'}</li>
            </ol>
            <a href="/api/integrations/tally/template" className="inline-flex items-center gap-1.5 text-blue-700 font-bold mt-2.5 hover:underline">
              <Download className="w-4 h-4" /> {hi ? 'CSV template download karein' : 'Download CSV template'}
            </a>
          </div>

          {uploadError && (
            <p className="flex items-start gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4 font-medium">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {uploadError}
            </p>
          )}
          {uploadResult && (
            <p className="flex items-start gap-2 text-green-800 text-sm bg-green-50 border border-green-200 rounded-xl px-4 py-3 mt-4 font-medium">
              <Check className="w-4 h-4 mt-0.5 flex-shrink-0" /> {uploadResult}
            </p>
          )}

          <button onClick={handleUpload} disabled={!file || uploading} className="btn-primary w-full py-3.5 mt-4">
            {uploading
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <><Upload className="w-4 h-4" /> {hi ? 'Upload & Sync' : 'Upload & Sync'}</>}
          </button>
        </div>

        {/* -------- universal import card (PDF / Excel — Vyapar & others) -------- */}
        <div className="bg-white rounded-3xl border border-green-100 shadow-sm p-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-amber-700" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-900 text-lg">{hi ? 'PDF / Excel Import' : 'PDF / Excel Import'}</h2>
              <p className="text-xs text-slate-500 font-medium">
                {hi ? 'Vyapar ya kisi bhi billing app se — pehle preview dekhein, phir import karein' : 'From Vyapar or any billing app — preview first, then import'}
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-[#FDF9F1] border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center">
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <label className="cursor-pointer">
                <span className="btn-ghost px-5 py-2.5 !text-sm">
                  {impFile ? impFile.name : (hi ? 'File chunein' : 'Choose file')}
                </span>
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    setImpFile(e.target.files?.[0] ?? null)
                    setImpBills([])
                    setImpResult('')
                    setImpError('')
                    setImpWarnings([])
                  }}
                />
              </label>
              <p className="text-xs text-slate-400 mt-2">PDF / Excel / CSV • max 10MB</p>
              <button onClick={handleImpPreview} disabled={!impFile || impPreviewing} className="btn-primary w-full py-3 mt-4">
                {impPreviewing
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <>{hi ? 'Preview Dekhein' : 'See Preview'}</>}
              </button>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-900">
              <p className="font-bold mb-1.5">{hi ? 'Kaise kaam karta hai:' : 'How it works:'}</p>
              <ol className="list-decimal list-inside space-y-1 text-[13px] leading-relaxed">
                <li>{hi ? 'Vyapar/app se bill ka PDF ya Excel nikalein' : 'Export bill PDF or Excel from Vyapar/your app'}</li>
                <li>{hi ? 'Yahan upload karke Preview dekhein — system bill, credit note, ledger samajhta hai' : 'Upload here and preview — the system understands bills, credit notes, ledgers'}</li>
                <li>{hi ? 'Galat rows hatayein ya type sudharein, phir Import Karo dabayein' : 'Remove wrong rows or fix types, then hit Import'}</li>
              </ol>
            </div>
          </div>

          {impError && (
            <p className="flex items-start gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4 font-medium">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {impError}
            </p>
          )}
          {impWarnings.length > 0 && (
            <div className="text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4 font-medium">
              {impWarnings.map((w, i) => (
                <p key={i} className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}
          {impResult && (
            <p className="flex items-start gap-2 text-green-800 text-sm bg-green-50 border border-green-200 rounded-xl px-4 py-3 mt-4 font-medium">
              <Check className="w-4 h-4 mt-0.5 flex-shrink-0" /> {impResult}
            </p>
          )}

          {impBills.length > 0 && (
            <div className="mt-5">
              <p className="font-bold text-slate-900 mb-2">
                {hi ? `Preview — ${impBills.length} rows mile (${impKind})` : `Preview — ${impBills.length} rows found (${impKind})`}
              </p>
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                      <th className="pb-2.5 font-bold pr-2">{hi ? 'Type' : 'Type'}</th>
                      <th className="pb-2.5 font-bold pr-2">{hi ? 'Bill no' : 'Bill no'}</th>
                      <th className="pb-2.5 font-bold pr-2">{hi ? 'Party' : 'Party'}</th>
                      <th className="pb-2.5 font-bold pr-2">{hi ? 'Phone' : 'Phone'}</th>
                      <th className="pb-2.5 font-bold pr-2 text-right">{hi ? 'Rashi' : 'Amount'}</th>
                      <th className="pb-2.5 font-bold pr-2">{hi ? 'Date' : 'Date'}</th>
                      <th className="pb-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {impBills.map((b, i) => (
                      <tr key={i} className={b.kind === 'unknown' ? 'bg-amber-50/60' : ''}>
                        <td className="py-2 pr-2">
                          <select
                            value={b.kind}
                            onChange={(e) => updateImpRow(i, { kind: e.target.value })}
                            className={`text-[11px] font-bold px-2 py-1.5 rounded-full border ${KIND_BADGE[b.kind] ?? KIND_BADGE.unknown}`}
                          >
                            {b.kind === 'unknown' && <option value="unknown">{KIND_LABELS.unknown[hi ? 'hi' : 'en']}</option>}
                            {KIND_OPTIONS.map((k) => (
                              <option key={k} value={k}>{KIND_LABELS[k as keyof typeof KIND_LABELS][hi ? 'hi' : 'en']}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            value={b.billRef}
                            onChange={(e) => updateImpRow(i, { billRef: e.target.value })}
                            className="field !py-1.5 !text-[13px] w-28"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            value={b.partyName}
                            onChange={(e) => updateImpRow(i, { partyName: e.target.value })}
                            className="field !py-1.5 !text-[13px] w-36"
                          />
                        </td>
                        <td className="py-2 pr-2 text-[13px] text-slate-600">{b.partyPhone ?? '—'}</td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            value={b.pendingAmount}
                            onChange={(e) => updateImpRow(i, { pendingAmount: Number(e.target.value), amount: Number(e.target.value) })}
                            className="field !py-1.5 !text-[13px] w-24 text-right"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="date"
                            value={b.billDate}
                            onChange={(e) => updateImpRow(i, { billDate: e.target.value })}
                            className="field !py-1.5 !text-[13px] w-36"
                          />
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => removeImpRow(i)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title={hi ? 'Row hatayein' : 'Remove row'}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={handleImpImport} disabled={impImporting} className="btn-primary w-full py-3.5 mt-4">
                {impImporting
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <><Upload className="w-4 h-4" /> {hi ? `Import Karo (${impBills.length})` : `Import (${impBills.length})`}</>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* -------- bills table -------- */}
      <div className="bg-white rounded-3xl border border-green-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <ReceiptText className="w-5 h-5 text-green-600" />
            <h2 className="font-extrabold text-slate-900 text-lg">{hi ? 'Synced bills' : 'Synced bills'}</h2>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadBills()}
                placeholder={hi ? 'Bill / party khojein' : 'Search bill / party'}
                className="field !pl-9 !py-2.5"
              />
            </div>
            <button
              onClick={() => setPendingOnly(!pendingOnly)}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                pendingOnly ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-slate-200 text-slate-500'
              }`}
            >
              {hi ? 'Sirf pending' : 'Pending only'}
            </button>
          </div>
        </div>

        {bills.length === 0 ? (
          <div className="text-center py-12">
            <ReceiptText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-bold text-slate-700">{hi ? 'Abhi koi bill sync nahi hua' : 'No bills synced yet'}</p>
            <p className="text-sm text-slate-400 mt-1">{hi ? 'Upar se Tally connect karein ya file upload karein' : 'Connect Tally or upload a file above'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="pb-2.5 font-bold">{hi ? 'Bill' : 'Bill'}</th>
                  <th className="pb-2.5 font-bold">{hi ? 'Party' : 'Party'}</th>
                  <th className="pb-2.5 font-bold text-right">{hi ? 'Pending' : 'Pending'}</th>
                  <th className="pb-2.5 font-bold">{hi ? 'Due date' : 'Due date'}</th>
                  <th className="pb-2.5 font-bold">{hi ? 'Source' : 'Source'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {bills.map((b) => (
                  <tr key={b.id} className="hover:bg-green-50/40">
                    <td className="py-3 pr-3">
                      <p className="font-bold text-slate-900">{b.billRef}</p>
                      <p className="text-xs text-slate-400">{b.voucherType ?? ''}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-slate-800">{b.partyName}</p>
                      {b.partyPhone && <p className="text-xs text-slate-400">{b.partyPhone}</p>}
                    </td>
                    <td className="py-3 pr-3 text-right">
                      <p className={`font-extrabold ${b.pendingAmount > 0 ? 'text-green-600' : 'text-green-600'}`}>
                        {b.pendingAmount > 0 ? inr(b.pendingAmount) : (hi ? 'Paid ✓' : 'Paid ✓')}
                      </p>
                      <p className="text-xs text-slate-400">{hi ? 'kul' : 'of'} {inr(b.amount)}</p>
                    </td>
                    <td className="py-3 pr-3 text-slate-600 text-[13px]">
                      {b.dueDate ? new Date(b.dueDate).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="py-3">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        b.source === 'tally_agent' ? 'bg-blue-50 text-blue-700' : b.source === 'tally_xml' ? 'bg-purple-50 text-purple-700' : b.source === 'file_import' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {b.source === 'tally_agent' ? (hi ? 'Auto-sync' : 'Auto-sync') : b.source === 'tally_xml' ? 'XML' : b.source === 'file_import' ? 'PDF/Excel' : (hi ? 'Manual' : 'Manual')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* -------- agent info -------- */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-3xl p-6 text-white">
        <h3 className="font-extrabold text-lg mb-2">{hi ? '🤖 Tally Sync Agent (automatic)' : '🤖 Tally Sync Agent (automatic)'}</h3>
        <p className="text-slate-300 text-sm leading-relaxed max-w-3xl">
          {hi
            ? 'Roz-roz file upload nahi karna? Apne Windows computer par chhota sa Sync Agent install karein — wo har 30 minute me Tally se naye bills nikal kar Ugaahi ko bhej dega. Tally chalta rehna chahiye, bas.'
            : 'Don’t want to upload files daily? Install the tiny Sync Agent on your Windows computer — it pulls new bills from Tally every 30 minutes and pushes them to Ugaahi. Tally just needs to be running.'}
        </p>
        <div className="flex flex-wrap gap-2.5 mt-4 text-[13px]">
          {[
            hi ? '1. Upar "Tally connect karein" se API key lein' : '1. Get API key via "Connect Tally" above',
            hi ? '2. Agent me key + company naam daalein' : '2. Paste key + company name in the agent',
            hi ? '3. Bas — bills apne aap sync honge' : '3. Done — bills sync automatically',
          ].map((s) => (
            <span key={s} className="bg-white/10 border border-white/15 rounded-xl px-3.5 py-2 font-medium">{s}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
