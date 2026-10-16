'use client'

import { useState } from 'react'
import { X, Share, PlusSquare, Smartphone } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { usePwaInstall } from '@/hooks/usePwaInstall'

/**
 * InstallAppBanner — PWA "app jaisa install" ka UX.
 * - Android/Chrome: native install prompt trigger karta hai
 * - iOS: Share → Add to Home Screen steps wala modal kholta hai
 * - variant="banner": landing page ke liye full card
 * - variant="compact": settings page ke liye chhota button
 */
export default function InstallAppBanner({ variant = 'banner' }: { variant?: 'banner' | 'compact' }) {
  const { lang } = useLanguage()
  const { canInstall, isInstalled, promptInstall, dismiss } = usePwaInstall()
  const [showIosModal, setShowIosModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const hi = lang === 'hi'

  if (isInstalled) {
    if (variant === 'compact') {
      return (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <img src="/icons/icon-192x192.png" alt="Ugaahi" className="w-10 h-10 rounded-xl" />
          <p className="text-sm font-bold text-green-800">
            {hi ? 'App install ho chuki hai ✓' : 'App is already installed ✓'}
          </p>
        </div>
      )
    }
    return null
  }
  if (!canInstall) return null

  const handleInstall = async () => {
    setBusy(true)
    try {
      const outcome = await promptInstall()
      if (outcome === 'ios-instructions') {
        setShowIosModal(true)
      } else if (outcome === 'dismissed') {
        dismiss()
      }
    } finally {
      setBusy(false)
    }
  }

  const iosSteps = [
    {
      icon: <Share className="w-5 h-5 text-green-600" />,
      title: hi ? 'Share button dabao' : 'Tap the Share button',
      desc: hi ? 'Safari me neeche Share icon par tap karo' : 'Tap the Share icon at the bottom in Safari',
    },
    {
      icon: <PlusSquare className="w-5 h-5 text-green-600" />,
      title: hi ? '"Add to Home Screen" chuno' : 'Choose "Add to Home Screen"',
      desc: hi ? 'List me neeche scroll karke ye option tap karo' : 'Scroll down in the list and tap this option',
    },
    {
      icon: <Smartphone className="w-5 h-5 text-green-600" />,
      title: hi ? '"Add" dabao — ho gaya!' : 'Tap "Add" — done!',
      desc: hi ? 'Ugaahi icon home screen par aa jayega' : 'The Ugaahi icon will appear on your home screen',
    },
  ]

  const iosModal = showIosModal && (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={() => setShowIosModal(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-extrabold text-slate-900 text-lg">
            {hi ? 'iPhone par install karein' : 'Install on iPhone'}
          </h3>
          <button
            onClick={() => setShowIosModal(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          {iosSteps.map((s, i) => (
            <div key={i} className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center flex-shrink-0">
                {s.icon}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  <span className="text-green-600 mr-1">{i + 1}.</span> {s.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => { setShowIosModal(false); dismiss() }}
          className="w-full mt-6 py-3 rounded-2xl font-bold text-white bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg shadow-green-500/25"
        >
          {hi ? 'Samajh gaya ✓' : 'Got it ✓'}
        </button>
      </div>
    </div>
  )

  if (variant === 'compact') {
    return (
      <>
        <button
          onClick={handleInstall}
          disabled={busy}
          className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl text-white font-bold text-sm shadow-md shadow-green-500/25 hover:shadow-lg transition-all disabled:opacity-60"
        >
          <img src="/icons/icon-192x192.png" alt="" className="w-10 h-10 rounded-xl bg-white/20" />
          <span className="flex-1 text-left">
            {hi ? '📲 App ki tarah install karein' : '📲 Install like an app'}
            <span className="block text-[11px] font-medium text-white/80">
              {hi ? 'Home screen se seedha kholo, tez chalega' : 'Open from home screen, runs faster'}
            </span>
          </span>
        </button>
        {iosModal}
      </>
    )
  }

  return (
    <>
      <section className="pb-20 sm:pb-28 px-4 sm:px-6 -mt-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-600 via-emerald-600 to-teal-600 p-6 sm:p-8 shadow-2xl shadow-green-900/20">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-amber-300/20 rounded-full blur-[70px] pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 w-56 h-56 bg-white/10 rounded-full blur-[70px] pointer-events-none" />
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
          aria-label={hi ? 'Band karo' : 'Dismiss'}
        >
          <X className="w-5 h-5" />
        </button>
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <img
            src="/icons/icon-192x192.png"
            alt="Ugaahi app icon"
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl shadow-xl ring-2 ring-white/30 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-xl sm:text-2xl font-extrabold text-white tracking-tight mb-1.5">
              {hi ? '📲 Ugaahi App Install Karein' : '📲 Install the Ugaahi App'}
            </h3>
            <p className="text-green-50/90 text-sm leading-relaxed max-w-md">
              {hi
                ? 'Website ko app ki tarah install karo — home screen se ek tap me kholo, full-screen chalega, tez load hoga.'
                : 'Install the website like an app — open it in one tap from your home screen, full-screen, loads faster.'}
            </p>
          </div>
          <button
            onClick={handleInstall}
            disabled={busy}
            className="flex-shrink-0 px-7 py-3.5 rounded-2xl bg-white text-green-700 font-extrabold text-sm shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all disabled:opacity-60 whitespace-nowrap"
          >
            {busy ? (hi ? '...' : '...') : hi ? 'Install Karo' : 'Install Now'}
          </button>
          </div>
          </div>
        </div>
      </section>
      {iosModal}
    </>
  )
}
