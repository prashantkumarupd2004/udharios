'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, X, CreditCard, Handshake, Zap } from 'lucide-react'
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
    overdue: { hi: 'Overdue', en: 'Overdue' },
    promised: { hi: 'Promise Mila', en: 'Promised' },
    disputed: { hi: 'Dispute', en: 'Disputed' },
    paid: { hi: 'Paid ✓', en: 'Paid ✓' },
    written_off: { hi: 'Write Off', en: 'Written Off' },
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border badge-${status}`}>
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
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
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
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl border border-orange-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold text-lg text-stone-900">
            ➕ {lang === 'hi' ? 'Naya Udhaar' : 'Add Outstanding'}
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 p-2" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">{lang === 'hi' ? 'Customer *' : 'Customer *'}</label>
            <select
              value={form.customerId}
              onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))}
              required
              className="field"
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
              <label className="field-label">{lang === 'hi' ? 'Amount (₹) *' : 'Amount (₹) *'}</label>
              <input
                type="number" min="1" step="0.01"
                value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                required placeholder="5000"
                className="field"
                id="outstanding-amount-input"
              />
            </div>
            <div>
              <label className="field-label">{lang === 'hi' ? 'Due Date *' : 'Due Date *'}</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                required
                className="field"
                id="outstanding-due-date-input"
              />
            </div>
          </div>

          <div>
            <label className="field-label">{lang === 'hi' ? 'Invoice Number' : 'Invoice Number'}</label>
            <input
              type="text"
              value={form.invoiceNo}
              onChange={e => setForm(p => ({ ...p, invoiceNo: e.target.value }))}
              placeholder="INV-001"
              className="field"
            />
          </div>

          {error && <p className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 py-3">
              {lang === 'hi' ? 'Cancel' : 'Cancel'}
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 py-3" id="outstanding-submit-btn">
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
        await fetch_()
        if (data.paymentLink?.url) window.open(data.paymentLink.url, '_blank')
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

  const totalFiltered = outstandings.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">
            📋 {lang === 'hi' ? 'Udhaari Ledger' : 'Outstandings Ledger'}
          </h1>
          {!loading && outstandings.length > 0 && (
            <p className="text-sm text-stone-500 mt-0.5">
              {outstandings.length} {lang === 'hi' ? 'entries' : 'entries'} • <span className="font-bold text-stone-800 amount-display">{formatINR(totalFiltered)}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="btn-primary px-4 py-2.5 text-sm flex-shrink-0"
          id="open-add-outstanding-btn"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} /> {lang === 'hi' ? 'Naya Udhaar' : 'New Outstanding'}
        </button>
      </div>

      {/* Quick Add — ek line me entry (chhote dukaandaar ke liye) */}
      <div className="glass-card p-4 border-2 border-dashed border-orange-200">
        <p className="text-xs font-bold text-stone-500 mb-2">
          ⚡ {lang === 'hi' ? 'Quick Add — ek line likho, entry ban jayegi!' : 'Quick Add — type one line!'}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const input = (e.target as HTMLFormElement).quickAdd.value.trim()
            if (!input) return
            const { parseQuickAdd } = await import('@/lib/quick-add')
            const parsed = parseQuickAdd(input)
            if ('error' in parsed) {
              alert(parsed.error)
              return
            }
            // Pehle customer dhundo ya banao
            let customerId = ''
            const cRes = await fetch(`/api/customers?search=${encodeURIComponent(parsed.name)}&limit=5`)
            const cData = await cRes.json()
            const existing = (cData.customers ?? []).find((c: { name: string }) =>
              c.name.toLowerCase() === parsed.name.toLowerCase()
            )
            if (existing) {
              customerId = existing.id
            } else {
              const ncRes = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: parsed.name,
                  phone: parsed.phone ?? `quick-${Date.now()}`,
                }),
              })
              const ncData = await ncRes.json()
              if (!ncRes.ok) {
                alert(ncData.error ?? 'Customer nahi ban paya')
                return
              }
              customerId = ncData.customer?.id ?? ncData.id
            }
            // Outstanding banao
            const oRes = await fetch('/api/outstandings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerId,
                amount: parsed.amount,
                dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                notes: `Quick Add: "${input}"`,
              }),
            })
            if (!oRes.ok) {
              const oData = await oRes.json()
              alert(oData.error ?? 'Entry nahi ban payi')
              return
            }
            ;(e.target as HTMLFormElement).quickAdd.value = ''
            await fetch_()
          }}
          className="flex gap-2"
        >
          <input
            name="quickAdd"
            placeholder={lang === 'hi' ? 'Jaise: Ramesh 5000 9876543210' : 'E.g.: Ramesh 5000 9876543210'}
            className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
          />
          <button
            type="submit"
            className="btn-primary px-5 py-2.5 text-sm whitespace-nowrap"
          >
            ➕ {lang === 'hi' ? 'Add' : 'Add'}
          </button>
        </form>
        <p className="text-[11px] text-stone-400 mt-1.5">
          {lang === 'hi'
            ? 'Naam + amount likho — phone optional hai. Due date 7 din baad auto-set hogi.'
            : 'Type name + amount — phone optional. Due date auto-set to 7 days.'}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all border ${
              filter === f.key
                ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/30'
                : 'bg-white text-stone-600 border-stone-200 hover:border-orange-300 hover:text-orange-700'
            }`}
          >
            {lang === 'hi' ? f.hi : f.en}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28" />)}
        </div>
      ) : outstandings.length === 0 ? (
        <div className="text-center py-16 glass-card">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-stone-500 font-medium">
            {lang === 'hi' ? 'Koi entry nahi mili' : 'No entries found'}
          </p>
          <button onClick={() => setShowAdd(true)} className="mt-4 text-orange-600 font-semibold text-sm hover:underline">
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
                className={`glass-card card-hover p-4 ${isOverdue ? 'overdue-pulse !border-red-200' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-base font-extrabold flex-shrink-0 ${
                    isOverdue
                      ? 'bg-red-500 text-white shadow-md shadow-red-500/25'
                      : os.status === 'paid'
                        ? 'bg-green-500 text-white shadow-md shadow-green-500/25'
                        : 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25'
                  }`}>
                    {os.customer.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/dashboard/customers/${os.customer.id}`}
                        className="font-bold text-stone-900 hover:text-orange-700 transition-colors text-sm"
                      >
                        {os.customer.name}
                      </Link>
                      <StatusBadge status={os.status} lang={lang} />
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-stone-500 flex-wrap font-medium">
                      {os.invoiceNo && <span className="bg-stone-100 px-1.5 py-0.5 rounded">#{os.invoiceNo}</span>}
                      <span>📅 {formatIndianDate(os.dueDate)}</span>
                      {isOverdue && days > 0 && (
                        <span className="text-red-700 font-bold bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                          {days} {lang === 'hi' ? 'din overdue' : 'days overdue'}
                        </span>
                      )}
                      {os._count.promises > 0 && (
                        <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
                          <Handshake className="w-3 h-3" /> {os._count.promises}
                        </span>
                      )}
                      {os._count.disputes > 0 && (
                        <span className="text-orange-700 font-semibold inline-flex items-center gap-1">
                          <Zap className="w-3 h-3" /> {os._count.disputes}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold amount-display text-stone-900">
                      {formatINR(parseFloat(os.amount))}
                    </p>
                    {!['paid', 'written_off'].includes(os.status) && (
                      <button
                        onClick={() => handleCreatePayLink(os.id)}
                        disabled={creatingLink === os.id}
                        className="text-xs font-bold text-orange-600 hover:text-orange-700 transition-colors mt-1 inline-flex items-center gap-1"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        {creatingLink === os.id
                          ? '...'
                          : os.paymentLink?.status === 'created'
                            ? (lang === 'hi' ? 'Link share karo' : 'Share link')
                            : (lang === 'hi' ? 'Pay link banao' : 'Create pay link')}
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
        <AddOutstandingModal lang={lang} onClose={() => setShowAdd(false)} onSuccess={fetch_} />
      )}
    </div>
  )
}
