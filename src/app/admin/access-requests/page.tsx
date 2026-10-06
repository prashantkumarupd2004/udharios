'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ClipboardList,
  Check,
  X,
  Loader2,
  Phone,
  MapPin,
  Building2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'

interface AccessRequest {
  id: string
  name: string
  businessName: string
  phone: string
  email: string | null
  city: string | null
  businessType: string | null
  monthlyVolume: string | null
  message: string | null
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
}

type Tab = 'pending' | 'approved' | 'rejected' | 'all'

const TABS: Tab[] = ['pending', 'approved', 'rejected', 'all']

export default function AdminAccessRequestsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  async function load(status: Tab) {
    setLoading(true)
    setForbidden(false)
    try {
      const res = await fetch(`/api/admin/access-requests?status=${status}`)
      const data = await res.json()
      if (res.status === 403) {
        setForbidden(true)
        return
      }
      if (data.ok) {
        setRequests(data.requests)
        setCounts(data.counts ?? {})
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function act(id: string, action: 'approve' | 'reject') {
    const r = requests.find(x => x.id === id)
    const verb = action === 'approve' ? 'APPROVE' : 'REJECT'
    if (!r || !confirm(`${verb} access request from ${r.name} (${r.businessName}, ${r.phone})?`)) return
    setActing(id)
    try {
      const res = await fetch(`/api/admin/access-requests/${id}/${action}`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setRequests(prev => prev.filter(x => x.id !== id))
        setCounts(prev => ({
          ...prev,
          pending: Math.max(0, (prev.pending ?? 1) - 1),
          [action === 'approve' ? 'approved' : 'rejected']: (prev[action === 'approve' ? 'approved' : 'rejected'] ?? 0) + 1,
        }))
      } else {
        alert(`Failed: ${data.error ?? 'unknown'}`)
      }
    } finally {
      setActing(null)
    }
  }

  const volLabel: Record<string, string> = {
    under_1L: 'Under ₹1L/mo',
    '1L_5L': '₹1L–₹5L/mo',
    '5L_25L': '₹5L–₹25L/mo',
    above_25L: 'Above ₹25L/mo',
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-[#FDF9F1] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <ShieldAlert className="w-14 h-14 text-red-500 mx-auto mb-4" />
          <h1 className="font-display text-2xl font-extrabold text-stone-900 mb-2">Access denied</h1>
          <p className="text-stone-600 mb-6">
            Ye page sirf admin ke liye hai. Tumhara number admin list me nahi hai.
          </p>
          <Link href="/dashboard" className="btn-primary px-6 py-3">Dashboard wapas</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FDF9F1]">
      <header className="bg-white border-b border-orange-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/ugaahi-icon.png" alt="Ugaahi" className="w-9 h-9 rounded-xl object-cover" />
            <div>
              <h1 className="font-display font-extrabold text-stone-900 leading-none">Admin</h1>
              <p className="text-xs text-stone-500 mt-0.5">Access requests</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(tab)}
              className="p-2.5 rounded-xl border border-stone-200 text-stone-600 hover:border-orange-300 hover:text-orange-600 transition-all"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Link href="/dashboard" className="btn-ghost text-sm px-4 py-2.5">Dashboard</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                tab === t
                  ? 'bg-stone-900 text-white shadow-lg'
                  : 'bg-white border border-stone-200 text-stone-600 hover:border-orange-300'
              }`}
            >
              {t[0].toUpperCase() + t.slice(1)}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-md ${tab === t ? 'bg-white/20' : 'bg-stone-100'}`}>
                {counts[t] ?? (t === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : 0)}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-orange-100">
            <ClipboardList className="w-12 h-12 text-stone-300 mx-auto mb-4" />
            <p className="text-stone-500 font-medium">Koi {tab} requests nahi hain.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {requests.map(r => (
              <article key={r.id} className="bg-white rounded-2xl border border-orange-100 p-5 sm:p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-2">
                      <h3 className="font-bold text-stone-900 text-lg">{r.name}</h3>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                        r.status === 'pending'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : r.status === 'approved'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {r.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-stone-600 mb-3">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-stone-400" /> {r.businessName}
                      </span>
                      <a href={`tel:${r.phone}`} className="flex items-center gap-1.5 text-orange-700 font-semibold hover:underline">
                        <Phone className="w-4 h-4" /> {r.phone}
                      </a>
                      {r.city && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-stone-400" /> {r.city}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs mb-3">
                      {r.businessType && (
                        <span className="bg-stone-100 text-stone-600 px-2.5 py-1 rounded-lg font-medium capitalize">
                          {r.businessType}
                        </span>
                      )}
                      {r.monthlyVolume && (
                        <span className="bg-orange-50 text-orange-700 border border-orange-100 px-2.5 py-1 rounded-lg font-semibold">
                          {volLabel[r.monthlyVolume] ?? r.monthlyVolume}
                        </span>
                      )}
                      {r.email && <span className="text-stone-400">{r.email}</span>}
                    </div>
                    {r.message && (
                      <p className="text-sm text-stone-600 bg-stone-50 border border-stone-100 rounded-xl px-4 py-3 mb-2">
                        “{r.message}”
                      </p>
                    )}
                    <p className="text-xs text-stone-400">
                      {new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      {r.reviewedAt && r.status !== 'pending' && (
                        <> • reviewed {new Date(r.reviewedAt).toLocaleString('en-IN', { dateStyle: 'medium' })}</>
                      )}
                    </p>
                  </div>

                  {r.status === 'pending' && (
                    <div className="flex sm:flex-col gap-2.5 flex-shrink-0">
                      <button
                        onClick={() => act(r.id, 'approve')}
                        disabled={acting === r.id}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl transition-all disabled:opacity-60 text-sm"
                      >
                        {acting === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" strokeWidth={3} />}
                        Approve
                      </button>
                      <button
                        onClick={() => act(r.id, 'reject')}
                        disabled={acting === r.id}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold px-6 py-3 rounded-xl transition-all disabled:opacity-60 text-sm"
                      >
                        <X className="w-4 h-4" strokeWidth={3} />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
