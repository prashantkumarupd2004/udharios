'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * usePwaInstall — PWA install prompt ko capture karke native install UX deta hai.
 *
 * - `beforeinstallprompt` ko preventDefault karke store karta hai
 * - iOS par (jahan beforeinstallprompt nahi hota) manual steps dikhata hai
 * - Dismissal localStorage me 7 din tak yaad rakhta hai (bar-bar nag nahi)
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallOutcome = 'accepted' | 'dismissed' | 'ios-instructions'

const DISMISS_KEY = 'ugaahi-pwa-dismissed'
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000 // 7 din

function wasDismissedRecently(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = parseInt(raw, 10)
    if (Number.isNaN(ts)) return false
    return Date.now() - ts < DISMISS_MS
  } catch {
    return false
  }
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  // Lazy initializers taaki effect me sync setState na karna pade (SSR-safe bhi)
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false
    const nav = window.navigator as Navigator & { standalone?: boolean }
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
  })
  const [isIos] = useState(
    () => typeof window !== 'undefined' && /iphone|ipad|ipod/i.test(window.navigator.userAgent)
  )
  // Default dismissed=true taaki SSR/first-paint par banner flash na ho
  const [dismissed, setDismissed] = useState(
    () => typeof window === 'undefined' || wasDismissedRecently()
  )

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Android/Chrome: deferredPrompt mila. iOS: hamesha manual steps dikha sakte hain.
  const canInstall = !isInstalled && !dismissed && (!!deferredPrompt || isIos)

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (isIos) return 'ios-instructions'
    if (!deferredPrompt) return 'dismissed'
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (outcome === 'accepted') setIsInstalled(true)
    return outcome
  }, [deferredPrompt, isIos])

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // storage unavailable — bas state me dismiss karo
    }
    setDismissed(true)
  }, [])

  return { canInstall, isInstalled, isIos, promptInstall, dismiss }
}
