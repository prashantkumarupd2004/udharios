'use client'

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { hi } from '@/i18n/hi'
import { en } from '@/i18n/en'

type Language = 'hi' | 'en'
type Strings = typeof hi

interface LanguageContextValue {
  lang: Language
  t: Strings
  toggleLang: () => void
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  t: en as unknown as Strings,
  toggleLang: () => {},
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('en')

  const toggleLang = () => setLang(prev => (prev === 'hi' ? 'en' : 'hi'))

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
