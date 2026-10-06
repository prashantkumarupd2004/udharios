'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, Plus, Upload, X } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'

interface Customer {
  id: string
  name: string
  phone: string
  consent: boolean
  optedOut: boolean
  _count: { outstandings: number }
  createdAt: string
}

function AddCustomerModal({ onClose, onSuccess, lang }: { onClose: () => void; onSuccess: () => void; lang: string }) {
  const [form, setForm] = useState({ name: '', phone: '', notes: '', consent: false })
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
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error'); return }
      onSuccess()
      onClose()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl border border-orange-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold text-lg text-stone-900">👤 {lang === 'hi' ? 'Naya Customer' : 'New Customer'}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 p-2" aria-label="Close">
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
              <span className="bg-stone-100 border border-stone-200 border-r-0 rounded-l-xl px-3 flex items-center text-stone-500 text-sm font-semibold">+91</span>
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
                form.consent ? 'bg-green-600 border-green-600' : 'border-stone-300 bg-white'
              }`}>
                {form.consent && <span className="text-white text-xs font-bold">✓</span>}
              </div>
              <span className="text-sm text-stone-700 font-medium">
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

  const fetchCustomers = useCallback(async () => {
    const params = search ? `?search=${encodeURIComponent(search)}` : ''
    const res = await fetch(`/api/customers${params}`)
    const data = await res.json()
    setCustomers(data.customers ?? [])
    setLoading(false)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(fetchCustomers, 300)
    return () => clearTimeout(timer)
  }, [fetchCustomers])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">
            👥 {lang === 'hi' ? 'Customers' : 'Customers'}
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {customers.length} {lang === 'hi' ? 'kul customers' : 'total customers'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/customers/import" className="btn-ghost px-3 py-2.5 text-sm">
            <Upload className="w-4 h-4" /> {lang === 'hi' ? 'Import' : 'Import'}
          </Link>
          <button
            onClick={() => setShowAdd(true)}
            className="btn-primary px-4 py-2.5 text-sm"
            id="open-add-customer-btn"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} /> {lang === 'hi' ? 'Naya Customer' : 'Add Customer'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">
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

      {/* Customer list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-20" />)}
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16 glass-card">
          <div className="text-4xl mb-3">👤</div>
          <p className="text-stone-500 mb-4 font-medium">
            {search
              ? (lang === 'hi' ? 'Koi customer nahi mila' : 'No customers found')
              : (lang === 'hi' ? 'Abhi koi customer nahi hai' : 'No customers yet')}
          </p>
          {!search && (
            <button onClick={() => setShowAdd(true)} className="text-orange-600 font-semibold text-sm hover:underline">
              {lang === 'hi' ? 'Pehla customer add karein →' : 'Add your first customer →'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {customers.map(c => (
            <Link
              key={c.id}
              href={`/dashboard/customers/${c.id}`}
              className="glass-card card-hover p-4 flex items-center gap-3 group"
            >
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-base font-extrabold flex-shrink-0 ${
                c.optedOut ? 'bg-stone-200 text-stone-500' : 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25'
              }`}>
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-stone-900 group-hover:text-orange-700 transition-colors truncate">
                    {c.name}
                  </p>
                  {c.optedOut && (
                    <span className="text-[11px] font-semibold bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full border border-stone-200">
                      {lang === 'hi' ? 'Opt Out' : 'Opted Out'}
                    </span>
                  )}
                  {!c.consent && (
                    <span className="text-[11px] font-semibold bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                      {lang === 'hi' ? 'No Consent' : 'No Consent'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-stone-500 font-medium">
                  {c.phone.startsWith('tally-') ? '—' : c.phone.startsWith('+91') ? c.phone : `+91 ${c.phone}`}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                {c._count.outstandings > 0 ? (
                  <span className="text-xs font-bold bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">
                    {c._count.outstandings} {lang === 'hi' ? 'baaki' : 'outstanding'}
                  </span>
                ) : (
                  <span className="text-xs font-semibold bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full">
                    ✓ {lang === 'hi' ? 'Clear' : 'Clear'}
                  </span>
                )}
              </div>
              <span className="text-stone-300 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all font-bold">→</span>
            </Link>
          ))}
        </div>
      )}

      {showAdd && (
        <AddCustomerModal lang={lang} onClose={() => setShowAdd(false)} onSuccess={fetchCustomers} />
      )}
    </div>
  )
}
