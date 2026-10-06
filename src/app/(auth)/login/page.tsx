'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { IndianRupee, ArrowRight, ShieldCheck } from 'lucide-react'

const IS_DEV = process.env.NODE_ENV === 'development'

type Lang = 'hi' | 'en'

const copy = {
  hi: {
    tagline: 'Aapka collection assistant',
    phoneLabel: 'Apna mobile number daalo',
    sendBtn: IS_DEV ? '🔓 Dev Login (OTP Skip)' : 'OTP Bhejo',
    sendingBtn: 'Loading…',
    orContinueWith: 'ya',
    googleBtn: 'Google se Login karo',
    terms: 'Login karke aap hamare Terms aur Privacy Policy se agree karte hain',
    switchLang: 'Switch to English',
    errors: {
      invalid_phone: '10 digit ka valid Indian number daalo (6-9 se shuru)',
      failed: 'Kuch gadbad hui. Dobara try karo.',
      not_approved: 'Ye number abhi approved nahi hai. Pehle access ke liye apply karo — approval ke baad hi login hoga.',
      pending_review: 'Tumhari request review me hai. Approve hote hi login kar paoge.',
      google_failed: 'Google login fail ho gaya. Dobara try karo.',
      google_not_approved: 'Ye Google account approved nahi hai. Pehle access ke liye apply karo.',
    },
  },
  en: {
    tagline: 'Your collection assistant',
    phoneLabel: 'Enter your mobile number',
    sendBtn: IS_DEV ? '🔓 Dev Login (Skip OTP)' : 'Send OTP',
    sendingBtn: 'Loading…',
    orContinueWith: 'or',
    googleBtn: 'Continue with Google',
    terms: 'By logging in, you agree to our Terms and Privacy Policy',
    switchLang: 'हिंदी में देखें',
    errors: {
      invalid_phone: 'Enter valid 10-digit Indian number (starts 6-9)',
      failed: 'Something went wrong. Try again.',
      not_approved: 'This number is not approved yet. Apply for access first — login works only after approval.',
      pending_review: 'Your request is under review. You can log in once approved.',
      google_failed: 'Google login failed. Try again.',
      google_not_approved: 'This Google account is not approved. Apply for access first.',
    },
  },
}

export default function LoginPage() {
  const router = useRouter()
  const [lang, setLang] = useState<Lang>('hi')
  const t = copy[lang]

  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsAccess, setNeedsAccess] = useState(false)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNeedsAccess(false)

    if (phone.length !== 10 || !/^[6-9]/.test(phone)) {
      setError(t.errors.invalid_phone)
      return
    }

    setLoading(true)
    try {
      // Gate: only approved numbers get an OTP
      const checkRes = await fetch('/api/auth/check-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const check = await checkRes.json()
      if (!check.ok || !check.approved) {
        setError(check.hasPendingRequest ? t.errors.pending_review : t.errors.not_approved)
        setNeedsAccess(true)
        return
      }

      // In dev: bypass OTP entirely
      const endpoint = IS_DEV ? '/api/auth/dev-login' : '/api/auth/otp/send'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()

      if (!data.ok) {
        setError(t.errors.failed)
        return
      }

      // Dev bypass returns redirectTo directly
      if (IS_DEV && data.redirectTo) {
        router.push(data.redirectTo)
        return
      }

      // Production: go to OTP step
      router.push(`/login/otp?phone=${phone}`)
    } catch {
      setError(t.errors.failed)
    } finally {
      setLoading(false)
    }
  }, [phone, t, router])

  return (
    <div className="min-h-screen bg-[#FDF9F1] pattern-jaali flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 tricolor-bar" />
      <div className="absolute -top-24 left-1/4 w-96 h-96 bg-orange-400/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-24 right-1/4 w-80 h-80 bg-amber-400/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/ugaahi-icon.png"
            alt="Ugaahi logo"
            className="w-16 h-16 mx-auto rounded-2xl shadow-xl shadow-orange-500/30 mb-4 object-cover"
          />
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">
            Ugaahi
          </h1>
          <p className="text-[11px] font-bold tracking-[0.28em] text-orange-700/70 mt-1">उगाही</p>
          <p className="text-stone-500 text-sm mt-2">{t.tagline}</p>
        </div>

        <div className="bg-white rounded-3xl border border-orange-100 shadow-2xl shadow-orange-900/10 p-8">
          {IS_DEV && (
            <div className="text-center mb-5">
              <span className="inline-block bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">
                ⚡ DEV MODE — OTP bypassed
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <label htmlFor="phone" className="field-label !text-sm">{t.phoneLabel}</label>
            <div className="flex shadow-sm">
              <span className="bg-orange-50 border border-orange-200 border-r-0 rounded-l-xl px-4 flex items-center text-stone-600 text-sm font-bold whitespace-nowrap">
                🇮🇳 +91
              </span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                className="field !rounded-l-none !border-l-0 !text-lg !tracking-wider amount-display"
                maxLength={10}
                autoFocus
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
              />
            </div>

            {error && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-700 text-sm font-medium">
                {error}
                {needsAccess && (
                  <a href="/request-access" className="block mt-2 font-bold text-orange-700 hover:underline">
                    {lang === 'hi' ? '→ Access ke liye apply karo' : '→ Apply for access'}
                  </a>
                )}
              </div>
            )}

            <button
              type="submit"
              id="login-btn"
              className="btn-primary w-full py-4 mt-5 text-base"
              disabled={loading || phone.length !== 10}
            >
              {loading ? t.sendingBtn : t.sendBtn}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>

          {/* Google OAuth login */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="text-xs font-semibold text-stone-400">{t.orContinueWith}</span>
            <div className="flex-1 h-px bg-stone-200" />
          </div>
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-3 w-full py-3.5 rounded-xl border-2 border-stone-200 bg-white text-stone-700 font-bold text-base hover:border-stone-300 hover:bg-stone-50 transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.9z" />
              <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.3 7.5 24 12 24z" />
              <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.5 0 10.2 0 12s.5 3.5 1.4 5.2l3.8-2.8z" />
              <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.7 1.4 6.8l3.8 2.9c1-2.9 3.7-5 6.8-5z" />
            </svg>
            {t.googleBtn}
          </a>

          <div className="mt-6 flex items-center gap-2 justify-center text-xs text-stone-500">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            {lang === 'hi' ? 'OTP se secure login • Data India me safe' : 'Secure OTP login • Data stays in India'}
          </div>

          <p className="text-center text-sm text-stone-600 mt-4">
            {lang === 'hi' ? 'Naye ho? ' : 'New here? '}
            <a href="/request-access" className="font-bold text-orange-600 hover:underline">
              {lang === 'hi' ? 'Access ke liye apply karo' : 'Request access'}
            </a>
          </p>

          <div className="text-center mt-4">
            <button
              onClick={() => setLang(l => l === 'hi' ? 'en' : 'hi')}
              className="text-xs font-semibold text-stone-400 hover:text-orange-600 transition-colors"
            >
              {t.switchLang}
            </button>
          </div>
          <p className="text-center text-stone-400 text-[11px] mt-2 leading-relaxed">{t.terms}</p>
        </div>

        <p className="text-center text-xs text-stone-400 mt-6">
          {lang === 'hi'
            ? 'Kirana stores, wholesalers aur distributors ka bharosa 🇮🇳'
            : 'Trusted by kirana stores, wholesalers & distributors 🇮🇳'}
        </p>
      </div>
    </div>
  )
}
