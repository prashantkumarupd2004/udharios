'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/hooks/useLanguage'
import { formatINR, formatIndianDate, overdueDays } from '@/lib/date-utils'

type OutstandingStatus = 'upcoming' | 'overdue' | 'promised' | 'disputed' | 'paid' | 'written_off'

interface Outstanding {
  id: string
  invoiceNo: string | null
  amount: string
  dueDate: string
  status: OutstandingStatus
  customer: { id: string; name: string; phone: string }
  paymentLink: { url: string; status: string } | null
  _count: { promises: number; disputes: number }
}

function StatusBadge({ status, lang }: { status: OutstandingStatus; lang: string }) {
  const labels: Record<OutstandingStatus, { hi: string; en: string }> = {
    upcoming: { hi: 'Aane Wala', en: 'Upcoming' },
    overdue: { hi: 'Baaki', en: 'Overdue' },
    promised: { hi: 'Promise Mila', en: 'Promised' },
    disputed: { hi: 'Dispute', en: 'Disputed' },
    paid: { hi: 'Paid ✓', en: 'Paid ✓' },
    written_off: { hi: 'Write Off', en: 'Written Off' },
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border badge-${status}`}>
      {lang === 'hi' ? labels[status].hi : labels[status].en}
    </span>
  )
}

function AddOutstandingModal({
  onClose, onSuccess, lang,
}: { onClose: () => void; onSuccess: () => void; lang: string }) {
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string }[]>([])
  const [form, setForm] = useState({
    customerId: '',
    amount: '',
    dueDate: '',
    invoiceNo: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/customers?limit=100')
      .then(r => r.json())
      .then(d => setCustomers(d.customers ?? []))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/outstandings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error occurred')
        return
      }
      onSuccess()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="glass-card w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">
            {lang === 'hi' ? '➕ Naya Udhaar' : '➕ Add Outstanding'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-2">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              {lang === 'hi' ? 'Customer *' : 'Customer *'}
            </label>
            <select
              value={form.customerId}
              onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))}
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
              id="outstanding-customer-select"
            >
              <option value="">{lang === 'hi' ? 'Customer chuno' : 'Select customer'}</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {lang === 'hi' ? 'Amount (₹) *' : 'Amount (₹) *'}
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                required
                placeholder="5000"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                id="outstanding-amount-input"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {lang === 'hi' ? 'Due Date *' : 'Due Date *'}
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                id="outstanding-due-date-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              {lang === 'hi' ? 'Invoice Number' : 'Invoice Number'}
            </label>
            <input
              type="text"
              value={form.invoiceNo}
              onChange={e => setForm(p => ({ ...p, invoiceNo: e.target.value }))}
              placeholder="INV-001"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 bg-white/10 text-white py-3 rounded-xl font-medium">
              {lang === 'hi' ? 'Cancel' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white py-3 rounded-xl font-semibold"
              id="outstanding-submit-btn"
            >
              {loading ? '...' : (lang === 'hi' ? 'Add Karo' : 'Add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function OutstandingsPage() {
  const { lang } = useLanguage()
  const [outstandings, setOutstandings] = useState<Outstanding[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [creatingLink, setCreatingLink] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    const params = filter !== 'all' ? `?status=${filter}` : ''
    const res = await fetch(`/api/outstandings${params}`)
    const data = await res.json()
    setOutstandings(data.outstandings ?? [])
    setLoading(false)
  }, [filter])

  useEffect(() => { fetch_() }, [fetch_])

  const handleCreatePayLink = async (outstandingId: string) => {
    setCreatingLink(outstandingId)
    try {
      const res = await fetch('/api/payment-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outstandingId }),
      })
      const data = await res.json()
      if (res.ok) {
        await fetch_() // Refresh
        if (data.paymentLink?.url) {
          window.open(data.paymentLink.url, '_blank')
        }
      }
    } finally {
      setCreatingLink(null)
    }
  }

  const filters = [
    { key: 'all', hi: 'Sab', en: 'All' },
    { key: 'overdue', hi: 'Overdue', en: 'Overdue' },
    { key: 'upcoming', hi: 'Aane Wala', en: 'Upcoming' },
    { key: 'promised', hi: 'Promise', en: 'Promised' },
    { key: 'paid', hi: 'Paid', en: 'Paid' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          {lang === 'hi' ? '📋 Udhaari Ledger' : '📋 Outstandings Ledger'}
        </h1>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
          id="open-add-outstanding-btn"
        >
          + {lang === 'hi' ? 'Naya Udhaar' : 'New Outstanding'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              filter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {lang === 'hi' ? f.hi : f.en}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : outstandings.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-gray-500">
            {lang === 'hi' ? 'Koi entry nahi mili' : 'No entries found'}
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 text-indigo-400 text-sm hover:underline"
          >
            {lang === 'hi' ? 'Pehla udhaar add karein →' : 'Add your first outstanding →'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {outstandings.map(os => {
            const days = overdueDays(os.dueDate)
            const isOverdue = os.status === 'overdue'

            return (
              <div
                key={os.id}
                className={`glass-card p-4 hover:border-white/20 transition-all ${isOverdue ? 'overdue-pulse border-red-500/20' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Customer avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    isOverdue ? 'bg-red-500/20 text-red-400' : 'bg-indigo-500/20 text-indigo-400'
                  }`}>
                    {os.customer.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/dashboard/customers/${os.customer.id}`}
                        className="font-semibold text-white hover:text-indigo-300 transition-colors text-sm"
                      >
                        {os.customer.name}
                      </Link>
                      <StatusBadge status={os.status} lang={lang} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                      {os.invoiceNo && <span>#{os.invoiceNo}</span>}
                      <span>{formatIndianDate(os.dueDate)}</span>
                      {isOverdue && days > 0 && (
                        <span className="text-red-400 font-medium">
                          {days} {lang === 'hi' ? 'din overdue' : 'days overdue'}
                        </span>
                      )}
                      {os._count.promises > 0 && (
                        <span className="text-yellow-400">🤝 {os._count.promises}</span>
                      )}
                      {os._count.disputes > 0 && (
                        <span className="text-orange-400">⚡ {os._count.disputes}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold amount-display text-white">
                      {formatINR(parseFloat(os.amount))}
                    </p>
                    {!['paid', 'written_off'].includes(os.status) && (
                      <button
                        onClick={() => handleCreatePayLink(os.id)}
                        disabled={creatingLink === os.id}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
                      >
                        {creatingLink === os.id
                          ? '...'
                          : (os.paymentLink?.status === 'created'
                            ? (lang === 'hi' ? 'Link share karo' : 'Share link')
                            : (lang === 'hi' ? '💳 Pay link banao' : '💳 Create pay link')
                          )
                        }
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <AddOutstandingModal
          lang={lang}
          onClose={() => setShowAdd(false)}
          onSuccess={fetch_}
        />
      )}
    </div>
  )
}
