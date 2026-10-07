'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Phone, Loader2, IndianRupee, FileText, CalendarCheck,
  MessageCircle, Bell, Clock, CheckCircle2, AlertTriangle, Wallet,
  TrendingUp, Receipt,
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

  useEffect(() => {
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
  }, [id])

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

      {/* ── Hero header ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-800 to-orange-950 p-6 text-white shadow-xl">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-orange-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-10 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center text-2xl font-extrabold shadow-lg shadow-orange-900/40 shrink-0">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight truncate">{customer.name}</h1>
              <p className="text-stone-300 text-sm flex items-center gap-1.5 mt-1">
                <Phone className="w-3.5 h-3.5" /> {phone}
              </p>
              <div className="flex gap-2 mt-2.5">
                {!customer.consent && (
                  <span className="text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 px-2.5 py-1 rounded-full">No Consent</span>
                )}
                {customer.optedOut && (
                  <span className="text-[11px] font-bold bg-stone-500/20 text-stone-300 border border-stone-500/30 px-2.5 py-1 rounded-full">Opted Out</span>
                )}
                {overdue.length > 0 && (
                  <span className="text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {overdue.length} overdue
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Pending hero number */}
          <div className="mt-5 flex items-end justify-between">
            <div>
              <p className="text-stone-400 text-xs font-semibold uppercase tracking-wider">kul baaki</p>
              <p className="text-4xl font-extrabold text-white tracking-tight">₹{totalPending.toLocaleString('en-IN')}</p>
            </div>
            <p className="text-stone-400 text-xs font-medium">{pending.length} outstanding • {customer.bills.length} bills</p>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2.5 mt-5">
            {hasPhone && (
              <>
                <a href={`tel:${customer.phone}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-white text-stone-900 font-bold text-sm px-4 py-3 rounded-2xl hover:bg-orange-50 transition-colors shadow">
                  <Phone className="w-4 h-4" /> Call
                </a>
                <a href={`https://wa.me/${customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste ${customer.name}, aapka ₹${totalPending.toLocaleString('en-IN')} ka payment baaki hai. Kripya jald bhugtan karein.`)}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-green-500 text-white font-bold text-sm px-4 py-3 rounded-2xl hover:bg-green-600 transition-colors shadow">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              </>
            )}
            <button
              className="flex-1 inline-flex items-center justify-center gap-2 bg-orange-500 text-white font-bold text-sm px-4 py-3 rounded-2xl hover:bg-orange-600 transition-colors shadow">
              <Bell className="w-4 h-4" /> Remind
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats strip ── */}
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
    </div>
  )
}
