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

  const triggerCall = async (outstandingId: string) => {    if (!hasPhone) {
      setCallMsg('Pehle customer ka mobile number add karo')
      return
    }
    setCalling(outstandingId)
    setCallMsg('')
    try {
      const res = await fetch('/api/calls/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outstandingId }),
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
    <div className="space-y-5 max-w-3xl pb-8">
      <Link href="/dashboard/customers" className="inline-flex items-center gap-2 text-stone-500 hover:text-orange-600 font-medium text-sm">
        <ArrowLeft className="w-4 h-4" /> {lang === 'hi' ? 'Customers' : 'Customers'}
      </Link>

      {/* ── Hero header (Bharat Light theme) ── */}
      <div className="relative overflow-hidden rounded-3xl bg-white border border-orange-100 p-6 shadow-lg shadow-orange-100/50">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 via-white to-green-600" />
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-orange-100/60 rounded-full blur-3xl" />
        <div className="relative pt-1">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-2xl font-extrabold text-white shadow-lg shadow-orange-500/25 shrink-0">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight text-stone-900 truncate">{customer.name}</h1>
              <div className="flex items-center gap-1.5 mt-1">
                <p className="text-stone-500 text-sm flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> {phone}
                </p>
                <button
                  onClick={() => { setPhoneInput(customer.phone.startsWith('tally-') ? '' : customer.phone.replace('+91', '')); setPhoneError(''); setEditingPhone(true) }}
                  className="p-1.5 rounded-lg text-orange-600 hover:bg-orange-50 transition-colors"
                  title={hasPhone ? 'Number badlo' : 'Number add karo'}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              {!hasPhone && (
                <button
                  onClick={() => { setPhoneInput(''); setPhoneError(''); setEditingPhone(true) }}
                  className="mt-1.5 text-xs font-bold text-orange-600 hover:underline"
                >
                  + Mobile number add karo (WhatsApp/call ke liye)
                </button>
              )}
              <div className="flex gap-2 mt-2.5 flex-wrap">
                {!customer.consent && (
                  <span className="text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">No Consent</span>
                )}
                {customer.optedOut && (
                  <span className="text-[11px] font-bold bg-stone-100 text-stone-500 border border-stone-200 px-2.5 py-1 rounded-full">Opted Out</span>
                )}
                {overdue.length > 0 && (
                  <span className="text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {overdue.length} overdue
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Pending hero number */}
          <div className="mt-5 flex items-end justify-between bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-2xl px-5 py-4">
            <div>
              <p className="text-red-400 text-xs font-bold uppercase tracking-wider">kul baaki</p>
              <p className="text-4xl font-extrabold text-red-600 tracking-tight">₹{totalPending.toLocaleString('en-IN')}</p>
            </div>
            <p className="text-stone-500 text-xs font-medium">{pending.length} outstanding • {customer.bills.length} bills</p>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2.5 mt-4">
            {hasPhone && (
              <>
                <a href={`tel:${customer.phone}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-stone-900 text-white font-bold text-sm px-4 py-3 rounded-2xl hover:bg-stone-800 transition-colors shadow">
                  <Phone className="w-4 h-4" /> Call
                </a>
                <a href={`https://wa.me/${customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste ${customer.name}, aapka ₹${totalPending.toLocaleString('en-IN')} ka payment baaki hai. Kripya jald bhugtan karein.`)}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-green-600 text-white font-bold text-sm px-4 py-3 rounded-2xl hover:bg-green-700 transition-colors shadow">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              </>
            )}
            <button
              className="flex-1 inline-flex items-center justify-center gap-2 bg-orange-500 text-white font-bold text-sm px-4 py-3 rounded-2xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/25">
              <Bell className="w-4 h-4" /> Remind
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      {callMsg && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold border ${callMsg.startsWith('📞') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {callMsg}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-4 text-center">
          <Receipt className="w-4 h-4 text-stone-400 mx-auto mb-1.5" />
          <p className="text-lg font-extrabold text-stone-900">₹{totalBilled.toLocaleString('en-IN')}</p>
          <p className="text-stone-500 text-[11px] font-semibold uppercase tracking-wide">total billed</p>
        </div>
        <div className="glass-card p-4 text-center">
          <Wallet className="w-4 h-4 text-emerald-500 mx-auto mb-1.5" />
          <p className="text-lg font-extrabold text-emerald-600">₹{Math.max(0, collected).toLocaleString('en-IN')}</p>
          <p className="text-stone-500 text-[11px] font-semibold uppercase tracking-wide">collected</p>
        </div>
        <div className="glass-card p-4 text-center border-red-100">
          <TrendingUp className="w-4 h-4 text-red-500 mx-auto mb-1.5" />
          <p className="text-lg font-extrabold text-red-600">₹{totalPending.toLocaleString('en-IN')}</p>
          <p className="text-stone-500 text-[11px] font-semibold uppercase tracking-wide">pending</p>
        </div>
      </div>

      {/* ── Outstandings ── */}
      <section>
        <h2 className="font-extrabold text-stone-900 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-orange-500" /> Baaki hisaab
          <span className="text-xs font-bold bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <div className="glass-card p-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="text-stone-700 font-bold">Sab clear hai! 🎉</p>
            <p className="text-stone-500 text-sm">Is customer ka koi baaki nahi hai.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(o => {
              const od = daysOverdue(o.dueDate)
              const isOd = o.status === 'overdue' || od > 0
              return (
                <div key={o.id}
                  className={`glass-card p-4 flex items-center gap-4 border-l-4 ${isOd ? 'border-l-red-500' : 'border-l-amber-400'}`}>
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${isOd ? 'bg-red-100' : 'bg-amber-100'}`}>
                    <FileText className={`w-5 h-5 ${isOd ? 'text-red-600' : 'text-amber-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-stone-900">{o.invoiceNo ? `Bill ${o.invoiceNo}` : 'Outstanding'}</p>
                    <p className={`text-xs font-medium flex items-center gap-1 ${isOd ? 'text-red-600' : 'text-stone-500'}`}>
                      <CalendarCheck className="w-3 h-3" />
                      Due {new Date(o.dueDate).toLocaleDateString('en-IN')}
                      {od > 0 && <span className="font-bold">• {od} din overdue</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-lg font-extrabold ${isOd ? 'text-red-600' : 'text-stone-900'}`}>
                      ₹{Number(o.amount).toLocaleString('en-IN')}
                    </p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isOd ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {isOd ? 'overdue' : o.status}
                    </span>
                    {hasPhone && (
                      <button
                        onClick={() => triggerCall(o.id)}
                        disabled={calling === o.id}
                        className="mt-1.5 w-full inline-flex items-center justify-center gap-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors"
                      >
                        {calling === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3" />}
                        {calling === o.id ? 'Calling...' : 'Call karo'}
                      </button>
                    )}
                    <button
                      onClick={() => markPaid(o.id)}
                      disabled={markingPaid === o.id}
                      className="mt-1.5 w-full inline-flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors"
                    >
                      {markingPaid === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      {markingPaid === o.id ? 'Saving...' : 'Paid ✓'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Bills ── */}
      {customer.bills.length > 0 && (
        <section>
          <h2 className="font-extrabold text-stone-900 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-stone-400" /> Bills
            <span className="text-xs font-bold bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">{customer.bills.length}</span>
          </h2>
          <div className="glass-card divide-y divide-stone-100">
            {customer.bills.map(b => (
              <div key={b.id} className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="font-bold text-stone-900 text-sm">Bill {b.billRef}</p>
                  <p className="text-stone-500 text-xs">{new Date(b.billDate).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-stone-900 text-sm">₹{Number(b.amount).toLocaleString('en-IN')}</p>
                  {Number(b.pendingAmount) > 0 ? (
                    <p className="text-red-600 text-xs font-bold">baaki ₹{Number(b.pendingAmount).toLocaleString('en-IN')}</p>
                  ) : (
                    <p className="text-emerald-600 text-xs font-bold flex items-center gap-1 justify-end">
                      <CheckCircle2 className="w-3 h-3" /> paid
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
          <h2 className="font-extrabold text-stone-900 mb-3 flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-stone-400" /> Promises
            <span className="text-xs font-bold bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">{customer.promises.length}</span>
          </h2>
          <div className="space-y-2.5">
            {customer.promises.map(p => (
              <div key={p.id} className="glass-card px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-stone-900 text-sm">
                    {new Date(p.promisedDate).toLocaleDateString('en-IN')} ko dene ka wada
                  </p>
                  {p.notes && <p className="text-stone-500 text-xs mt-0.5">{p.notes}</p>}
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                  p.status === 'kept' ? 'bg-emerald-100 text-emerald-700' :
                  p.status === 'broken' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'
                }`}>{p.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {/* ── Phone edit modal ── */}
      {editingPhone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm" onClick={() => setEditingPhone(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-stone-900">
                {hasPhone ? 'Number badlo' : 'Mobile number add karo'}
              </h3>
              <button onClick={() => setEditingPhone(false)} className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-stone-500 mb-3">
              <span className="font-bold text-stone-700">{customer.name}</span> ka 10-digit mobile number daalo — WhatsApp reminders aur calls isi pe jayenge.
            </p>
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-stone-100 border border-stone-200 rounded-xl px-3 py-3 text-sm font-bold text-stone-600">+91</span>
              <input
                type="tel"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
                maxLength={10}
                autoFocus
                className="field !mb-0 tracking-widest text-lg font-bold"
              />
            </div>
            {phoneError && <p className="text-red-600 text-sm font-medium mb-3">{phoneError}</p>}
            <button
              onClick={savePhone}
              disabled={saving || phoneInput.length !== 10}
              className="btn-primary w-full py-3 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save karo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
