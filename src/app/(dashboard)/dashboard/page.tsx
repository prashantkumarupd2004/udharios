'use client'

import { useEffect, useState, type ComponentType } from 'react'
import Link from 'next/link'
import { Wallet, AlertTriangle, BadgeCheck, TrendingUp, Plus } from 'lucide-react'
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

function StatCard({
  label, value, sub, color = 'indigo', Icon,
}: {
  label: string; value: string; sub?: string; color?: string; Icon: ComponentType<{ className?: string }>
}) {
  const colorMap: Record<string, string> = {
    indigo: 'border-indigo-500/20 from-indigo-500/10',
    red: 'border-red-500/20 from-red-500/10',
    green: 'border-green-500/20 from-green-500/10',
    yellow: 'border-yellow-500/20 from-yellow-500/10',
  }
  const iconColorMap: Record<string, string> = {
    indigo: 'text-indigo-400',
    red: 'text-red-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
  }

  return (
    <div className={`stat-card border ${colorMap[color]} bg-gradient-to-br to-transparent`}>
      <div className="flex items-start justify-between mb-3">
        <span className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
          <Icon className={`w-5 h-5 ${iconColorMap[color]}`} />
        </span>
        {sub && <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">{sub}</span>}
      </div>
      <p className="text-2xl font-bold amount-display text-white count-animate">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  )
}

export default function DashboardPage() {
  const { lang, t } = useLanguage()
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [aging, setAging] = useState<AgingData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sumRes, agingRes] = await Promise.all([
          fetch('/api/reports/summary'),
          fetch('/api/reports/aging'),
        ])
        if (sumRes.ok) setSummary(await sumRes.json())
        if (agingRes.ok) setAging(await agingRes.json())
      } catch {
        // handled silently — skeletons remain
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 60_000) // refresh every minute
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {lang === 'hi' ? 'Aapka Dashboard' : 'Your Dashboard'}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {lang === 'hi' ? 'Real-time collection status' : 'Real-time collection status'}
          </p>
        </div>
        <Link
          href="/dashboard/outstandings"
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
          id="add-outstanding-btn"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          {lang === 'hi' ? 'Naya Udhaar' : 'Add Outstanding'}
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              Icon={Wallet}
              label={t.dashboard.totalOutstanding}
              value={summary ? formatINR(summary.totalOutstanding.amount) : '₹0'}
              sub={summary ? `${summary.totalOutstanding.count} entries` : undefined}
              color="indigo"
            />
            <StatCard
              Icon={AlertTriangle}
              label={t.dashboard.totalOverdue}
              value={summary ? formatINR(summary.totalOverdue.amount) : '₹0'}
              sub={summary ? `${summary.overdueCount} overdue` : undefined}
              color="red"
            />
            <StatCard
              Icon={BadgeCheck}
              label={t.dashboard.collectedThisWeek}
              value={summary ? formatINR(summary.collectedThisWeek) : '₹0'}
              color="green"
            />
            <StatCard
              Icon={TrendingUp}
              label={t.dashboard.collectionRate}
              value={summary ? `${summary.collectionRate}%` : '0%'}
              sub={summary ? formatINR(summary.collectedThisMonth) + ' this month' : undefined}
              color="yellow"
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/dashboard/outstandings?filter=overdue', icon: '🔴', label: lang === 'hi' ? 'Overdue dekho' : 'View Overdue' },
          { href: '/dashboard/promises', icon: '🤝', label: lang === 'hi' ? 'Promises' : 'Promises', badge: summary?.openPromises },
          { href: '/dashboard/disputes', icon: '⚡', label: lang === 'hi' ? 'Disputes' : 'Disputes', badge: summary?.openDisputes },
          { href: '/dashboard/customers', icon: '👤', label: lang === 'hi' ? 'Customer add karo' : 'Add Customer' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="glass-card p-4 flex items-center gap-3 hover:border-indigo-500/30 transition-all group"
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-sm text-gray-300 group-hover:text-white transition-colors flex-1">
              {item.label}
            </span>
            {item.badge != null && item.badge > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                {item.badge}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aging buckets */}
        <div className="glass-card p-5">
          <h2 className="font-semibold text-white mb-4">
            {lang === 'hi' ? '📅 Aging Analysis' : '📅 Aging Analysis'}
          </h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-8 rounded-lg" />)}
            </div>
          ) : aging ? (
            <div className="space-y-3">
              {[
                { key: 'current', ...aging.buckets.current, color: 'bg-blue-500' },
                { key: 'd30', ...aging.buckets.d30, color: 'bg-yellow-500' },
                { key: 'd60', ...aging.buckets.d60, color: 'bg-orange-500' },
                { key: 'd90', ...aging.buckets.d90, color: 'bg-red-500' },
              ].map((bucket) => {
                const maxAmount = Math.max(
                  aging.buckets.current.amount,
                  aging.buckets.d30.amount,
                  aging.buckets.d60.amount,
                  aging.buckets.d90.amount,
                  1
                )
                const pct = (bucket.amount / maxAmount) * 100
                return (
                  <div key={bucket.key}>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{bucket.label}</span>
                      <span className="font-mono">{formatINR(bucket.amount)} ({bucket.count})</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${bucket.color} rounded-full transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-600 text-sm">{lang === 'hi' ? 'Data load ho raha hai...' : 'Loading...'}</p>
          )}
        </div>

        {/* Defaulters */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">
              🚨 {lang === 'hi' ? 'Defaulter List (90+ din)' : 'Defaulter List (90+ days)'}
            </h2>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
            </div>
          ) : aging && aging.defaulters.length > 0 ? (
            <div className="space-y-2">
              {aging.defaulters.slice(0, 5).map((d) => (
                <Link
                  key={d.outstandingId}
                  href={`/dashboard/outstandings/${d.outstandingId}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-red-500/5 border border-red-500/10 hover:border-red-500/20 transition-all group"
                >
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-sm font-bold flex-shrink-0">
                    {d.customerName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{d.customerName}</p>
                    <p className="text-xs text-gray-500">{d.daysOverdue} {lang === 'hi' ? 'din baaki' : 'days overdue'}</p>
                  </div>
                  <span className="text-sm font-bold text-red-400 font-mono flex-shrink-0">
                    {formatINR(d.amount)}
                  </span>
                </Link>
              ))}
              {aging.defaulters.length > 5 && (
                <Link
                  href="/dashboard/reports"
                  className="block text-center text-xs text-indigo-400 hover:underline py-2"
                >
                  +{aging.defaulters.length - 5} {lang === 'hi' ? 'aur dekho' : 'more'}
                </Link>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🎉</div>
              <p className="text-gray-500 text-sm">
                {lang === 'hi' ? 'Koi defaulter nahi! Badhiya hai.' : 'No defaulters! Great job.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Notifications section */}
      {summary && (summary.openPromises > 0 || summary.openDisputes > 0) && (
        <div className="glass-card p-4 border-yellow-500/20">
          <h2 className="font-semibold text-yellow-400 mb-3 text-sm">
            ⚡ {lang === 'hi' ? 'Action Required' : 'Action Required'}
          </h2>
          <div className="flex gap-3 flex-wrap">
            {summary.openPromises > 0 && (
              <Link
                href="/dashboard/promises"
                className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-4 py-2 rounded-xl text-sm hover:bg-yellow-500/20 transition-all"
              >
                🤝 {summary.openPromises} {lang === 'hi' ? 'khule promises' : 'open promises'}
              </Link>
            )}
            {summary.openDisputes > 0 && (
              <Link
                href="/dashboard/disputes"
                className="bg-orange-500/10 border border-orange-500/20 text-orange-400 px-4 py-2 rounded-xl text-sm hover:bg-orange-500/20 transition-all"
              >
                ⚡ {summary.openDisputes} {lang === 'hi' ? 'khule disputes' : 'open disputes'}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
