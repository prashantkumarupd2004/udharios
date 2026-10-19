'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Phone, Loader2, IndianRupee, FileText, CalendarCheck,
  Clock, CheckCircle2, AlertTriangle, Wallet,
  TrendingUp, Receipt, Pencil, X, History, Trash2,
} from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'

interface Outstanding {
  id: string
  invoiceNo: string | null
  amount: number
  dueDate: string
  status: string
  paidAt: string | null
  remindersPaused: boolean
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
  const [deleting, setDeleting] = useState(false)
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
  const [pausing, setPausing] = useState<string | null>(null)

  const handleDelete = async () => {
    const msg = lang === 'hi'
      ? `"${customer?.name}" ko DELETE karna hai?\n\nSARA data hat jayega:\n• Bills aur outstandings\n• Calls aur reminders\n• Promises aur disputes\n\nYe wapas nahi aayega!`
      : `Delete "${customer?.name}"?\n\nALL data will be removed:\n• Bills and outstandings\n• Calls and reminders\n• Promises and disputes\n\nThis cannot be undone!`
    if (!window.confirm(msg)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      window.location.href = '/dashboard/customers'
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete nahi ho paya')
      setDeleting(false)
    }
  }

  const togglePause = async (o: Outstanding) => {
    const willPause = !o.remindersPaused
    if (willPause) {
      const ok = window.confirm(
        lang === 'hi'
          ? 'Is udhaar ke saare auto reminders (WhatsApp/SMS/voice call) rokne hain?'
          : 'Pause all auto reminders (WhatsApp/SMS/voice calls) for this outstanding?'
      )
      if (!ok) return
    }
    setPausing(o.id)
    try {
      const res = await fetch(`/api/outstandings/${o.id}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: willPause }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCallMsg(data.error ?? 'Pause update nahi ho paya')
      } else {
        setCallMsg(willPause ? '⏸ Reminders rok diye gaye' : '▶ Reminders chalu ho gaye')
        setCustomer(c => c ? {
          ...c,
          outstandings: c.outstandings.map(x =>
            x.id === o.id ? { ...x, remindersPaused: willPause } : x
          ),
        } : c)
      }
    } catch {
      setCallMsg('Network error — dobara try karo')
    }
    setPausing(null)
  }

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
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 text-green-500 animate-spin" /></div>
  }
  if (notFound || !customer) {
    return (
      <div className="text-center py-24">
        <p className="text-slate-500 font-medium mb-4">Customer nahi mila.</p>
        <Link href="/dashboard/customers" className="text-green-600 font-semibold hover:underline">← Customers</Link>
      </div>
    )
  }

  const pending = customer.outstandings.filter(o => !['paid', 'written_off'].includes(o.status))
  const overdue = pending.filter(o => o.status === 'overdue')
  const paidHistory = customer.outstandings
    .filter(o => o.status === 'paid')
    .sort((a, b) => new Date(b.paidAt ?? b.dueDate).getTime() - new Date(a.paidAt ?? a.dueDate).getTime())
  const totalPaid = paidHistory.reduce((s, o) => s + Number(o.amount), 0)
  const totalBilled = customer.bills.reduce((s, b) => s + Number(b.amount), 0)
  const collected = totalBilled - totalPending
  const phone = fmtPhone(customer.phone)
  const hasPhone = phone !== '—'

  return (
    <div className="space-y-5 pb-8">
      <Link href="/dashboard/customers" className="inline-flex items-center gap-2 text-slate-500 hover:text-green-600 font-semibold text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" /> {lang === 'hi' ? 'Customers' : 'Customers'}
      </Link>

      {/* ── Compact Professional Hero ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-stone-900 via-stone-800 to-orange-950 shadow-lg">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-green-500 rounded-full blur-3xl" />
        </div>
        <div className="relative px-5 py-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-amber-500 flex items-center justify-center text-xl font-extrabold text-white shadow-md shadow-green-500/40 shrink-0">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-extrabold tracking-tight text-white truncate">{customer.name}</h1>
                {overdue.length > 0 && (
                  <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" /> {overdue.length} overdue
                  </span>
                )}
                {overdue.length === 0 && pending.length > 0 && (
                  <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full">On track</span>
                )}
                {!customer.consent && (
                  <span className="text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-400/30 px-2 py-0.5 rounded-full">No Consent</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-green-200/70 text-xs flex items-center gap-1 font-medium">
                  <Phone className="w-3 h-3" /> {phone}
                </p>
                <button
                  onClick={() => { setPhoneInput(customer.phone.startsWith('tally-') ? '' : customer.phone.replace('+91', '')); setPhoneError(''); setEditingPhone(true) }}
                  className="p-1 rounded-md text-green-300/70 hover:text-green-200 hover:bg-white/10 transition-colors"
                  title={hasPhone ? 'Number badlo' : 'Number add karo'}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-green-200/50 text-[10px] font-bold uppercase tracking-widest">Outstanding</p>
              <p className={`text-2xl font-extrabold tracking-tight ${totalPending > 0 ? 'text-white' : 'text-emerald-400'}`}>
                ₹{totalPending.toLocaleString('en-IN')}
              </p>
              <p className="text-green-200/50 text-[10px] font-medium mt-0.5">
                {pending.length} pending • {customer.bills.length} bills
              </p>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-red-300/80 hover:text-red-200 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {lang === 'hi' ? 'Delete customer' : 'Delete customer'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      {callMsg && (
        <div className={`rounded-2xl px-5 py-3.5 text-sm font-semibold border shadow-sm ${callMsg.startsWith('📞') || callMsg.startsWith('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {callMsg}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white rounded-2xl border border-slate-200/70 px-4 py-3.5 text-center shadow-sm">
          <p className="text-base font-extrabold text-slate-900 tracking-tight">₹{totalBilled.toLocaleString('en-IN')}</p>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">Total Billed</p>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200/60 px-4 py-3.5 text-center shadow-sm">
          <p className="text-base font-extrabold text-emerald-600 tracking-tight">₹{Math.max(0, collected).toLocaleString('en-IN')}</p>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">Collected</p>
        </div>
        <div className="bg-white rounded-2xl border border-red-200/60 px-4 py-3.5 text-center shadow-sm">
          <p className="text-base font-extrabold text-red-600 tracking-tight">₹{totalPending.toLocaleString('en-IN')}</p>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">Pending</p>
        </div>
      </div>

      {/* ── Outstandings ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <Clock className="w-4 h-4 text-green-600" />
            </div>
            Outstanding Payments
          </h2>
          <span className="text-xs font-bold bg-slate-900 text-white px-3 py-1 rounded-full">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200/70 p-8 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            </div>
            <p className="text-slate-900 font-extrabold">All clear! 🎉</p>
            <p className="text-slate-500 text-sm mt-1">Is customer ka koi outstanding nahi hai.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(o => {
              const od = daysOverdue(o.dueDate)
              const isOd = o.status === 'overdue' || od > 0
              return (
                <div key={o.id}
                  className={`bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-shadow ${isOd ? 'border-red-200/70' : 'border-slate-200/70'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isOd ? 'bg-red-50' : 'bg-amber-50'}`}>
                      <FileText className={`w-5 h-5 ${isOd ? 'text-red-600' : 'text-amber-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{o.invoiceNo ? `Invoice ${o.invoiceNo}` : 'Outstanding'}</p>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isOd ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isOd ? 'overdue' : o.status}
                        </span>
                        {o.remindersPaused && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300">
                            ⏸ {lang === 'hi' ? 'Paused' : 'Paused'}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs font-medium flex items-center gap-1.5 mt-1 ${isOd ? 'text-red-600' : 'text-slate-500'}`}>
                        <CalendarCheck className="w-3.5 h-3.5" />
                        Due {new Date(o.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {od > 0 && <span className="font-bold">• {od} days overdue</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-2xl font-extrabold tracking-tight ${isOd ? 'text-red-600' : 'text-slate-900'}`}>
                        ₹{Number(o.amount).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                    {hasPhone && (
                      <button
                        onClick={() => triggerCall(o.id)}
                        disabled={calling === o.id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-green-500 to-amber-500 hover:from-green-600 hover:to-amber-600 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-green-500/20"
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
                    <button
                      onClick={() => togglePause(o)}
                      disabled={pausing === o.id}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50 border ${
                        o.remindersPaused
                          ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                          : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                      }`}
                    >
                      {pausing === o.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : o.remindersPaused
                          ? (lang === 'hi' ? '▶ Chalu karo' : '▶ Resume')
                          : (lang === 'hi' ? '⏸ Roko' : '⏸ Pause')}
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <FileText className="w-4 h-4 text-slate-500" />
              </div>
              Bills
            </h2>
            <span className="text-xs font-bold bg-slate-900 text-white px-3 py-1 rounded-full">{customer.bills.length}</span>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/70 divide-y divide-stone-100 shadow-sm overflow-hidden">
            {customer.bills.map(b => {
              const total = Number(b.amount)
              const pending = Number(b.pendingAmount)
              const paid = Math.max(0, Math.round((total - pending) * 100) / 100)
              const paidPct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0
              const isPaid = pending <= 0
              const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`
              return (
              <div key={b.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">Bill {b.billRef}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{new Date(b.billDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-extrabold text-slate-900 text-sm">{fmt(total)}</p>
                  {isPaid ? (
                    <p className="text-emerald-600 text-xs font-bold flex items-center gap-1 justify-end mt-0.5">
                      <CheckCircle2 className="w-3 h-3" /> {lang === 'hi' ? 'Poora paid' : 'Fully paid'}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs mt-0.5">
                        <span className="text-emerald-600 font-bold">{fmt(paid)} {lang === 'hi' ? 'mil gaya' : 'paid'}</span>
                        <span className="text-slate-300 mx-1">•</span>
                        <span className="text-red-600 font-bold">{fmt(pending)} {lang === 'hi' ? 'baki' : 'due'}</span>
                      </p>
                      <div className="w-28 h-1 bg-slate-100 rounded-full mt-1.5 ml-auto overflow-hidden" title={`${paidPct}% paid`}>
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${paidPct}%` }} />
                      </div>
                    </>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Promises ── */}
      {customer.promises.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <CalendarCheck className="w-4 h-4 text-slate-500" />
              </div>
              Payment Promises
            </h2>
            <span className="text-xs font-bold bg-slate-900 text-white px-3 py-1 rounded-full">{customer.promises.length}</span>
          </div>
          <div className="space-y-2.5">
            {customer.promises.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200/70 px-5 py-4 flex items-center justify-between shadow-sm">
                <div>
                  <p className="font-bold text-slate-900 text-sm">
                    {new Date(p.promisedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} tak payment ka wada
                  </p>
                  {p.notes && <p className="text-slate-500 text-xs mt-1">{p.notes}</p>}
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

      {/* ── Transaction History (paid + pending timeline) ── */}
      {customer.outstandings.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <History className="w-4 h-4 text-slate-500" />
              </div>
              Transaction History
            </h2>
            <span className="text-xs font-bold bg-slate-900 text-white px-3 py-1 rounded-full">
              {customer.outstandings.length} records
            </span>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/25">
                <CheckCircle2 className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <p className="text-base font-extrabold text-emerald-700">₹{totalPaid.toLocaleString('en-IN')}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/70">Total Paid ({paidHistory.length})</p>
              </div>
            </div>
            <div className="bg-red-50/70 border border-red-200/60 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-500 flex items-center justify-center shrink-0 shadow-md shadow-red-500/25">
                <Clock className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <p className="text-base font-extrabold text-red-600">₹{totalPending.toLocaleString('en-IN')}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-500/70">Outstanding ({pending.length})</p>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
            <div className="divide-y divide-stone-100">
              {[...customer.outstandings]
                .sort((a, b) => {
                  const da = new Date(a.status === 'paid' ? (a.paidAt ?? a.dueDate) : a.dueDate).getTime()
                  const db = new Date(b.status === 'paid' ? (b.paidAt ?? b.dueDate) : b.dueDate).getTime()
                  return db - da
                })
                .map(o => {
                  const isPaid = o.status === 'paid'
                  const isOd = !isPaid && (o.status === 'overdue' || daysOverdue(o.dueDate) > 0)
                  const dateLabel = isPaid
                    ? (o.paidAt ? new Date(o.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
                    : new Date(o.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  return (
                    <div key={o.id} className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isPaid ? 'bg-emerald-100' : isOd ? 'bg-red-100' : 'bg-amber-100'
                      }`}>
                        {isPaid
                          ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
                          : <FileText className={`w-4.5 h-4.5 ${isOd ? 'text-red-600' : 'text-amber-600'}`} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {o.invoiceNo ? `Invoice ${o.invoiceNo}` : 'Outstanding'}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {isPaid ? `Paid on ${dateLabel}` : `Due ${dateLabel}`}
                          {isOd && !isPaid && daysOverdue(o.dueDate) > 0 && (
                            <span className="text-red-500 font-bold"> • {daysOverdue(o.dueDate)}d overdue</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-extrabold ${isPaid ? 'text-emerald-600' : isOd ? 'text-red-600' : 'text-slate-900'}`}>
                          {isPaid ? '+' : ''}₹{Number(o.amount).toLocaleString('en-IN')}
                        </p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isPaid ? 'bg-emerald-100 text-emerald-700'
                          : isOd ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                        }`}>
                          {isPaid ? 'paid' : isOd ? 'overdue' : o.status}
                        </span>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2.5 text-center">
            Poora hisaab — pehle kitna liya, kab pay kiya, ab kitna baaki hai
          </p>
        </section>
      )}
      {/* ── Phone edit modal ── */}
      {editingPhone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditingPhone(false)}>
          <div className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                {hasPhone ? 'Update Number' : 'Add Mobile Number'}
              </h3>
              <button onClick={() => setEditingPhone(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">
              <span className="font-bold text-slate-800">{customer.name}</span> ka 10-digit mobile number — WhatsApp reminders aur AI calls isi pe jayenge.
            </p>
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-600">+91</span>
              <input
                type="tel"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
                maxLength={10}
                autoFocus
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-lg font-bold tracking-widest text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all"
              />
            </div>
            {phoneError && <p className="text-red-600 text-sm font-medium mb-4">{phoneError}</p>}
            <button
              onClick={savePhone}
              disabled={saving || phoneInput.length !== 10}
              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-amber-500 hover:from-green-600 hover:to-amber-600 disabled:opacity-50 text-white font-bold text-sm py-3.5 rounded-2xl shadow-lg shadow-green-500/25 transition-all"
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
