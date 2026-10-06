'use client'

import { useEffect, useState, type ComponentType } from 'react'
import Link from 'next/link'
import {
  Wallet,
  AlertTriangle,
  BadgeCheck,
  TrendingUp,
  Plus,
  Users,
  Handshake,
  Zap,
  Crown,
  CalendarDays,
  Phone,
  Download,
  Sparkles,
  BarChart3,
  History,
  RefreshCw,
  FileText,
} from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { formatINR } from '@/lib/date-utils'

interface SummaryData {
  totalOutstanding: { amount: number; count: number }
  totalOverdue: { amount: number; count: number }
  collectedThisWeek: number
  collectedThisMonth: number
  collectionRate: number
  openPromises: number
  openDisputes: number
  overdueCount: number
}

interface AgingData {
  buckets: {
    current: { label: string; count: number; amount: number }
    d30: { label: string; count: number; amount: number }
    d60: { label: string; count: number; amount: number }
    d90: { label: string; count: number; amount: number }
  }
  defaulters: Array<{
    customerId: string
    customerName: string
    phone: string
    outstandingId: string
    amount: number
    daysOverdue: number
  }>
}

interface OutstandingRow {
  id: string
  amount: string
  status: string
  customer: { id: string; name: string; phone: string }
}

interface TrendPoint {
  date: string
  label: string
  collected: number
  newDues: number
}

interface ActivityLog {
  id: string
  action: string
  entity: string
  createdAt: string
  payload?: Record<string, unknown>
}

function StatCard({
  label, value, sub, tone = 'orange', Icon,
}: {
  label: string; value: string; sub?: string; tone?: 'orange' | 'red' | 'green' | 'amber'; Icon: ComponentType<{ className?: string }>
}) {
  const toneMap: Record<string, { iconBg: string; iconText: string }> = {
    orange: { iconBg: 'bg-orange-100', iconText: 'text-orange-600' },
    red: { iconBg: 'bg-red-100', iconText: 'text-red-600' },
    green: { iconBg: 'bg-green-100', iconText: 'text-green-700' },
    amber: { iconBg: 'bg-amber-100', iconText: 'text-amber-700' },
  }
  const t = toneMap[tone]

  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-3">
        <span className={`w-10 h-10 rounded-xl ${t.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${t.iconText}`} />
        </span>
        {sub && (
          <span className="text-[11px] font-semibold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
            {sub}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold amount-display text-stone-900 count-animate">{value}</p>
      <p className="text-sm text-stone-500 mt-1 font-medium">{label}</p>
    </div>
  )
}

/** Collection-rate progress ring */
function CollectionRing({ rate, lang }: { rate: number; lang: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  const filled = Math.min(100, Math.max(0, rate))
  return (
    <div className="glass-card p-5 flex items-center gap-5">
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg viewBox="0 0 84 84" className="w-24 h-24 -rotate-90">
          <circle cx="42" cy="42" r={r} fill="none" stroke="#F5EEDF" strokeWidth="9" />
          <circle
            cx="42" cy="42" r={r} fill="none"
            stroke="url(#ringGrad)" strokeWidth="9" strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * filled) / 100}
            className="transition-all duration-1000"
          />
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#EA580C" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xl font-extrabold text-stone-900">
          {filled}%
        </span>
      </div>
      <div>
        <h3 className="font-bold text-stone-900">
          {lang === 'hi' ? 'Collection Rate' : 'Collection Rate'}
        </h3>
        <p className="text-sm text-stone-500 mt-1 leading-relaxed">
          {lang === 'hi'
            ? filled >= 80
              ? 'Shabaash! Vasooli top form me hai. 🎯'
              : filled >= 50
                ? 'Theek chal raha hai — overdue pe focus karo.'
                : 'Overdue entries pe dhyaan do, rate badhega.'
            : filled >= 80
              ? 'Excellent! Collections are on fire. 🎯'
              : filled >= 50
                ? 'Decent — focus on overdue to push higher.'
                : 'Focus on overdue entries to lift this rate.'}
        </p>
      </div>
    </div>
  )
}

/** 30-day collection trend bar chart */
function TrendChart({ series, days, onDays, onExport, lang }: {
  series: TrendPoint[]; days: number; onDays: (d: number) => void; onExport: () => void; lang: string
}) {
  const max = Math.max(...series.map((s) => Math.max(s.collected, s.newDues)), 1)
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="font-bold text-stone-900 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-orange-600" />
          {lang === 'hi' ? 'Vasuli Trend' : 'Collection Trend'}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-stone-100 rounded-lg p-0.5">
            {[7, 30].map((d) => (
              <button
                key={d}
                onClick={() => onDays(d)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${days === d ? 'bg-white text-orange-700 shadow-sm' : 'text-stone-500'}`}
              >
                {d}D
              </button>
            ))}
          </div>
          <button onClick={onExport} title={lang === 'hi' ? 'CSV download' : 'Download CSV'} className="p-1.5 rounded-lg text-stone-400 hover:text-orange-600 hover:bg-orange-50 transition-all">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="text-xs text-stone-500 mb-4">
        {lang === 'hi' ? 'Roz kitna vasool hua vs naya udhaar' : 'Daily collections vs new dues'}
      </p>
      {series.length === 0 ? (
        <div className="skeleton h-40" />
      ) : series.every((s) => s.collected === 0 && s.newDues === 0) ? (
        <div className="h-40 flex flex-col items-center justify-center text-center">
          <BarChart3 className="w-10 h-10 text-stone-300 mb-2" />
          <p className="text-sm font-semibold text-stone-500">
            {lang === 'hi' ? 'Abhi data nahi hai' : 'No data yet'}
          </p>
          <p className="text-xs text-stone-400 mt-1">
            {lang === 'hi' ? 'Payment aate hi trend yahan dikhega' : 'Trend will appear as payments come in'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-[3px] h-40">
            {series.map((s) => (
              <div key={s.date} className="flex-1 flex flex-col items-center justify-end gap-[2px] h-full group relative">
                <div className="w-full flex flex-col justify-end gap-[2px] h-full">
                  <div className="w-full bg-emerald-400/90 rounded-t-[3px] transition-all group-hover:bg-emerald-500" style={{ height: `${Math.max(2, (s.collected / max) * 100)}%` }} title={`${s.label}: ${formatINR(s.collected)} collected`} />
                  <div className="w-full bg-orange-300/80 rounded-[2px]" style={{ height: `${Math.max(1, (s.newDues / max) * 100 * 0.5)}%` }} title={`${s.label}: ${formatINR(s.newDues)} new dues`} />
                </div>
                {(days === 7 || series.indexOf(s) % Math.ceil(series.length / 8) === 0) && (
                  <span className="text-[9px] text-stone-400 font-medium mt-1 whitespace-nowrap">{s.label}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs font-semibold text-stone-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-400 inline-block" />{lang === 'hi' ? 'Vasool hua' : 'Collected'}</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-300 inline-block" />{lang === 'hi' ? 'Naya udhaar' : 'New dues'}</span>
          </div>
        </>
      )}
    </div>
  )
}

/** AI-style smart insights computed from real data */
function InsightsPanel({ summary, aging, topCustomers, lang }: {
  summary: SummaryData | null; aging: AgingData | null; topCustomers: Array<{ name: string; id: string; total: number }>; lang: string
}) {
  const hi = lang === 'hi'
  const insights: Array<{ Icon: ComponentType<{ className?: string }>; tone: string; title: string; desc: string; href: string }> = []

  if (aging && aging.buckets.d90.amount > 0) {
    insights.push({
      Icon: AlertTriangle, tone: 'bg-red-100 text-red-600',
      title: hi ? `${formatINR(aging.buckets.d90.amount)} 90+ din se atka` : `${formatINR(aging.buckets.d90.amount)} stuck 90+ days`,
      desc: hi ? 'Inhe escalation / legal notice par vichaar karo' : 'Consider escalation or legal notice for these',
      href: '/dashboard/outstandings?filter=overdue',
    })
  }
  if (topCustomers[0]) {
    insights.push({
      Icon: Phone, tone: 'bg-orange-100 text-orange-600',
      title: hi ? `Aaj ${topCustomers[0].name} ko call karo` : `Call ${topCustomers[0].name} today`,
      desc: hi ? `${formatINR(topCustomers[0].total)} — sabse bada overdue, pehli priority` : `${formatINR(topCustomers[0].total)} — biggest overdue, top priority`,
      href: '/dashboard/outstandings?filter=overdue',
    })
  }
  if (summary && summary.openPromises > 0) {
    insights.push({
      Icon: Handshake, tone: 'bg-amber-100 text-amber-700',
      title: hi ? `${summary.openPromises} promises ka follow-up banta hai` : `${summary.openPromises} promises need follow-up`,
      desc: hi ? 'Vaada nibhane walon se paisa jaldi aata hai' : 'Promise-keepers pay faster — nudge them',
      href: '/dashboard/promises',
    })
  }
  if (summary && summary.collectionRate < 60 && summary.totalOverdue.amount > 0) {
    insights.push({
      Icon: Sparkles, tone: 'bg-blue-100 text-blue-600',
      title: hi ? 'Voice calls badhao — recovery tez hogi' : 'Increase voice calls for faster recovery',
      desc: hi ? `Collection rate ${summary.collectionRate}% hai — bade dues par AI call lagao` : `Collection rate is ${summary.collectionRate}% — trigger AI calls on big dues`,
      href: '/dashboard/outstandings?filter=overdue',
    })
  }
  if (insights.length === 0) {
    insights.push({
      Icon: BadgeCheck, tone: 'bg-green-100 text-green-700',
      title: hi ? 'Sab kuch track par hai! 🎯' : 'Everything is on track! 🎯',
      desc: hi ? 'Koi urgent action nahi — aise hi vasoolte raho' : 'No urgent actions — keep collecting',
      href: '/dashboard/outstandings',
    })
  }

  return (
    <div className="glass-card p-5 !border-violet-200 bg-gradient-to-br from-violet-50/60 to-white">
      <h2 className="font-bold text-stone-900 mb-1 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-violet-600" />
        {hi ? 'AI Insights' : 'AI Insights'}
      </h2>
      <p className="text-xs text-stone-500 mb-4">{hi ? 'Aaj kya karna chahiye — data se' : 'What to do today — from your data'}</p>
      <div className="space-y-2.5">
        {insights.slice(0, 4).map((ins, i) => (
          <Link key={i} href={ins.href} className="flex items-start gap-3 p-3 rounded-xl bg-white border border-stone-100 hover:border-violet-300 hover:shadow-sm transition-all group">
            <span className={`w-9 h-9 rounded-xl ${ins.tone} flex items-center justify-center flex-shrink-0`}>
              <ins.Icon className="w-[18px] h-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-stone-900 leading-snug">{ins.title}</span>
              <span className="block text-xs text-stone-500 mt-0.5 leading-relaxed">{ins.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** Recent activity feed */
function ActivityFeed({ logs, lang }: { logs: ActivityLog[]; lang: string }) {
  const hi = lang === 'hi'
  const iconFor = (action: string) => {
    const a = action.toLowerCase()
    if (a.includes('payment') || a.includes('paid')) return { Icon: BadgeCheck, tint: 'bg-green-100 text-green-700' }
    if (a.includes('reminder') || a.includes('whatsapp')) return { Icon: Zap, tint: 'bg-blue-100 text-blue-600' }
    if (a.includes('call')) return { Icon: Phone, tint: 'bg-orange-100 text-orange-600' }
    if (a.includes('promise')) return { Icon: Handshake, tint: 'bg-amber-100 text-amber-700' }
    if (a.includes('dispute')) return { Icon: AlertTriangle, tint: 'bg-red-100 text-red-600' }
    if (a.includes('customer')) return { Icon: Users, tint: 'bg-violet-100 text-violet-600' }
    return { Icon: FileText, tint: 'bg-stone-100 text-stone-500' }
  }
  const labelFor = (action: string) =>
    action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-stone-900 flex items-center gap-2">
          <History className="w-4 h-4 text-orange-600" />
          {hi ? 'Recent Activity' : 'Recent Activity'}
        </h2>
        <Link href="/dashboard/activity" className="text-xs font-bold text-orange-600 hover:text-orange-700">
          {hi ? 'Sab dekho →' : 'View all →'}
        </Link>
      </div>
      {logs.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-6">{hi ? 'Abhi koi activity nahi' : 'No activity yet'}</p>
      ) : (
        <div className="space-y-1">
          {logs.slice(0, 7).map((log) => {
            const { Icon, tint } = iconFor(log.action)
            return (
              <div key={log.id} className="flex items-center gap-3 py-2.5 border-b border-stone-50 last:border-0">
                <span className={`w-8 h-8 rounded-lg ${tint} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-800 truncate">{labelFor(log.action)}</p>
                  <p className="text-[11px] text-stone-400">
                    {new Date(log.createdAt).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { lang, t } = useLanguage()
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [aging, setAging] = useState<AgingData | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [topCustomers, setTopCustomers] = useState<Array<{ name: string; id: string; total: number }>>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [trendDays, setTrendDays] = useState(30)
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTrend = async () => {
      try {
        const res = await fetch(`/api/reports/trend?days=${trendDays}`)
        if (res.ok) {
          const d = await res.json()
          setTrend(d.series ?? [])
        }
      } catch { /* chart stays empty */ }
    }
    fetchTrend()
  }, [trendDays])

  const exportTrendCsv = () => {
    const rows = ['date,collected,new_dues', ...trend.map((p) => `${p.date},${p.collected},${p.newDues}`)]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `collection-trend-${trendDays}d.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sumRes, agingRes, merchRes, outRes, actRes] = await Promise.all([
          fetch('/api/reports/summary'),
          fetch('/api/reports/aging'),
          fetch('/api/merchant/settings'),
          fetch('/api/outstandings?status=overdue'),
          fetch('/api/activity?limit=8'),
        ])
        if (sumRes.ok) setSummary(await sumRes.json())
        if (agingRes.ok) setAging(await agingRes.json())
        if (merchRes.ok) {
          const m = await merchRes.json()
          if (m.merchant?.businessName) setBusinessName(m.merchant.businessName)
        }
        if (outRes.ok) {
          const d = await outRes.json()
          const rows: OutstandingRow[] = d.outstandings ?? []
          const byCustomer = new Map<string, { name: string; id: string; total: number }>()
          for (const r of rows) {
            const amt = parseFloat(r.amount) || 0
            const cur = byCustomer.get(r.customer.id)
            if (cur) cur.total += amt
            else byCustomer.set(r.customer.id, { name: r.customer.name, id: r.customer.id, total: amt })
          }
          setTopCustomers([...byCustomer.values()].sort((a, b) => b.total - a.total).slice(0, 5))
        }
        if (actRes.ok) {
          const a = await actRes.json()
          setActivity(a.logs ?? [])
        }
      } catch {
        // skeletons remain
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 60_000)
    return () => clearInterval(interval)
  }, [])

  const today = new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const hour = new Date().getHours()
  const greeting = lang === 'hi'
    ? hour < 12 ? 'Suprabhat' : hour < 17 ? 'Namaste' : 'Shubh Sandhya'
    : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const quickActions = [
    { href: '/dashboard/outstandings?filter=overdue', Icon: AlertTriangle, label: lang === 'hi' ? 'Overdue dekho' : 'View Overdue', tint: 'bg-red-100 text-red-600' },
    { href: '/dashboard/promises', Icon: Handshake, label: lang === 'hi' ? 'Promises' : 'Promises', badge: summary?.openPromises, tint: 'bg-amber-100 text-amber-700' },
    { href: '/dashboard/disputes', Icon: Zap, label: lang === 'hi' ? 'Disputes' : 'Disputes', badge: summary?.openDisputes, tint: 'bg-orange-100 text-orange-600' },
    { href: '/dashboard/customers', Icon: Users, label: lang === 'hi' ? 'Customer add karo' : 'Add Customer', tint: 'bg-green-100 text-green-700' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-700 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" /> {today}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 mt-1">
            {greeting}{businessName ? `, ${businessName}` : ''}! 🙏
          </h1>
          <p className="text-stone-500 text-sm mt-0.5">
            {lang === 'hi' ? 'Aaj ki vasool ki sthiti ek nazar me' : 'Your collections at a glance today'}
          </p>
        </div>
        <Link href="/dashboard/outstandings" className="btn-primary px-4 py-2.5 text-sm flex-shrink-0" id="add-outstanding-btn">
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          {lang === 'hi' ? 'Naya Udhaar' : 'Add Outstanding'}
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-32" />)
        ) : (
          <>
            <StatCard
              Icon={Wallet} tone="orange"
              label={t.dashboard.totalOutstanding}
              value={summary ? formatINR(summary.totalOutstanding.amount) : '₹0'}
              sub={summary ? `${summary.totalOutstanding.count} entries` : undefined}
            />
            <StatCard
              Icon={AlertTriangle} tone="red"
              label={t.dashboard.totalOverdue}
              value={summary ? formatINR(summary.totalOverdue.amount) : '₹0'}
              sub={summary ? `${summary.overdueCount} overdue` : undefined}
            />
            <StatCard
              Icon={BadgeCheck} tone="green"
              label={t.dashboard.collectedThisWeek}
              value={summary ? formatINR(summary.collectedThisWeek) : '₹0'}
              sub={summary ? `${formatINR(summary.collectedThisMonth)} ${lang === 'hi' ? 'is mahine' : 'this month'}` : undefined}
            />
            <StatCard
              Icon={TrendingUp} tone="amber"
              label={t.dashboard.collectionRate}
              value={summary ? `${summary.collectionRate}%` : '0%'}
              sub={lang === 'hi' ? 'vasooli dar' : 'recovery rate'}
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickActions.map((item) => (
          <Link key={item.href} href={item.href} className="glass-card card-hover p-4 flex items-center gap-3 group">
            <span className={`w-10 h-10 rounded-xl ${item.tint} flex items-center justify-center flex-shrink-0`}>
              <item.Icon className="w-5 h-5" />
            </span>
            <span className="text-sm font-semibold text-stone-700 group-hover:text-stone-900 transition-colors flex-1">
              {item.label}
            </span>
            {item.badge != null && item.badge > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[22px] text-center">
                {item.badge}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Trend + AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        <div className="lg:col-span-3">
          <TrendChart series={trend} days={trendDays} onDays={setTrendDays} onExport={exportTrendCsv} lang={lang} />
        </div>
        <div className="lg:col-span-2">
          {loading ? (
            <div className="skeleton h-64" />
          ) : (
            <InsightsPanel summary={summary} aging={aging} topCustomers={topCustomers} lang={lang} />
          )}
        </div>
      </div>

      {/* Ring + Aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {loading ? (
          <div className="skeleton h-36" />
        ) : (
          <CollectionRing rate={summary?.collectionRate ?? 0} lang={lang} />
        )}

        <div className="glass-card p-5">
          <h2 className="font-bold text-stone-900 mb-1">
            {lang === 'hi' ? '📅 Aging Analysis' : '📅 Aging Analysis'}
          </h2>
          <p className="text-xs text-stone-500 mb-4">
            {lang === 'hi' ? 'Kitne din se paisa atka hai' : 'How long money has been stuck'}
          </p>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-9" />)}</div>
          ) : aging ? (
            <div className="space-y-3">
              {[
                { key: 'current', ...aging.buckets.current, color: 'bg-blue-500' },
                { key: 'd30', ...aging.buckets.d30, color: 'bg-amber-400' },
                { key: 'd60', ...aging.buckets.d60, color: 'bg-orange-500' },
                { key: 'd90', ...aging.buckets.d90, color: 'bg-red-500' },
              ].map((bucket) => {
                const maxAmount = Math.max(
                  aging.buckets.current.amount, aging.buckets.d30.amount,
                  aging.buckets.d60.amount, aging.buckets.d90.amount, 1
                )
                const pct = Math.max(4, (bucket.amount / maxAmount) * 100)
                return (
                  <div key={bucket.key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-stone-600">{bucket.label}</span>
                      <span className="font-mono font-bold text-stone-800">{formatINR(bucket.amount)} ({bucket.count})</span>
                    </div>
                    <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className={`h-full ${bucket.color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-stone-400 text-sm">{lang === 'hi' ? 'Data load ho raha hai...' : 'Loading...'}</p>
          )}
        </div>
      </div>

      {/* Defaulters + Top customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="glass-card p-5">
          <h2 className="font-bold text-stone-900 mb-4">
            🚨 {lang === 'hi' ? 'Defaulter List (90+ din)' : 'Defaulter List (90+ days)'}
          </h2>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-16" />)}</div>
          ) : aging && aging.defaulters.length > 0 ? (
            <div className="space-y-2">
              {aging.defaulters.slice(0, 5).map((d) => (
                <Link
                  key={d.outstandingId}
                  href={`/dashboard/outstandings`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100 hover:border-red-300 transition-all group"
                >
                  <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm">
                    {d.customerName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-stone-900 truncate">{d.customerName}</p>
                    <p className="text-xs text-red-600 font-medium">{d.daysOverdue} {lang === 'hi' ? 'din overdue' : 'days overdue'}</p>
                  </div>
                  <span className="text-sm font-bold text-red-700 amount-display flex-shrink-0">{formatINR(d.amount)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🎉</div>
              <p className="text-stone-500 text-sm font-medium">
                {lang === 'hi' ? 'Koi defaulter nahi! Badhiya hai.' : 'No defaulters! Great job.'}
              </p>
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <h2 className="font-bold text-stone-900 mb-1 flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-600" />
            {lang === 'hi' ? 'Top Udhaar Wale Customers' : 'Top Debtors'}
          </h2>
          <p className="text-xs text-stone-500 mb-4">
            {lang === 'hi' ? 'Sabse zyada overdue — pehle inhe yaad dilao' : 'Highest overdue — chase these first'}
          </p>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14" />)}</div>
          ) : topCustomers.length > 0 ? (
            <div className="space-y-2">
              {topCustomers.map((c, i) => (
                <Link
                  key={c.id}
                  href={`/dashboard/customers/${c.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-100 hover:border-amber-300 transition-all"
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                    i === 0 ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {i + 1}
                  </span>
                  <p className="flex-1 text-sm font-bold text-stone-900 truncate">{c.name}</p>
                  <span className="text-sm font-bold text-amber-800 amount-display flex-shrink-0">{formatINR(c.total)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">✨</div>
              <p className="text-stone-500 text-sm font-medium">
                {lang === 'hi' ? 'Koi overdue nahi — sab clear!' : 'No overdue — all clear!'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {loading ? (
          <div className="skeleton h-64" />
        ) : (
          <ActivityFeed logs={activity} lang={lang} />
        )}

        {/* Tally status mini-card */}
        <div className="glass-card p-5 !border-blue-200 bg-gradient-to-br from-blue-50/60 to-white">
          <h2 className="font-bold text-stone-900 mb-1 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-blue-600" />
            {lang === 'hi' ? 'Tally Sync' : 'Tally Sync'}
          </h2>
          <p className="text-xs text-stone-500 mb-4">
            {lang === 'hi' ? 'Tally ke bills se automatic udhaari' : 'Auto-create dues from Tally bills'}
          </p>
          <div className="space-y-2.5 text-sm">
            {[
              lang === 'hi' ? 'Tally se XML export karke bills upload karo' : 'Upload bills via Tally XML export',
              lang === 'hi' ? 'Bill number ke saath automatic reminders' : 'Automatic reminders with bill numbers',
              lang === 'hi' ? 'Sync Agent se har 30 min me auto-sync' : 'Auto-sync every 30 min with Sync Agent',
            ].map((t, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-extrabold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <span className="text-stone-700 font-medium">{t}</span>
              </div>
            ))}
          </div>
          <Link href="/dashboard/integrations" className="btn-primary w-full py-3 mt-5 text-sm">
            {lang === 'hi' ? 'Tally Sync kholo' : 'Open Tally Sync'} →
          </Link>
        </div>
      </div>

      {/* Action required */}
      {summary && (summary.openPromises > 0 || summary.openDisputes > 0) && (
        <div className="glass-card p-5 !border-amber-300 bg-gradient-to-br from-amber-50 to-white">
          <h2 className="font-bold text-amber-800 mb-3 text-sm flex items-center gap-2">
            <Zap className="w-4 h-4" /> {lang === 'hi' ? '⚡ Action Required' : '⚡ Action Required'}
          </h2>
          <div className="flex gap-3 flex-wrap">
            {summary.openPromises > 0 && (
              <Link href="/dashboard/promises" className="bg-white border border-amber-300 text-amber-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-amber-50 transition-all shadow-sm">
                🤝 {summary.openPromises} {lang === 'hi' ? 'khule promises' : 'open promises'}
              </Link>
            )}
            {summary.openDisputes > 0 && (
              <Link href="/dashboard/disputes" className="bg-white border border-orange-300 text-orange-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-orange-50 transition-all shadow-sm">
                ⚡ {summary.openDisputes} {lang === 'hi' ? 'khule disputes' : 'open disputes'}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
