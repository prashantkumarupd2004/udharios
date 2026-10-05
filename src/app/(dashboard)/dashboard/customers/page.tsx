'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="glass-card w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">👤 {lang === 'hi' ? 'Naya Customer' : 'New Customer'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-2">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">{lang === 'hi' ? 'Naam *' : 'Name *'}</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required placeholder="Ramesh Kumar"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              id="customer-name-input"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{lang === 'hi' ? 'Mobile *' : 'Mobile *'}</label>
            <div className="flex">
              <span className="bg-white/10 border border-white/10 border-r-0 rounded-l-xl px-3 flex items-center text-gray-400 text-sm">+91</span>
              <input
                type="tel" inputMode="numeric"
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                required placeholder="9876543210"
                className="flex-1 bg-white/5 border border-white/10 rounded-r-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                id="customer-phone-input"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{lang === 'hi' ? 'Notes' : 'Notes'}</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder={lang === 'hi' ? 'Optional notes...' : 'Optional notes...'}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Consent checkbox — MANDATORY */}
          <div
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              form.consent ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/5 border-red-500/20'
            }`}
            onClick={() => setForm(p => ({ ...p, consent: !p.consent }))}
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                form.consent ? 'bg-green-500 border-green-500' : 'border-gray-500'
              }`}>
                {form.consent && <span className="text-white text-xs">✓</span>}
              </div>
              <span className="text-sm text-gray-300">
                {lang === 'hi'
                  ? 'Customer ne WhatsApp reminders ke liye consent diya hai ✓'
                  : 'Customer has consented to receive WhatsApp reminders ✓'}
              </span>
            </label>
          </div>

          {error && <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 bg-white/10 text-white py-3 rounded-xl font-medium">
              {lang === 'hi' ? 'Cancel' : 'Cancel'}
            </button>
            <button
              type="submit" disabled={loading || !form.consent}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-700 text-white py-3 rounded-xl font-semibold"
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          {lang === 'hi' ? '👥 Customers' : '👥 Customers'}
        </h1>
        <div className="flex gap-2">
          <Link
            href="/dashboard/customers/import"
            className="bg-white/10 hover:bg-white/15 text-white px-3 py-2.5 rounded-xl text-sm font-medium transition-all border border-white/10"
          >
            📤 {lang === 'hi' ? 'Import' : 'Import'}
          </Link>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            id="open-add-customer-btn"
          >
            + {lang === 'hi' ? 'Naya Customer' : 'Add Customer'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={lang === 'hi' ? 'Naam ya number se search karein...' : 'Search by name or phone...'}
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          id="customer-search-input"
        />
      </div>

      {/* Customer list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">👤</div>
          <p className="text-gray-500 mb-4">
            {search
              ? (lang === 'hi' ? 'Koi customer nahi mila' : 'No customers found')
              : (lang === 'hi' ? 'Abhi koi customer nahi hai' : 'No customers yet')
            }
          </p>
          {!search && (
            <button onClick={() => setShowAdd(true)} className="text-indigo-400 text-sm hover:underline">
              {lang === 'hi' ? 'Pehla customer add karein →' : 'Add your first customer →'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map(c => (
            <Link
              key={c.id}
              href={`/dashboard/customers/${c.id}`}
              className="glass-card p-4 flex items-center gap-3 hover:border-indigo-500/30 transition-all group"
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                c.optedOut ? 'bg-gray-500/20 text-gray-500' : 'bg-indigo-500/20 text-indigo-400'
              }`}>
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-white group-hover:text-indigo-300 transition-colors truncate">
                    {c.name}
                  </p>
                  {c.optedOut && (
                    <span className="text-xs bg-gray-500/20 text-gray-500 px-1.5 py-0.5 rounded-full">
                      {lang === 'hi' ? 'Opt Out' : 'Opted Out'}
                    </span>
                  )}
                  {!c.consent && (
                    <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                      {lang === 'hi' ? 'No Consent' : 'No Consent'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{c.phone}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {c._count.outstandings > 0 && (
                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-full">
                    {c._count.outstandings} {lang === 'hi' ? 'baaki' : 'outstanding'}
                  </span>
                )}
              </div>
              <span className="text-gray-600 group-hover:text-gray-400 transition-colors">→</span>
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
