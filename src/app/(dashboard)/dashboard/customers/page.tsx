'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Search, Plus, Upload, X, Users, IndianRupee, CheckCircle2, AlertTriangle, Phone, Trash2 } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'

interface Customer {
  id: string
  name: string
  phone: string
  consent: boolean
  optedOut: boolean
  _count: { outstandings: number }
  pendingTotal: number
  overdueCount: number
  createdAt: string
}

function fmtPhone(p: string) {
  if (!p || p.startsWith('tally-')) return '—'
  return p.startsWith('+91') ? p : `+91 ${p}`
}

function AddCustomerModal({ onClose, onSuccess, lang }: { onClose: () => void; onSuccess: () => void; lang: string }) {
  const [form, setForm] = useState({ name: '', phone: '', notes: '', email: '', consent: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.consent) {
      setError(lang === 'hi' ? 'Customer ka consent zaroori hai' : 'Customer consent is required')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, email: form.email.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error'); return }
      onSuccess()
      onClose()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-slate-900">{lang === 'hi' ? 'Naya Customer' : 'New Customer'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">{lang === 'hi' ? 'Naam *' : 'Name *'}</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required placeholder="Ramesh Kumar"
              className="field"
              id="customer-name-input"
            />
          </div>
          <div>
            <label className="field-label">{lang === 'hi' ? 'Mobile *' : 'Mobile *'}</label>
            <div className="flex">
              <span className="bg-slate-100 border border-slate-200 border-r-0 rounded-l-xl px-3 flex items-center text-slate-500 text-sm font-semibold">+91</span>
              <input
                type="tel" inputMode="numeric"
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                required placeholder="9876543210"
                className="field !rounded-l-none"
                id="customer-phone-input"
              />
            </div>
          </div>
          <div>
            <label className="field-label">{lang === 'hi' ? 'Email (company customers ke liye)' : 'Email (for company customers)'}</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="accounts@company.com"
              className="field"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              {lang === 'hi' ? 'Optional — email bharne pe customer page se Email reminder mode on kar sakte ho' : 'Optional — enables Email reminder mode on the customer page'}
            </p>
          </div>
          <div>
            <label className="field-label">{lang === 'hi' ? 'Notes' : 'Notes'}</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder={lang === 'hi' ? 'Optional notes...' : 'Optional notes...'}
              rows={2}
              className="field resize-none"
            />
          </div>

          {/* Consent checkbox — MANDATORY */}
          <div
            className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${
              form.consent ? 'bg-green-50 border-green-300' : 'bg-red-50/50 border-red-200'
            }`}
            onClick={() => setForm(p => ({ ...p, consent: !p.consent }))}
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                form.consent ? 'bg-green-600 border-green-600' : 'border-slate-300 bg-white'
              }`}>
                {form.consent && <span className="text-white text-xs font-bold">✓</span>}
              </div>
              <span className="text-sm text-slate-700 font-medium">
                {lang === 'hi'
                  ? 'Customer ne WhatsApp reminders ke liye consent diya hai ✓'
                  : 'Customer has consented to receive WhatsApp reminders ✓'}
              </span>
            </label>
          </div>

          {error && <p className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 py-3">
              {lang === 'hi' ? 'Cancel' : 'Cancel'}
            </button>
            <button
              type="submit" disabled={loading || !form.consent}
              className="btn-primary flex-1 py-3"
              id="customer-submit-btn"
            >
              {loading ? '...' : (lang === 'hi' ? 'Add Karo' : 'Add Customer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CustomersPage() {
  const { lang } = useLanguage()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue' | 'clear'>('all')
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchCustomers = useCallback(async () => {
    const params = search ? `?search=${encodeURIComponent(search)}` : ''
    const res = await fetch(`/api/customers${params}`)
    const data = await res.json()
    setCustomers(data.customers ?? [])
    setLoading(false)
  }, [search])

  // Bulk delete handlers
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = (ids: string[]) => {
    setSelected(prev => {
      const allSelected = ids.every(id => prev.has(id))
      if (allSelected) return new Set()
      return new Set(ids)
    })
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    const ok = window.confirm(
      `${selected.size} customers DELETE karne hain?\n\nSARA data hat jayega (bills, calls, promises sab)!\nYe wapas nahi aayega!`
    )
    if (!ok) return
    setBulkDeleting(true)
    try {
      const res = await fetch('/api/customers/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      alert(`${data.deleted} customers delete ho gaye!`)
      setSelected(new Set())
      fetchCustomers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Bulk delete nahi ho paya')
    } finally {
      setBulkDeleting(false)
    }
  }

  // CSV import — file browser me parse karo, phir POST /api/customers/import (JSON) pe bhejo.
  // API ko { rows, columnMap: { name, phone, notes? } } chahiye.
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // taaki wahi file dobara select ho sake
    if (!file) return
    setImporting(true)
    try {
      const { default: Papa } = await import('papaparse')
      const text = await file.text()
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
      const rows = parsed.data ?? []
      if (rows.length === 0) {
        alert(lang === 'hi' ? 'CSV me koi row nahi mili' : 'No rows found in the CSV file')
        return
      }
      const headers = (parsed.meta.fields ?? []).map(h => h.trim())
      const findCol = (...keys: string[]) =>
        headers.find(h => keys.some(k => h.toLowerCase().includes(k)))
      const nameCol = findCol('name', 'naam')
      const phoneCol = findCol('phone', 'mobile', 'contact')
      const notesCol = findCol('note', 'remark')
      if (!nameCol || !phoneCol) {
        alert(
          lang === 'hi'
            ? 'CSV me "name" aur "phone"/"mobile" header wale columns hone chahiye'
            : 'CSV must have "name" and "phone"/"mobile" header columns'
        )
        return
      }
      const res = await fetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          columnMap: { name: nameCol, phone: phoneCol, notes: notesCol },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? (lang === 'hi' ? 'Import fail ho gaya' : 'Import failed'))
        return
      }
      const r = data.results ?? { imported: 0, skipped: 0, errors: [] }
      const errCount = (r.errors ?? []).length
      alert(
        lang === 'hi'
          ? `Import complete: ${r.imported} add hue, ${r.skipped} pehle se the (skip)${errCount > 0 ? `, ${errCount} me error` : ''}`
          : `Import complete: ${r.imported} added, ${r.skipped} skipped (already existed)${errCount > 0 ? `, ${errCount} errors` : ''}`
      )
      fetchCustomers()
    } catch {
      alert(lang === 'hi' ? 'File padhne me dikkat aayi' : 'Could not read the file')
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(fetchCustomers, 300)
    return () => clearTimeout(timer)
  }, [fetchCustomers])

  const filtered = customers.filter(c => {
    if (filter === 'pending') return c._count.outstandings > 0
    if (filter === 'overdue') return c.overdueCount > 0
    if (filter === 'clear') return c._count.outstandings === 0
    return true
  })

  const totalPending = customers.reduce((s, c) => s + (c.pendingTotal ?? 0), 0)
  const pendingCount = customers.filter(c => c._count.outstandings > 0).length
  const overdueCount = customers.filter(c => c.overdueCount > 0).length

  const tabs = [
    { k: 'all', label: lang === 'hi' ? 'Sab' : 'All', count: customers.length },
    { k: 'pending', label: lang === 'hi' ? 'Baaki' : 'Pending', count: pendingCount },
    { k: 'overdue', label: 'Overdue', count: overdueCount },
    { k: 'clear', label: lang === 'hi' ? 'Clear' : 'Clear', count: customers.length - pendingCount },
  ] as const

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{lang === 'hi' ? 'Customers' : 'Customers'}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{customers.length} {lang === 'hi' ? 'kul customers' : 'total customers'}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="btn-ghost px-3 py-2.5 text-sm"
            title={lang === 'hi' ? 'CSV file se customers import karo' : 'Import customers from a CSV file'}
          >
            <Upload className="w-4 h-4" /> {importing ? '...' : (lang === 'hi' ? 'Import' : 'Import')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportFile}
            aria-label="Import customers CSV"
          />
          <button onClick={() => setShowAdd(true)} className="btn-primary px-4 py-2.5 text-sm" id="open-add-customer-btn">
            <Plus className="w-4 h-4" strokeWidth={2.5} /> {lang === 'hi' ? 'Naya Customer' : 'Add Customer'}
          </button>
          {selected.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="px-4 py-2.5 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {bulkDeleting ? 'Deleting...' : `Delete (${selected.size})`}
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {!loading && customers.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="stat-card !p-3 sm:!p-4 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-slate-500" />
              </span>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">{lang === 'hi' ? 'Kul' : 'Total'}</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold amount-display text-slate-900 truncate">{customers.length}</p>
          </div>
          <div className="stat-card !p-3 sm:!p-4 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <IndianRupee className="w-4 h-4 text-slate-500" />
              </span>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">{lang === 'hi' ? 'Kul Baaki' : 'Pending'}</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold amount-display text-slate-900 truncate">₹{totalPending.toLocaleString('en-IN')}</p>
          </div>
          <div className="stat-card !p-3 sm:!p-4 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </span>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">{lang === 'hi' ? 'Clear' : 'Clear'}</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold amount-display text-slate-900 truncate">{customers.length - pendingCount}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={lang === 'hi' ? 'Naam ya number se search karein...' : 'Search by name or phone...'}
          className="field !pl-10"
          id="customer-search-input"
        />
      </div>

      {/* Filter tabs — segmented control */}
      {!loading && customers.length > 0 && (
        <div className="inline-flex max-w-full bg-slate-100 rounded-xl p-1 gap-0.5 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.k}
              onClick={() => setFilter(t.k)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                filter === t.k
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs font-bold ${filter === t.k ? 'text-slate-500' : 'text-slate-400'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Customer list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200/80 rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <Users className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-slate-500 mb-4 font-medium">
            {search || filter !== 'all'
              ? (lang === 'hi' ? 'Koi customer nahi mila' : 'No customers found')
              : (lang === 'hi' ? 'Abhi koi customer nahi hai' : 'No customers yet')}
          </p>
          {!search && filter === 'all' && (
            <button onClick={() => setShowAdd(true)} className="text-green-600 font-semibold text-sm hover:underline">
              {lang === 'hi' ? 'Pehla customer add karein →' : 'Add your first customer →'}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {filtered.length > 0 && (
            <div className="flex items-center gap-3 px-4 sm:px-5 py-2.5 bg-slate-50/80 border-b border-slate-100">
              <input
                type="checkbox"
                checked={filtered.length > 0 && filtered.every(c => selected.has(c.id))}
                onChange={() => toggleSelectAll(filtered.map(c => c.id))}
                className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500 cursor-pointer"
                aria-label="Select all"
              />
              <span className="text-xs font-medium text-slate-500">
                {selected.size > 0
                  ? `${selected.size} selected`
                  : (lang === 'hi' ? 'Sab select karo' : 'Select all')}
              </span>
            </div>
          )}
          {filtered.map(c => {
            const hasPending = c._count.outstandings > 0
            const isOverdue = c.overdueCount > 0
            return (
              <div
                key={c.id}
                className="flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  onClick={e => e.stopPropagation()}
                  className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500 flex-shrink-0 cursor-pointer"
                  aria-label={`Select ${c.name}`}
                />
                <Link
                  href={`/dashboard/customers/${c.id}`}
                  className="flex items-center gap-4 flex-1 min-w-0"
                >
                <div className={`w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold flex-shrink-0 ${c.optedOut ? 'opacity-50' : ''}`}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                    {c.optedOut && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex-shrink-0">Opted out</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <Phone className="w-3 h-3" /> {fmtPhone(c.phone)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  {hasPending ? (
                    <>
                      <p className={`text-[15px] font-bold amount-display ${isOverdue ? 'text-red-600' : 'text-slate-900'}`}>
                        ₹{(c.pendingTotal ?? 0).toLocaleString('en-IN')}
                      </p>
                      <span className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ${isOverdue ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                        {isOverdue && <AlertTriangle className="w-3 h-3" />}
                        {c._count.outstandings} {c._count.outstandings === 1 ? (lang === 'hi' ? 'baaki' : 'due') : (lang === 'hi' ? 'baaki' : 'dues')}
                      </span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> {lang === 'hi' ? 'Clear' : 'Clear'}
                    </span>
                  )}
                </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <AddCustomerModal lang={lang} onClose={() => setShowAdd(false)} onSuccess={fetchCustomers} />
      )}
    </div>
  )
}

