'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IndianRupee, ArrowRight, Menu, X } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/ugaahi-icon.png"
        alt="Ugaahi logo"
        className="w-9 h-9 rounded-xl shadow-lg shadow-orange-500/20 object-cover"
      />
      <div className="leading-none">
        <span className="font-extrabold text-xl tracking-tight text-stone-900">
          Ugaahi
        </span>
        <p className="text-[10px] font-semibold tracking-[0.22em] text-orange-700/80 mt-0.5">उगाही</p>
      </div>
    </div>
  )
}

export default function SiteNav() {
  const { lang, toggleLang } = useLanguage()
  const [mobileMenu, setMobileMenu] = useState(false)

  const links = [
    { href: '/#features', label: 'Features' },
    { href: '/services', label: lang === 'hi' ? 'Services' : 'Services' },
    { href: '/#pricing', label: lang === 'hi' ? 'Pricing' : 'Pricing' },
    { href: '/#faq', label: 'FAQ' },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#FDF9F1]/85 backdrop-blur-xl border-b border-orange-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" aria-label="Ugaahi home">
          <Logo />
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-stone-600 absolute left-1/2 -translate-x-1/2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-orange-600 transition-colors">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={toggleLang}
            className="text-xs font-bold text-stone-600 hover:text-orange-600 px-3 py-2 rounded-lg border border-stone-200 hover:border-orange-300 bg-white transition-all"
          >
            {lang === 'hi' ? 'EN' : 'हिं'}
          </button>
          <Link
            href="/request-access"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-600 px-5 py-2.5 rounded-xl shadow-md shadow-orange-500/25 hover:shadow-lg transition-all"
          >
            {lang === 'hi' ? 'Shuru Karo' : 'Get Started'} <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            onClick={() => setMobileMenu(!mobileMenu)}
            className="md:hidden p-2 text-stone-600 hover:text-orange-600"
            aria-label="Menu"
          >
            {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {mobileMenu && (
        <div className="md:hidden border-t border-orange-100 px-4 py-4 space-y-1 bg-white/95 backdrop-blur-xl">
          {[...links, { href: '/login', label: lang === 'hi' ? 'Login' : 'Login' }].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMobileMenu(false)}
              className="block px-3 py-2.5 rounded-lg text-stone-700 hover:bg-orange-50 hover:text-orange-700 text-sm font-medium"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}
