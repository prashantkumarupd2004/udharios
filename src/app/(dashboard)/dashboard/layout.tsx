'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  ReceiptText,
  Handshake,
  ScrollText,
  Settings,
  Plug,
  ShieldCheck,
  LogOut,
  Bell,
  RefreshCw,
} from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'

const NAV_ITEMS = [
  { href: '/dashboard', Icon: LayoutDashboard, hiLabel: 'Dashboard', enLabel: 'Dashboard' },
  { href: '/dashboard/customers', Icon: Users, hiLabel: 'Customers', enLabel: 'Customers' },
  { href: '/dashboard/outstandings', Icon: ReceiptText, hiLabel: 'Udhaari', enLabel: 'Ledger' },
  { href: '/dashboard/promises', Icon: Handshake, hiLabel: 'Promises', enLabel: 'Promises' },
  { href: '/dashboard/activity', Icon: ScrollText, hiLabel: 'Activity', enLabel: 'Activity' },
  { href: '/dashboard/background-check', Icon: ShieldCheck, hiLabel: 'BG Check', enLabel: 'BG Check' },
  { href: '/dashboard/integrations', Icon: Plug, hiLabel: 'Tally Sync', enLabel: 'Tally Sync' },
]

function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/logo-badge.png"
        alt="Ugaahi logo"
        className="w-9 h-9 rounded-xl shadow-lg shadow-green-900/30 object-cover ring-1 ring-white/10"
      />
      <div className="hidden lg:block">
        <span className={`font-extrabold text-lg tracking-tight block leading-none ${light ? 'text-white' : 'text-slate-900'}`}>
          Ugaahi
        </span>
        <span className="text-[10px] font-semibold tracking-[0.2em] text-[#00B33F] uppercase">
          Collection OS
        </span>
      </div>
    </div>
  )
}

interface MerchantInfo {
  businessName: string
  phone?: string | null
  plan?: string | null
}

interface NotifLog {
  id: string
  action: string
  actor: string
  createdAt: string
}

const NOTIF_LABELS: Record<string, { hi: string; en: string }> = {
  'reminder.sent': { hi: 'Reminder bheja gaya', en: 'Reminder sent' },
  'payment.received': { hi: 'Payment mili', en: 'Payment received' },
  'call.placed': { hi: 'Call ki gayi', en: 'Call placed' },
  'call.completed': { hi: 'Call complete hui', en: 'Call completed' },
  'promise.created': { hi: 'Promise liya gaya', en: 'Promise recorded' },
  'promise.kept': { hi: 'Promise rakha gaya', en: 'Promise kept' },
  'promise.broken': { hi: 'Promise toot gaya', en: 'Promise broken' },
  'dispute.opened': { hi: 'Dispute khola gaya', en: 'Dispute opened' },
  'escalation.triggered': { hi: 'Escalation hua', en: 'Escalated' },
  'customer.created': { hi: 'Naya customer add hua', en: 'Customer added' },
  'outstanding.created': { hi: 'Nayi udhaari add hui', en: 'Outstanding added' },
  'payment.link.created': { hi: 'Payment link bana', en: 'Payment link created' },
}

function timeAgo(iso: string, lang: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return lang === 'hi' ? 'abhi' : 'now'
  if (mins < 60) return lang === 'hi' ? `${mins} min pehle` : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return lang === 'hi' ? `${hrs} ghante pehle` : `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return lang === 'hi' ? `${days} din pehle` : `${days}d ago`
}

/**
 * Top-bar actions: Refresh + Notifications + Profile.
 * Pehle bell aur avatar SIRF decorative the — bell pe click se kuch nahi
 * hota tha, hamesha ek nakli laal dot dikhta tha, aur avatar ek band div
 * tha (profile khulta hi nahi tha). Ab teeno asli hain:
 * - Refresh: 'ugaahi:refresh' event + router.refresh, ghumta icon
 * - Bell: /api/activity se asli events, unread count sirf tab jab naye
 *   events last-seen ke baad ke hon; kholne pe seen mark ho jata hai
 * - Avatar: business name/phone/plan ke saath dropdown, Settings + Logout
 */
function TopBarActions({ lang, dark = false }: { lang: string; dark?: boolean }) {
  const router = useRouter()
  const [merchant, setMerchant] = useState<MerchantInfo | null>(null)
  const [notifs, setNotifs] = useState<NotifLog[]>([])
  const [lastSeen, setLastSeen] = useState(() =>
    typeof window === 'undefined'
      ? 0
      : Number(localStorage.getItem('ugaahi_notif_seen') ?? 0)
  )
  const [open, setOpen] = useState<'none' | 'bell' | 'profile'>('none')
  const [refreshing, setRefreshing] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/merchant/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.merchant) setMerchant(d.merchant as MerchantInfo) })
      .catch(() => {})
    const loadNotifs = () => {
      fetch('/api/activity?limit=8')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.logs) setNotifs(d.logs as NotifLog[]) })
        .catch(() => {})
    }
    loadNotifs()
    const t = setInterval(loadNotifs, 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen('none')
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const unread = notifs.filter((n) => new Date(n.createdAt).getTime() > lastSeen).length

  const openBell = () => {
    if (open === 'bell') {
      setOpen('none')
      return
    }
    setOpen('bell')
    const now = Date.now()
    setLastSeen(now)
    localStorage.setItem('ugaahi_notif_seen', String(now))
  }

  const doRefresh = () => {
    setRefreshing(true)
    window.dispatchEvent(new Event('ugaahi:refresh'))
    router.refresh()
    setTimeout(() => setRefreshing(false), 900)
  }

  const doLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    window.location.href = '/login'
  }

  const initial = (merchant?.businessName?.trim()?.charAt(0) ?? 'U').toUpperCase()
  const iconBtn = dark
    ? 'relative p-2 text-white/80 hover:text-white rounded-xl transition-all'
    : 'relative p-2.5 text-slate-500 hover:text-[#00B33F] hover:bg-green-50 rounded-xl transition-all'

  return (
    <div ref={wrapRef} className="relative flex items-center gap-1.5">
      <button onClick={doRefresh} className={iconBtn} aria-label="Refresh" title="Refresh">
        <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
      </button>

      <button onClick={openBell} className={iconBtn} aria-label="Notifications">
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full ring-2 ring-white flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <button
        onClick={() => setOpen(open === 'profile' ? 'none' : 'profile')}
        className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00B33F] to-[#1FB2A6] flex items-center justify-center text-white font-bold text-sm shadow-md shadow-green-500/25 ml-0.5"
        aria-label="Profile"
      >
        {initial}
      </button>

      {open === 'bell' && (
        <div className="absolute right-0 top-[calc(100%+10px)] w-[320px] max-w-[85vw] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden text-left">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">Notifications</p>
            <Link
              href="/dashboard/activity"
              onClick={() => setOpen('none')}
              className="text-xs font-bold text-[#00B33F]"
            >
              {lang === 'hi' ? 'Sab dekho →' : 'View all →'}
            </Link>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {notifs.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                {lang === 'hi' ? 'Abhi koi notification nahi' : 'No notifications yet'}
              </p>
            ) : (
              notifs.map((n) => {
                const lbl = NOTIF_LABELS[n.action]
                return (
                  <div key={n.id} className="px-4 py-2.5 border-b border-slate-50 last:border-0">
                    <p className="text-[13px] font-semibold text-slate-800">
                      {lbl ? (lang === 'hi' ? lbl.hi : lbl.en) : n.action}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {n.actor} • {timeAgo(n.createdAt, lang)}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {open === 'profile' && (
        <div className="absolute right-0 top-[calc(100%+10px)] w-[260px] max-w-[85vw] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden text-left">
          <div className="px-4 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#00B33F] to-[#1FB2A6] flex items-center justify-center text-white font-bold shadow-md shadow-green-500/25 flex-shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {merchant?.businessName ?? '—'}
              </p>
              <p className="text-xs text-slate-400 truncate">{merchant?.phone ?? ''}</p>
              {merchant?.plan && (
                <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide bg-green-50 text-green-700 border border-green-100 px-1.5 py-0.5 rounded">
                  {merchant.plan}
                </span>
              )}
            </div>
          </div>
          <Link
            href="/dashboard/settings"
            onClick={() => setOpen('none')}
            className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
          >
            <Settings className="w-4 h-4" /> Settings
          </Link>
          <button
            onClick={doLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 border-t border-slate-100 transition-all"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      )}
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { lang, toggleLang } = useLanguage()

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex">
      {/* ============ DESKTOP SIDEBAR — dark navy, premium fintech ============ */}
      <aside className="hidden md:flex flex-col w-60 lg:w-64 flex-shrink-0 bg-[#00203D] min-h-screen sticky top-0 h-screen">
        {/* Decorative glow */}
        <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-[#00B33F]/10 to-transparent pointer-events-none" />

        {/* Logo */}
        <div className="relative px-5 pt-6 pb-5">
          <Link href="/dashboard" aria-label="Ugaahi dashboard">
            <BrandMark light />
          </Link>
        </div>

        {/* Nav */}
        <nav className="relative flex-1 px-3 space-y-1 overflow-y-auto">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {lang === 'hi' ? 'Menu' : 'Menu'}
          </p>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all group ${
                  isActive
                    ? 'bg-[#00B33F] text-white shadow-lg shadow-green-900/40'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <item.Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-[#00B33F]'}`} />
                {lang === 'hi' ? item.hiLabel : item.enLabel}
              </Link>
            )
          })}
        </nav>

        {/* Bottom: settings + language */}
        <div className="relative p-4 border-t border-white/10 space-y-1">
          <Link
            href="/dashboard/settings"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              pathname.startsWith('/dashboard/settings')
                ? 'bg-[#00B33F] text-white shadow-lg shadow-green-900/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Settings className="w-[18px] h-[18px]" />
            {lang === 'hi' ? 'Settings' : 'Settings'}
          </Link>
          <button
            onClick={toggleLang}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <span className="w-[18px] h-[18px] flex items-center justify-center text-xs font-bold border border-slate-600 rounded">
              {lang === 'hi' ? 'EN' : 'हिं'}
            </span>
            {lang === 'hi' ? 'English me dekho' : 'हिंदी में देखो'}
          </button>
        </div>
      </aside>

      {/* ============ MAIN COLUMN ============ */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden bg-[#00203D] sticky top-0 z-40 px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" aria-label="Ugaahi dashboard">
            <BrandMark light />
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="text-xs font-bold text-white/80 px-2.5 py-1.5 rounded-lg border border-white/20"
            >
              {lang === 'hi' ? 'EN' : 'हिं'}
            </button>
            <TopBarActions lang={lang} dark />
          </div>
        </header>

        {/* Desktop top bar — search + actions */}
        <header className="hidden md:flex items-center justify-between px-6 lg:px-8 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {(() => {
                const active = NAV_ITEMS.find((i) => pathname === i.href || (i.href !== '/dashboard' && pathname.startsWith(i.href)))
                if (pathname.startsWith('/dashboard/settings')) return lang === 'hi' ? 'Settings' : 'Settings'
                return active ? (lang === 'hi' ? active.hiLabel : active.enLabel) : ''
              })()}
            </h2>
            <p className="text-xs text-slate-400">
              {new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <TopBarActions lang={lang} />
        </header>

        {/* Main content */}
        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-8 max-w-[1400px] mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#00203D] border-t border-white/10 flex items-center justify-around py-2 px-1">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all ${
                isActive ? 'text-[#00B33F]' : 'text-slate-500'
              }`}
            >
              <item.Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">
                {lang === 'hi' ? item.hiLabel : item.enLabel}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
