'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Ban, CheckCircle2, Phone, Mail,
  Users, IndianRupee, PhoneCall, MessageSquare, Clock, Plus,
  AlertTriangle, X,
} from 'lucide-react'

interface Detail {
  id: string
  businessName: string
  phone: string
  email: string | null
  plan: string
  isApproved: boolean
  isKillSwitched: boolean
  trialEndsAt: string | null
  createdAt: string
  users: { id: string; name: string; role: string }[]
  counts: { customers: number; outstandings: number; reminderLogs: number; calls: number; payments: number }
  pendingDues: number
  pendingDuesCount: number
  subscription: { plan: string; status: string; currentPeriodEnd: string | null } | null
}

export default function MerchantDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [detail, setDetail] = useState<Detail | null>(null)
  const [extras, setExtras] = useState<{ recentCalls: unknown[]; recentReminders: unknown[]; recentPayments: unknown[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [extendDays, setExtendDays] = useState('7')
  const [showExtend, setShowExtend] = useState(false)
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchJson(url: string, ms = 30000, init?: RequestInit) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), ms)
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      const data = await res.json().catch(() => ({}))
      return { res, data }
    } finally {
      clearTimeout(t)
    }
  }

  const load = useCallback(async () => {
    try {
      const { res, data } = await fetchJson(`/api/admin/merchants/${id}`)
      if (res.status === 401 || res.status === 403) { router.push('/admin/login'); return }
      if (data.ok) {
        setDetail(data.merchant)
        setExtras({ recentCalls: data.recentCalls, recentReminders: data.recentReminders, recentPayments: data.recentPayments })
      } else {
        setError('Merchant load nahi hua.')
      }
    } catch {
      setError('Network slow/fail — refresh karo.')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  async function toggleSuspend() {
    if (!detail || acting) return
    setActing(true)
    setConfirmSuspend(false)
    setError(null)
    const next = !detail.isKillSwitched
    // Optimistic
    setDetail(d => d ? { ...d, isKillSwitched: next } : d)
    try {
      const { res, data } = await fetchJson(`/api/admin/merchants/${id}/suspend`, 30000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspended: next, reason: `Admin action via panel` }),
      })
      if (res.status === 401 || res.status === 403) { router.push('/admin/login'); return }
      if (!data.ok) {
        setDetail(d => d ? { ...d, isKillSwitched: !next } : d)
        setError(`Suspend fail: ${data.error ?? 'server error'}`)
      }
    } catch {
      setDetail(d => d ? { ...d, isKillSwitched: !next } : d)
      setError('Network fail — suspend nahi hua.')
    } finally {
      setActing(false)
    }
  }

  async function extendTrial() {
    const days = parseInt(extendDays)
    if (!days || days < 1 || days > 90) { setError('1-90 din daalo'); return }
    if (acting) return
    setActing(true)
    setError(null)
    try {
      const { res, data } = await fetchJson(`/api/admin/merchants/${id}/extend-trial`, 30000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })
      if (res.status === 401 || res.status === 403) { router.push('/admin/login'); return }
      if (data.ok) {
        setShowExtend(false)
        await load()
      } else {
        setError(`Extend fail: ${data.error ?? 'server error'}`)
      }
    } catch {
      setError('Network fail — trial extend nahi hua.')
    } finally {
      setActing(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-[#0c0a09] flex items-center justify-center"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>
  }
  if (!detail) {
    return <div className="min-h-screen bg-[#0c0a09] text-white flex items-center justify-center">Merchant nahi mila.</div>
  }

  return (
    <div className="min-h-screen bg-[#0c0a09] text-white">
      <header className="border-b border-stone-800 bg-stone-950/80 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link href="/admin/merchants" className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="font-extrabold text-lg">{detail.businessName}</h1>
            <p className="text-stone-500 text-xs">{detail.phone}</p>
          </div>
          {detail.isKillSwitched
            ? <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-red-950 text-red-400 flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" /> Suspended</span>
            : <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-green-950 text-green-400 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-950/60 border border-red-800 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-red-200 text-sm font-medium flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {/* Actions */}
        <div className="bg-stone-900/70 border border-stone-800 rounded-2xl p-5">
          <h2 className="font-extrabold mb-4">Admin Actions</h2>
          <div className="flex flex-wrap gap-3">
            {confirmSuspend ? (
              <>
                <span className="text-sm font-bold text-stone-300 self-center">
                  {detail.isKillSwitched ? 'Unsuspend' : 'Suspend'} pakka?
                </span>
                <button onClick={toggleSuspend} disabled={acting}
                  className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 ${detail.isKillSwitched ? 'bg-green-700 hover:bg-green-600' : 'bg-red-700 hover:bg-red-600'}`}>
                  {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                  Haan, {detail.isKillSwitched ? 'Unsuspend' : 'Suspend'}
                </button>
                <button onClick={() => setConfirmSuspend(false)}
                  className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 font-bold text-sm">
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmSuspend(true)} disabled={acting}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 ${detail.isKillSwitched ? 'bg-green-700 hover:bg-green-600' : 'bg-red-700 hover:bg-red-600'}`}>
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                {detail.isKillSwitched ? 'Unsuspend karo' : 'Suspend karo'}
              </button>
            )}
            <button onClick={() => setShowExtend(!showExtend)}
              className="px-5 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 font-bold text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" /> Trial extend karo
            </button>
          </div>
          {showExtend && (
            <div className="mt-4 flex items-center gap-3">
              <input type="number" min={1} max={90} value={extendDays}
                onChange={e => setExtendDays(e.target.value)}
                className="w-24 bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-white" />
              <span className="text-stone-400 text-sm">din</span>
              <button onClick={extendTrial} disabled={acting}
                className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 font-bold text-sm flex items-center gap-1.5 disabled:opacity-50">
                <Plus className="w-4 h-4" /> Extend
              </button>
              {detail.trialEndsAt && (
                <span className="text-stone-500 text-xs">
                  Current trial end: {new Date(detail.trialEndsAt).toLocaleDateString('en-IN')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Info grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Users, label: 'CUSTOMERS', value: detail.counts.customers },
            { icon: IndianRupee, label: 'PENDING DUES', value: `₹${detail.pendingDues.toLocaleString('en-IN')}`, sub: `${detail.pendingDuesCount} bills` },
            { icon: MessageSquare, label: 'MESSAGES', value: detail.counts.reminderLogs },
            { icon: PhoneCall, label: 'CALLS', value: detail.counts.calls },
          ].map((s, i) => (
            <div key={i} className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4">
              <s.icon className="w-5 h-5 text-orange-400 mb-2" />
              <p className="text-2xl font-extrabold">{s.value}</p>
              <p className="text-stone-500 text-xs font-bold">{s.label}{s.sub ? ` • ${s.sub}` : ''}</p>
            </div>
          ))}
        </div>

        {/* Profile */}
        <div className="bg-stone-900/70 border border-stone-800 rounded-2xl p-5">
          <h2 className="font-extrabold mb-4">Profile</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <p className="flex items-center gap-2 text-stone-300"><Phone className="w-4 h-4 text-stone-500" /> {detail.phone}</p>
            <p className="flex items-center gap-2 text-stone-300"><Mail className="w-4 h-4 text-stone-500" /> {detail.email ?? '—'}</p>
            <p className="text-stone-400">Plan: <b className="text-white capitalize">{detail.plan}</b></p>
            <p className="text-stone-400">Approved: <b className={detail.isApproved ? 'text-green-400' : 'text-amber-400'}>{detail.isApproved ? 'Yes' : 'No'}</b></p>
            <p className="text-stone-400">Joined: <b className="text-white">{new Date(detail.createdAt).toLocaleDateString('en-IN')}</b></p>
            <p className="text-stone-400">Subscription: <b className="text-white">{detail.subscription ? `${detail.subscription.plan} (${detail.subscription.status})` : '—'}</b></p>
          </div>
        </div>

        {/* Recent activity */}
        {extras && (
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="bg-stone-900/70 border border-stone-800 rounded-2xl p-5">
              <h3 className="font-bold mb-3 text-sm">Recent Calls</h3>
              {(extras.recentCalls as { id: string; status: string; createdAt: string }[]).map(c => (
                <p key={c.id} className="text-xs text-stone-400 py-1.5 border-b border-stone-800/50 last:border-0">
                  {c.status} • {new Date(c.createdAt).toLocaleDateString('en-IN')}
                </p>
              ))}
              {(extras.recentCalls as unknown[]).length === 0 && <p className="text-stone-600 text-xs">No calls yet</p>}
            </div>
            <div className="bg-stone-900/70 border border-stone-800 rounded-2xl p-5">
              <h3 className="font-bold mb-3 text-sm">Recent Messages</h3>
              {(extras.recentReminders as { id: string; channel: string; status: string; sentAt: string }[]).map(r => (
                <p key={r.id} className="text-xs text-stone-400 py-1.5 border-b border-stone-800/50 last:border-0">
                  {r.channel} • {r.status} • {new Date(r.sentAt).toLocaleDateString('en-IN')}
                </p>
              ))}
              {(extras.recentReminders as unknown[]).length === 0 && <p className="text-stone-600 text-xs">No messages yet</p>}
            </div>
            <div className="bg-stone-900/70 border border-stone-800 rounded-2xl p-5">
              <h3 className="font-bold mb-3 text-sm">Recent Payments</h3>
              {(extras.recentPayments as { id: string; amount: number; paidAt: string }[]).map(p => (
                <p key={p.id} className="text-xs text-stone-400 py-1.5 border-b border-stone-800/50 last:border-0">
                  ₹{Number(p.amount).toLocaleString('en-IN')} • {new Date(p.paidAt).toLocaleDateString('en-IN')}
                </p>
              ))}
              {(extras.recentPayments as unknown[]).length === 0 && <p className="text-stone-600 text-xs">No payments yet</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
