'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { hi } from '@/i18n/hi'
import { en } from '@/i18n/en'

type Language = 'hi' | 'en'
type Strings = typeof hi

const STORAGE_KEY = 'udharios-lang'

interface LanguageContextValue {
  lang: Language
  t: Strings
  toggleLang: () => void
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'hi',
  t: hi,
  toggleLang: () => {},
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Default: Hinglish ('hi') — hi.ts ke hisaab se yehi default language hai
  const [lang, setLang] = useState<Language>('hi')

  // Saved choice client par load karo (SSR hydration mismatch se bachne ke liye effect me)
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'hi') setLang(saved)
  }, [])

  const toggleLang = () => {
    setLang(prev => {
      const next: Language = prev === 'hi' ? 'en' : 'hi'
      window.localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }

  return (
    <LanguageContext.Provider
      value={{ lang, t: lang === 'hi' ? hi : (en as unknown as Strings), toggleLang }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
