'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Users, CreditCard, PhoneCall, MessageSquare, IndianRupee,
  ClipboardList, LogOut, Check, X, Loader2, ShieldCheck,
  TrendingUp, Bell, Search, ScrollText, AlertTriangle,
} from 'lucide-react'

interface Stats {
  totalMerchants: number
  approvedMerchants: number
  trialMerchants: number
  pendingRequests: number
  totalRequests: number
  totalCalls: number
  totalReminders: number
  whatsappSent: number
  smsSent: number
  voiceSent: number
  activeSubscriptions: number
  totalPayments: number
  totalRevenue: number
}

interface Merchant {
  id: string
  businessName: string
  phone: string
  email: string | null
  plan: string
  isApproved: boolean
  createdAt: string
}

interface AccessRequest {
  id: string
  name: string
  businessName: string
  phone: string
  city: string | null
  status: string
  createdAt: string
}

interface TopMerchant {
  id: string
  businessName: string
  phone: string
  plan: string
  reminders: number
  calls: number
  customers: number
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string
}) {
  return (
    <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <p className="text-stone-400 text-xs font-bold tracking-wide">{label}</p>
      </div>
      <p className="text-3xl font-extrabold text-white">{value}</p>
      {sub && <p className="text-stone-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [topMerchants, setTopMerchants] = useState<TopMerchant[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [revenue, setRevenue] = useState<{ daily: { date: string; revenue: number }[]; totalRevenue30d: number; conversionRate: number } | null>(null)
  const [health, setHealth] = useState<{ alerts: { level: string; message: string }[]; calls: { successRate: number }; messages: { deliveryRate: number } } | null>(null)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => {
        if (r.status === 401) { router.push('/admin/login'); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        if (data.ok) {
          setStats(data.stats)
          setMerchants(data.recentMerchants)
          setRequests(data.recentRequests)
          setTopMerchants(data.topMerchants)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))

    fetch('/api/admin/revenue').then(r => r.json()).then(d => { if (d.ok) setRevenue(d) }).catch(() => {})
    fetch('/api/admin/health').then(r => r.json()).then(d => { if (d.ok) setHealth(d) }).catch(() => {})
  }, [router])

  async function handleRequest(id: string, action: 'approve' | 'reject') {
    setActionId(id)
    try {
      const res = await fetch(`/api/admin/access-requests/${id}/${action}`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setRequests(rs => rs.map(r => r.id === id ? { ...r, status: action === 'approve' ? 'approved' : 'rejected' } : r))
        // refresh stats
        const s = await fetch('/api/admin/stats').then(r => r.json())
        if (s.ok) setStats(s.stats)
      }
    } finally {
      setActionId(null)
    }
  }

  async function logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0a09] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    )
  }

  const pending = requests.filter(r => r.status === 'pending')

  return (
    <div className="min-h-screen bg-[#0c0a09] text-white">
      {/* Header */}
      <header className="border-b border-stone-800 bg-stone-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-lg">Ugaahi Admin</h1>
              <p className="text-stone-500 text-xs">Control Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/merchants"
              className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-sm font-bold flex items-center gap-2">
              <Search className="w-4 h-4" /> Merchants
            </Link>
            <Link href="/admin/audit"
              className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-sm font-bold flex items-center gap-2">
              <ScrollText className="w-4 h-4" /> Audit
            </Link>
            <Link href="/admin/access-requests"
              className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-sm font-bold flex items-center gap-2">
              <ClipboardList className="w-4 h-4" /> Requests
              {stats && stats.pendingRequests > 0 && (
                <span className="bg-orange-500 text-white text-xs font-extrabold rounded-full w-5 h-5 flex items-center justify-center">
                  {stats.pendingRequests}
                </span>
              )}
            </Link>
            <button onClick={logout}
              className="px-4 py-2 rounded-xl bg-red-950/50 border border-red-900 text-red-400 hover:bg-red-950 text-sm font-bold flex items-center gap-2">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* System health alerts */}
        {health && health.alerts.length > 0 && (
          <div className="space-y-2">
            {health.alerts.map((a, i) => (
              <div key={i} className={`border rounded-2xl p-4 flex items-center gap-3 ${a.level === 'critical' ? 'bg-red-950/40 border-red-800' : 'bg-amber-950/40 border-amber-800'}`}>
                <AlertTriangle className={`w-5 h-5 shrink-0 ${a.level === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
                <p className={`text-sm font-medium ${a.level === 'critical' ? 'text-red-200' : 'text-amber-200'}`}>{a.message}</p>
              </div>
            ))}
          </div>
        )}

        {/* Revenue chart */}
        {revenue && (
          <section className="bg-stone-900/60 border border-stone-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">Revenue — last 30 days</h2>
              <div className="text-right">
                <p className="text-2xl font-extrabold text-emerald-400">₹{revenue.totalRevenue30d.toLocaleString('en-IN')}</p>
                <p className="text-stone-500 text-xs">Trial → paid: {revenue.conversionRate}%</p>
              </div>
            </div>
            <div className="flex items-end gap-1 h-32">
              {revenue.daily.map(d => {
                const max = Math.max(...revenue.daily.map(x => x.revenue), 1)
                const h = Math.max(4, (d.revenue / max) * 100)
                return (
                  <div key={d.date} className="flex-1 flex flex-col justify-end h-full group relative">
                    <div className="bg-gradient-to-t from-emerald-700 to-emerald-400 rounded-t" style={{ height: `${h}%` }} />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-stone-800 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                      ₹{d.revenue.toLocaleString('en-IN')}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-stone-600 text-xs mt-2">
              <span>{revenue.daily[0]?.date.slice(5)}</span>
              <span>{revenue.daily[revenue.daily.length - 1]?.date.slice(5)}</span>
            </div>
          </section>
        )}

        {/* Pending alert */}
        {pending.length > 0 && (
          <div className="bg-orange-950/40 border border-orange-800 rounded-2xl p-4 flex items-center gap-3">
            <Bell className="w-5 h-5 text-orange-400 shrink-0" />
            <p className="text-orange-200 text-sm font-medium">
              <b>{pending.length} access request{pending.length > 1 ? 's' : ''}</b> review ka wait kar rahi hai — neeche se approve/reject karo.
            </p>
          </div>
        )}

        {/* Stats grid */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="TOTAL MERCHANTS" value={stats.totalMerchants}
              sub={`${stats.approvedMerchants} approved`} color="bg-blue-600" />
            <StatCard icon={CreditCard} label="ACTIVE SUBSCRIPTIONS" value={stats.activeSubscriptions}
              sub={`${stats.trialMerchants} on trial`} color="bg-green-600" />
            <StatCard icon={PhoneCall} label="VOICE CALLS" value={stats.totalCalls}
              sub="AI collection calls" color="bg-purple-600" />
            <StatCard icon={MessageSquare} label="MESSAGES SENT" value={stats.totalReminders}
              sub={`WA ${stats.whatsappSent} • SMS ${stats.smsSent} • Voice ${stats.voiceSent}`} color="bg-orange-600" />
            <StatCard icon={IndianRupee} label="REVENUE COLLECTED" value={`₹${stats.totalRevenue.toLocaleString('en-IN')}`}
              sub={`${stats.totalPayments} payments`} color="bg-emerald-600" />
            <StatCard icon={ClipboardList} label="ACCESS REQUESTS" value={stats.totalRequests}
              sub={`${stats.pendingRequests} pending`} color="bg-amber-600" />
            <StatCard icon={TrendingUp} label="APPROVAL RATE"
              value={stats.totalRequests > 0 ? `${Math.round((stats.approvedMerchants / stats.totalRequests) * 100)}%` : '—'}
              sub="requests → merchants" color="bg-cyan-600" />
            <StatCard icon={Users} label="AVG PER MERCHANT"
              value={stats.approvedMerchants > 0 ? Math.round(stats.totalReminders / stats.approvedMerchants) : 0}
              sub="reminders / merchant" color="bg-pink-600" />
          </div>
        )}

        {/* Pending requests — quick actions */}
        {pending.length > 0 && (
          <section>
            <h2 className="text-lg font-extrabold mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-orange-400" /> Pending Requests
            </h2>
            <div className="space-y-3">
              {pending.map(r => (
                <div key={r.id} className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <p className="font-bold">{r.name} <span className="text-stone-500 font-normal">• {r.businessName}</span></p>
                    <p className="text-stone-400 text-sm">{r.phone} {r.city ? `• ${r.city}` : ''}</p>
                    <p className="text-stone-500 text-xs">{new Date(r.createdAt).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRequest(r.id, 'approve')}
                      disabled={actionId === r.id}
                      className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 font-bold text-sm flex items-center gap-1.5 disabled:opacity-50">
                      {actionId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Approve
                    </button>
                    <button
                      onClick={() => handleRequest(r.id, 'reject')}
                      disabled={actionId === r.id}
                      className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-red-950 border border-stone-700 font-bold text-sm flex items-center gap-1.5 disabled:opacity-50">
                      <X className="w-4 h-4" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Two columns */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent merchants */}
          <section className="bg-stone-900/60 border border-stone-800 rounded-2xl p-5">
            <h2 className="text-lg font-extrabold mb-4">Recent Merchants</h2>
            <div className="space-y-3">
              {merchants.map(m => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-stone-800/60 last:border-0">
                  <div>
                    <p className="font-bold text-sm">{m.businessName}</p>
                    <p className="text-stone-500 text-xs">{m.phone}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${m.isApproved ? 'bg-green-950 text-green-400' : 'bg-amber-950 text-amber-400'}`}>
                      {m.isApproved ? 'Approved' : 'Pending'}
                    </span>
                    <p className="text-stone-500 text-xs mt-1 capitalize">{m.plan}</p>
                  </div>
                </div>
              ))}
              {merchants.length === 0 && <p className="text-stone-500 text-sm">Koi merchant nahi hai abhi.</p>}
            </div>
          </section>

          {/* Top merchants by usage */}
          <section className="bg-stone-900/60 border border-stone-800 rounded-2xl p-5">
            <h2 className="text-lg font-extrabold mb-4">Top Usage <span className="text-stone-500 text-xs font-normal">— reminders ke hisaab se</span></h2>
            <div className="space-y-3">
              {topMerchants.map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 py-2 border-b border-stone-800/60 last:border-0">
                  <span className="text-stone-600 font-extrabold text-sm w-6">#{i + 1}</span>
                  <div className="flex-1">
                    <p className="font-bold text-sm">{m.businessName}</p>
                    <p className="text-stone-500 text-xs">
                      {m.reminders} msgs • {m.calls} calls • {m.customers} customers
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-full bg-stone-800 text-stone-300 capitalize">{m.plan}</span>
                </div>
              ))}
              {topMerchants.length === 0 && <p className="text-stone-500 text-sm">Abhi koi usage nahi hai.</p>}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
