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
  IndianRupee,
  Plug,
  ShieldCheck,
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

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <img
        src="/ugaahi-icon.png"
        alt="Ugaahi logo"
        className="w-8 h-8 rounded-lg shadow-md object-cover"
      />
      <span className="font-extrabold text-lg hidden sm:block tracking-tight text-slate-900">
        Ugaahi
      </span>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { lang, toggleLang } = useLanguage()

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="tricolor-bar sticky top-0 z-50" />
      {/* Desktop header — LegAn style: white, thin border, subtle shadow */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-[3px] z-40 shadow-[0_2px_12px_-6px_rgba(0,32,61,0.08)]">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/dashboard" aria-label="Ugaahi dashboard">
            <BrandMark />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-[#00B33F] text-white shadow-md shadow-green-500/25'
                      : 'text-[#00203D] hover:text-[#00B33F] hover:bg-green-50'
                  }`}
                >
                  <item.Icon className="w-4 h-4" />
                  {lang === 'hi' ? item.hiLabel : item.enLabel}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="text-xs font-bold text-slate-600 hover:text-[#00B33F] px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-green-300 bg-white transition-all"
            >
              {lang === 'hi' ? 'EN' : 'हिं'}
            </button>
            <Link
              href="/dashboard/settings"
              className="p-2 text-slate-500 hover:text-[#00B33F] rounded-xl hover:bg-green-50 transition-all"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main content — full width */}
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6">
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="bottom-nav md:hidden flex items-center justify-around py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                isActive ? 'text-[#00B33F]' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <item.Icon className="w-5 h-5" />
              <span className="text-[11px] font-semibold">
                {lang === 'hi' ? item.hiLabel : item.enLabel}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
