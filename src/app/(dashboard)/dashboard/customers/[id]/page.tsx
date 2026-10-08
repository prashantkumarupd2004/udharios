'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Phone, Loader2, IndianRupee, FileText, CalendarCheck,
  MessageCircle, Bell, Clock, CheckCircle2, AlertTriangle, Wallet,
  TrendingUp, Receipt, Pencil, X,
} from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'

interface Outstanding {
  id: string
  invoiceNo: string | null
  amount: number
  dueDate: string
  status: string
  paidAt: string | null
}

interface Bill {
  id: string
  billRef: string
  amount: number
  pendingAmount: number
  billDate: string
  dueDate: string | null
}

interface PromiseItem {
  id: string
  promisedDate: string
  status: string
  createdAt: string
  notes: string | null
}

interface Customer {
  id: string
  name: string
  phone: string
  consent: boolean
  optedOut: boolean
  notes: string | null
  outstandings: Outstanding[]
  bills: Bill[]
  promises: PromiseItem[]
}

function fmtPhone(p: string) {
  if (!p || p.startsWith('tally-')) return '—'
  return p.startsWith('+91') ? p : `+91 ${p.replace(/^\+91/, '')}`
}

function daysOverdue(dueDate: string) {
  const diff = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000)
  return diff > 0 ? diff : 0
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { lang } = useLanguage()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [totalPending, setTotalPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [calling, setCalling] = useState<string | null>(null)
  const [callMsg, setCallMsg] = useState('')

  const loadCustomer = () => {
    setLoading(true)
    fetch(`/api/customers/${id}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      })
      .then(data => {
        if (data?.customer) {
          setCustomer(data.customer)
          setTotalPending(Number(data.totalPending ?? 0))
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(loadCustomer, [id])

  const savePhone = async () => {
    setSaving(true)
    setPhoneError('')
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPhoneError(data.error ?? 'Save nahi ho paya')
        setSaving(false)
        return
      }
      setEditingPhone(false)
      loadCustomer()
    } catch {
      setPhoneError('Network error')
    }
    setSaving(false)
  }

  const [markingPaid, setMarkingPaid] = useState<string | null>(null)

  const markPaid = async (outstandingId: string) => {
    const method = window.prompt('Payment kaise mila? (cash / upi / bank_transfer)', 'cash')
    if (method === null) return // cancel
    if (!['cash', 'upi', 'bank_transfer', 'other'].includes(method.trim())) {
      setCallMsg('Method cash, upi, bank_transfer ya other me se likho')
      return
    }
    setMarkingPaid(outstandingId)
    try {
      const res = await fetch(`/api/outstandings/${outstandingId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: method.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCallMsg(data.error ?? 'Paid mark nahi ho paya')
      } else {
        setCallMsg('✅ Payment received mark ho gaya!')
        // list refresh karo
        setCustomer(c => c ? {
          ...c,
          outstandings: c.outstandings.map(o =>
            o.id === outstandingId ? { ...o, status: 'paid' as const } : o
          ),
        } : c)
      }
    } catch {
      setCallMsg('Network error — dobara try karo')
    }
    setMarkingPaid(null)
  }

  const triggerCall = async (outstandingId: string, testMode = false) => {    if (!hasPhone) {
      setCallMsg('Pehle customer ka mobile number add karo')
      return
    }
    setCalling(outstandingId)
    setCallMsg('')
    try {
      const res = await fetch('/api/calls/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outstandingId, skipQuietHours: testMode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCallMsg(data.error ?? 'Call start nahi ho payi')
      } else {
        setCallMsg('📞 Call shuru ho gayi! Customer ko AI reminder call jayegi.')
      }
    } catch {
      setCallMsg('Network error — dobara try karo')
    }
    setCalling(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>
  }
  if (notFound || !customer) {
    return (
      <div className="text-center py-24">
        <p className="text-stone-500 font-medium mb-4">Customer nahi mila.</p>
        <Link href="/dashboard/customers" className="text-orange-600 font-semibold hover:underline">← Customers</Link>
      </div>
    )
  }

  const pending = customer.outstandings.filter(o => !['paid', 'written_off'].includes(o.status))
  const overdue = pending.filter(o => o.status === 'overdue')
  const totalBilled = customer.bills.reduce((s, b) => s + Number(b.amount), 0)
  const collected = totalBilled - totalPending
  const phone = fmtPhone(customer.phone)
  const hasPhone = phone !== '—'

  return (
    <div className="space-y-5 max-w-4xl pb-8">
      <Link href="/dashboard/customers" className="inline-flex items-center gap-2 text-stone-500 hover:text-orange-600 font-semibold text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" /> {lang === 'hi' ? 'Customers' : 'Customers'}
      </Link>

      {/* ── Professional Hero ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-800 to-orange-950 p-7 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-orange-500 rounded-full blur-3xl" />
        </div>
        <div className="relative">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-2xl font-extrabold text-white shadow-lg shadow-orange-500/40 shrink-0">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight text-white truncate">{customer.name}</h1>
              <div className="flex items-center gap-1.5 mt-1.5">
                <p className="text-orange-200/80 text-sm flex items-center gap-1.5 font-medium">
                  <Phone className="w-3.5 h-3.5" /> {phone}
                </p>
                <button
                  onClick={() => { setPhoneInput(customer.phone.startsWith('tally-') ? '' : customer.phone.replace('+91', '')); setPhoneError(''); setEditingPhone(true) }}
                  className="p-1.5 rounded-lg text-orange-300 hover:bg-white/10 transition-colors"
                  title={hasPhone ? 'Number badlo' : 'Number add karo'}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              {!hasPhone && (
                <button
                  onClick={() => { setPhoneInput(''); setPhoneError(''); setEditingPhone(true) }}
                  className="mt-1.5 text-xs font-bold text-orange-300 hover:text-orange-200 hover:underline"
                >
                  + Mobile number add karo (WhatsApp/call ke liye)
                </button>
              )}
              <div className="flex gap-2 mt-3 flex-wrap">
                {!customer.consent && (
                  <span className="text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-400/30 px-2.5 py-1 rounded-full">No Consent</span>
                )}
                {customer.optedOut && (
                  <span className="text-[11px] font-bold bg-white/10 text-stone-300 border border-white/15 px-2.5 py-1 rounded-full">Opted Out</span>
                )}
                {overdue.length > 0 && (
                  <span className="text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {overdue.length} overdue
                  </span>
                )}
                {overdue.length === 0 && pending.length > 0 && (
                  <span className="text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> On track
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Pending amount */}
          <div className="mt-6 flex items-end justify-between bg-white/[0.07] backdrop-blur border border-white/10 rounded-2xl px-6 py-5">
            <div>
              <p className="text-orange-200/60 text-xs font-bold uppercase tracking-widest">Total Outstanding</p>
              <p className="text-4xl font-extrabold text-white tracking-tight mt-1">₹{totalPending.toLocaleString('en-IN')}</p>
            </div>
            <div className="text-right">
              <p className="text-white/90 text-sm font-bold">{pending.length} pending</p>
              <p className="text-orange-200/60 text-xs font-medium">{customer.bills.length} bills total</p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2.5 mt-4">
            {hasPhone && (
              <>
                <a href={`tel:${customer.phone}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-sm px-4 py-3 rounded-2xl transition-all">
                  <Phone className="w-4 h-4" /> Call
                </a>
                <a href={`https://wa.me/${customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste ${customer.name}, aapka ₹${totalPending.toLocaleString('en-IN')} ka payment baaki hai. Kripya jald bhugtan karein.`)}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-4 py-3 rounded-2xl transition-all shadow-lg shadow-emerald-900/30">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              </>
            )}
            <button
              className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-sm px-4 py-3 rounded-2xl transition-all shadow-lg shadow-orange-900/40">
              <Bell className="w-4 h-4" /> Remind
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      {callMsg && (
        <div className={`rounded-2xl px-5 py-3.5 text-sm font-semibold border shadow-sm ${callMsg.startsWith('📞') || callMsg.startsWith('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {callMsg}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-stone-200/70 p-5 text-center shadow-sm hover:shadow-md transition-shadow">
          <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center mx-auto mb-2">
            <Receipt className="w-4 h-4 text-stone-500" />
          </div>
          <p className="text-xl font-extrabold text-stone-900 tracking-tight">₹{totalBilled.toLocaleString('en-IN')}</p>
          <p className="text-stone-400 text-[11px] font-bold uppercase tracking-widest mt-1">Total Billed</p>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200/60 p-5 text-center shadow-sm hover:shadow-md transition-shadow">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-2">
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-extrabold text-emerald-600 tracking-tight">₹{Math.max(0, collected).toLocaleString('en-IN')}</p>
          <p className="text-stone-400 text-[11px] font-bold uppercase tracking-widest mt-1">Collected</p>
        </div>
        <div className="bg-white rounded-2xl border border-red-200/60 p-5 text-center shadow-sm hover:shadow-md transition-shadow">
          <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-xl font-extrabold text-red-600 tracking-tight">₹{totalPending.toLocaleString('en-IN')}</p>
          <p className="text-stone-400 text-[11px] font-bold uppercase tracking-widest mt-1">Pending</p>
        </div>
      </div>

      {/* ── Outstandings ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-extrabold text-stone-900 tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
              <Clock className="w-4 h-4 text-orange-600" />
            </div>
            Outstanding Payments
          </h2>
          <span className="text-xs font-bold bg-stone-900 text-white px-3 py-1 rounded-full">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className="bg-white rounded-3xl border border-stone-200/70 p-8 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            </div>
            <p className="text-stone-900 font-extrabold">All clear! 🎉</p>
            <p className="text-stone-500 text-sm mt-1">Is customer ka koi outstanding nahi hai.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(o => {
              const od = daysOverdue(o.dueDate)
              const isOd = o.status === 'overdue' || od > 0
              return (
                <div key={o.id}
                  className={`bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-shadow ${isOd ? 'border-red-200/70' : 'border-stone-200/70'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isOd ? 'bg-red-50' : 'bg-amber-50'}`}>
                      <FileText className={`w-5 h-5 ${isOd ? 'text-red-600' : 'text-amber-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-stone-900">{o.invoiceNo ? `Invoice ${o.invoiceNo}` : 'Outstanding'}</p>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isOd ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isOd ? 'overdue' : o.status}
                        </span>
                      </div>
                      <p className={`text-xs font-medium flex items-center gap-1.5 mt-1 ${isOd ? 'text-red-600' : 'text-stone-500'}`}>
                        <CalendarCheck className="w-3.5 h-3.5" />
                        Due {new Date(o.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {od > 0 && <span className="font-bold">• {od} days overdue</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-2xl font-extrabold tracking-tight ${isOd ? 'text-red-600' : 'text-stone-900'}`}>
                        ₹{Number(o.amount).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 pt-4 border-t border-stone-100">
                    {hasPhone && (
                      <button
                        onClick={() => triggerCall(o.id)}
                        disabled={calling === o.id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-orange-500/20"
                      >
                        {calling === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
                        {calling === o.id ? 'Calling...' : 'AI Call'}
                      </button>
                    )}
                    <button
                      onClick={() => markPaid(o.id)}
                      disabled={markingPaid === o.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-600/20"
                    >
                      {markingPaid === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      {markingPaid === o.id ? 'Saving...' : 'Mark Paid'}
                    </button>
                  </div>
                  {hasPhone && (
                    <button
                      onClick={() => triggerCall(o.id, true)}
                      disabled={calling === o.id}
                      className="mt-2 w-full text-center text-[11px] font-semibold text-stone-400 hover:text-stone-600 transition-colors"
                    >
                      🧪 Test call (bypass quiet hours)
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Bills ── */}
      {customer.bills.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-extrabold text-stone-900 tracking-tight flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
                <FileText className="w-4 h-4 text-stone-500" />
              </div>
              Bills
            </h2>
            <span className="text-xs font-bold bg-stone-900 text-white px-3 py-1 rounded-full">{customer.bills.length}</span>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200/70 divide-y divide-stone-100 shadow-sm overflow-hidden">
            {customer.bills.map(b => (
              <div key={b.id} className="flex items-center justify-between px-5 py-4 hover:bg-stone-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-stone-500" />
                  </div>
                  <div>
                    <p className="font-bold text-stone-900 text-sm">Bill {b.billRef}</p>
                    <p className="text-stone-400 text-xs mt-0.5">{new Date(b.billDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-extrabold text-stone-900 text-sm">₹{Number(b.amount).toLocaleString('en-IN')}</p>
                  {Number(b.pendingAmount) > 0 ? (
                    <p className="text-red-600 text-xs font-bold mt-0.5">₹{Number(b.pendingAmount).toLocaleString('en-IN')} pending</p>
                  ) : (
                    <p className="text-emerald-600 text-xs font-bold flex items-center gap-1 justify-end mt-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Paid
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Promises ── */}
      {customer.promises.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-extrabold text-stone-900 tracking-tight flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
                <CalendarCheck className="w-4 h-4 text-stone-500" />
              </div>
              Payment Promises
            </h2>
            <span className="text-xs font-bold bg-stone-900 text-white px-3 py-1 rounded-full">{customer.promises.length}</span>
          </div>
          <div className="space-y-2.5">
            {customer.promises.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-stone-200/70 px-5 py-4 flex items-center justify-between shadow-sm">
                <div>
                  <p className="font-bold text-stone-900 text-sm">
                    {new Date(p.promisedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} tak payment ka wada
                  </p>
                  {p.notes && <p className="text-stone-500 text-xs mt-1">{p.notes}</p>}
                </div>
                <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${
                  p.status === 'kept' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  p.status === 'broken' ? 'bg-red-50 text-red-700 border-red-200' :
                  'bg-amber-50 text-amber-700 border-amber-200'
                }`}>{p.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {/* ── Phone edit modal ── */}
      {editingPhone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm" onClick={() => setEditingPhone(false)}>
          <div className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-stone-900 tracking-tight">
                {hasPhone ? 'Update Number' : 'Add Mobile Number'}
              </h3>
              <button onClick={() => setEditingPhone(false)} className="p-2 rounded-xl text-stone-400 hover:bg-stone-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-stone-500 mb-4 leading-relaxed">
              <span className="font-bold text-stone-800">{customer.name}</span> ka 10-digit mobile number — WhatsApp reminders aur AI calls isi pe jayenge.
            </p>
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-stone-100 border border-stone-200 rounded-xl px-4 py-3.5 text-sm font-bold text-stone-600">+91</span>
              <input
                type="tel"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
                maxLength={10}
                autoFocus
                className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3.5 text-lg font-bold tracking-widest text-stone-900 placeholder:text-stone-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
              />
            </div>
            {phoneError && <p className="text-red-600 text-sm font-medium mb-4">{phoneError}</p>}
            <button
              onClick={savePhone}
              disabled={saving || phoneInput.length !== 10}
              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-white font-bold text-sm py-3.5 rounded-2xl shadow-lg shadow-orange-500/25 transition-all"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Number'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
