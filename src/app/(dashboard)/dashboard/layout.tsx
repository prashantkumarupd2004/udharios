'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
        src="/logo-premium.png"
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
            <Link
              href="/dashboard/settings"
              className="p-2 text-white/70 rounded-xl"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </Link>
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
          <div className="flex items-center gap-2">
            <button className="relative p-2.5 text-slate-500 hover:text-[#00B33F] hover:bg-green-50 rounded-xl transition-all" aria-label="Notifications">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00B33F] to-[#1FB2A6] flex items-center justify-center text-white font-bold text-sm shadow-md shadow-green-500/25">
              U
            </div>
          </div>
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
