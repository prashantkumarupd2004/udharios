'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, X, CreditCard, Handshake, Zap, Pause, Play, CalendarDays, Inbox } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { formatINR, formatIndianDate, overdueDays } from '@/lib/date-utils'

type OutstandingStatus = 'upcoming' | 'overdue' | 'promised' | 'disputed' | 'paid' | 'written_off'

interface Outstanding {
  id: string
  invoiceNo: string | null
  amount: string
  dueDate: string
  status: OutstandingStatus
  remindersPaused: boolean
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
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-slate-900">
            {lang === 'hi' ? 'Naya Udhaar' : 'Add Outstanding'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2" aria-label="Close">
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
  const [filter, setFilter] = useState('active')
  const [showAdd, setShowAdd] = useState(false)
  const [creatingLink, setCreatingLink] = useState<string | null>(null)
  const [pausing, setPausing] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    const params = filter !== 'active' ? `?status=${filter}` : '?status=active'
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

  const handleTogglePause = async (os: Outstanding) => {
    const willPause = !os.remindersPaused
    if (willPause) {
      const ok = window.confirm(
        lang === 'hi'
          ? `${os.customer.name} ke is udhaar ke saare auto reminders (WhatsApp/SMS/voice call) rokne hain?`
          : `Pause all auto reminders (WhatsApp/SMS/voice calls) for ${os.customer.name}?`
      )
      if (!ok) return
    }
    setPausing(os.id)
    try {
      const res = await fetch(`/api/outstandings/${os.id}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: willPause }),
      })
      if (res.ok) {
        setOutstandings(prev =>
          prev.map(o => (o.id === os.id ? { ...o, remindersPaused: willPause } : o))
        )
      }
    } finally {
      setPausing(null)
    }
  }

  const filters = [
    { key: 'active', hi: 'Active', en: 'Active' },
    { key: 'overdue', hi: 'Overdue', en: 'Overdue' },
    { key: 'upcoming', hi: 'Aane Wala', en: 'Upcoming' },
    { key: 'promised', hi: 'Promise', en: 'Promised' },
    { key: 'paid', hi: 'Paid', en: 'Paid' },
    { key: 'all', hi: 'Sab', en: 'All' },
  ]

  const totalFiltered = outstandings.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {lang === 'hi' ? 'Udhaari Ledger' : 'Outstandings Ledger'}
          </h1>
          {!loading && outstandings.length > 0 && (
            <p className="text-sm text-slate-500 mt-0.5">
              {outstandings.length} {lang === 'hi' ? 'entries' : 'entries'} • <span className="font-bold text-slate-800 amount-display">{formatINR(totalFiltered)}</span>
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
      <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-4">
        <p className="text-xs font-semibold text-slate-500 mb-2">
          {lang === 'hi' ? 'Quick Add — ek line likho, entry ban jayegi!' : 'Quick Add — type one line!'}
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
              // Naya customer — phone zaroori hai (API bina valid phone ke reject karta hai)
              let phone = parsed.phone
              if (!phone) {
                const entered = window.prompt(
                  lang === 'hi'
                    ? `"${parsed.name}" ka mobile number likho (10 digit):`
                    : `Enter mobile number for "${parsed.name}" (10 digits):`,
                  ''
                )
                if (entered === null) return // user ne cancel kiya
                phone = entered.replace(/\D/g, '').replace(/^91/, '')
                if (!/^[6-9]\d{9}$/.test(phone)) {
                  alert(lang === 'hi' ? 'Sahi 10-digit mobile number likho' : 'Please enter a valid 10-digit mobile number')
                  return
                }
              }
              const ncRes = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: parsed.name,
                  phone,
                  consent: true,
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
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400"
          />
          <button
            type="submit"
            className="btn-primary px-5 py-2.5 text-sm whitespace-nowrap"
          >
            {lang === 'hi' ? 'Add' : 'Add'}
          </button>
        </form>
        <p className="text-[11px] text-slate-400 mt-1.5">
          {lang === 'hi'
            ? 'Naam + amount likho — phone na diya to poocha jayega. Due date 7 din baad auto-set hogi.'
            : 'Type name + amount — phone optional (asked if skipped). Due date auto-set to 7 days.'}
        </p>
      </div>

      {/* Filter tabs — segmented control */}
      <div className="inline-flex max-w-full bg-slate-100 rounded-xl p-1 gap-0.5 overflow-x-auto">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              filter === f.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
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
        <div className="text-center py-16 bg-white border border-slate-200/80 rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">
            {lang === 'hi' ? 'Koi entry nahi mili' : 'No entries found'}
          </p>
          <button onClick={() => setShowAdd(true)} className="mt-4 text-green-600 font-semibold text-sm hover:underline">
            {lang === 'hi' ? 'Pehla udhaar add karein →' : 'Add your first outstanding →'}
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {outstandings.map(os => {
            const days = overdueDays(os.dueDate)
            const isOverdue = os.status === 'overdue'

            return (
              <div key={os.id} className="px-4 sm:px-5 py-4 hover:bg-slate-50/70 transition-colors">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {os.customer.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/dashboard/customers/${os.customer.id}`}
                        className="font-semibold text-slate-900 hover:text-green-700 transition-colors text-[15px]"
                      >
                        {os.customer.name}
                      </Link>
                      <StatusBadge status={os.status} lang={lang} />
                      {os.remindersPaused && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                          {lang === 'hi' ? 'Paused' : 'Paused'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 mt-1 text-xs text-slate-500 flex-wrap">
                      {os.invoiceNo && <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">#{os.invoiceNo}</span>}
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" /> {formatIndianDate(os.dueDate)}
                      </span>
                      {isOverdue && days > 0 && (
                        <span className="text-red-600 font-semibold">
                          · {days} {lang === 'hi' ? 'din overdue' : 'days overdue'}
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

                  <div className="text-right flex-shrink-0 flex flex-col items-end">
                    <p className={`text-[15px] font-bold amount-display ${isOverdue ? 'text-red-600' : 'text-slate-900'}`}>
                      {formatINR(parseFloat(os.amount))}
                    </p>
                    {!['paid', 'written_off'].includes(os.status) && (
                      <button
                        onClick={() => handleCreatePayLink(os.id)}
                        disabled={creatingLink === os.id}
                        className="text-xs font-semibold text-green-700 hover:text-green-800 transition-colors mt-1.5 inline-flex items-center gap-1"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        {creatingLink === os.id
                          ? '...'
                          : os.paymentLink?.status === 'created'
                            ? (lang === 'hi' ? 'Link share karo' : 'Share link')
                            : (lang === 'hi' ? 'Pay link banao' : 'Create pay link')}
                      </button>
                    )}
                    {!['paid', 'written_off'].includes(os.status) && (
                      <button
                        onClick={() => handleTogglePause(os)}
                        disabled={pausing === os.id}
                        className="text-xs font-semibold text-slate-500 hover:text-amber-700 transition-colors mt-1 inline-flex items-center gap-1"
                      >
                        {pausing === os.id
                          ? '...'
                          : os.remindersPaused
                            ? (<><Play className="w-3 h-3" />{lang === 'hi' ? 'Chalu karo' : 'Resume'}</>)
                            : (<><Pause className="w-3 h-3" />{lang === 'hi' ? 'Roko' : 'Pause'}</>)}
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
