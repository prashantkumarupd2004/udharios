'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'

const NAV_ITEMS = [
  { href: '/dashboard', icon: '📊', hiLabel: 'Dashboard', enLabel: 'Dashboard' },
  { href: '/dashboard/customers', icon: '👥', hiLabel: 'Customers', enLabel: 'Customers' },
  { href: '/dashboard/outstandings', icon: '📋', hiLabel: 'Udhaari', enLabel: 'Ledger' },
  { href: '/dashboard/promises', icon: '🤝', hiLabel: 'Promises', enLabel: 'Promises' },
  { href: '/dashboard/activity', icon: '📜', hiLabel: 'Activity', enLabel: 'Activity' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { lang, toggleLang } = useLanguage()

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Desktop sidebar / Mobile top header */}
      <header className="bg-gray-900/80 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">💰</span>
            <span className="font-bold gradient-text text-lg hidden sm:block">Udhari OS</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600/30 text-indigo-300'
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {lang === 'hi' ? item.hiLabel : item.enLabel}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-all"
            >
              {lang === 'hi' ? 'EN' : 'HI'}
            </button>
            <Link
              href="/dashboard/settings"
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"
              aria-label="Settings"
            >
              ⚙️
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 pb-24 md:pb-6">
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
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${
                isActive ? 'text-indigo-400' : 'text-gray-600'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-medium">
                {lang === 'hi' ? item.hiLabel : item.enLabel}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
