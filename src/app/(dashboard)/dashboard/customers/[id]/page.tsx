'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Phone, Loader2, IndianRupee, FileText, CalendarCheck } from 'lucide-react'
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

interface Customer {
  id: string
  name: string
  phone: string
  consent: boolean
  optedOut: boolean
  notes: string | null
  outstandings: Outstanding[]
  bills: Bill[]
}

function fmtPhone(p: string) {
  // tally-xxx jaise placeholder phones ko +91 mat lagao
  if (!p || p.startsWith('tally-')) return '—'
  return p.startsWith('+91') ? p : `+91 ${p.replace(/^\+91/, '')}`
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

  return (
    <div className="space-y-5 max-w-3xl">
      <Link href="/dashboard/customers" className="inline-flex items-center gap-2 text-stone-500 hover:text-orange-600 font-medium text-sm">
        <ArrowLeft className="w-4 h-4" /> {lang === 'hi' ? 'Customers' : 'Customers'}
      </Link>

      {/* Header card */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center text-xl font-extrabold shadow-md shadow-orange-500/25">
            {customer.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-extrabold text-stone-900">{customer.name}</h1>
            <p className="text-stone-500 text-sm flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> {fmtPhone(customer.phone)}
            </p>
          </div>
          {!customer.consent && (
            <span className="text-[11px] font-semibold bg-red-50 text-red-700 px-2.5 py-1 rounded-full border border-red-200">No Consent</span>
          )}
        </div>
        <div className="mt-4 bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3">
          <IndianRupee className="w-5 h-5 text-red-500" />
          <div>
            <p className="text-2xl font-extrabold text-red-700">₹{totalPending.toLocaleString('en-IN')}</p>
            <p className="text-red-500 text-xs font-medium">kul baaki • {pending.length} outstanding</p>
          </div>
        </div>
      </div>

      {/* Outstandings */}
      <div className="glass-card p-5">
        <h2 className="font-extrabold text-stone-900 mb-3">Baaki hisaab ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-stone-500 text-sm">✓ Sab clear hai!</p>
        ) : (
          <div className="space-y-2.5">
            {pending.map(o => (
              <div key={o.id} className="flex items-center justify-between bg-stone-50 border border-stone-100 rounded-xl px-4 py-3">
                <div>
                  <p className="font-bold text-stone-900 text-sm">{o.invoiceNo ?? '—'}</p>
                  <p className="text-stone-500 text-xs">Due: {new Date(o.dueDate).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="text-right">
                  <p className="font-extrabold text-red-600">₹{Number(o.amount).toLocaleString('en-IN')}</p>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${o.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {o.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bills */}
      {customer.bills.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="font-extrabold text-stone-900 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-stone-400" /> Bills ({customer.bills.length})
          </h2>
          <div className="space-y-2.5">
            {customer.bills.map(b => (
              <div key={b.id} className="flex items-center justify-between bg-stone-50 border border-stone-100 rounded-xl px-4 py-3">
                <div>
                  <p className="font-bold text-stone-900 text-sm">Bill {b.billRef}</p>
                  <p className="text-stone-500 text-xs flex items-center gap-1">
                    <CalendarCheck className="w-3 h-3" /> {new Date(b.billDate).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-stone-900 text-sm">₹{Number(b.amount).toLocaleString('en-IN')}</p>
                  <p className="text-red-600 text-xs font-semibold">baaki ₹{Number(b.pendingAmount).toLocaleString('en-IN')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
