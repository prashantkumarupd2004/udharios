'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type Lang = 'hi' | 'en'

const copy = {
  hi: {
    title: 'OTP daalo',
    subtitle: '6-digit ka OTP bheja gaya hai',
    verifyBtn: 'Verify karo',
    verifyingBtn: 'Check ho raha hai…',
    resend: 'Dobara bhejo',
    resendIn: (s: number) => `${s} sec me dobara bhej sakte ho`,
    voice: '📞 Call karke OTP suno',
    changeNumber: '← Number badlo',
    errors: {
      incomplete: 'Poora 6-digit OTP daalo',
      wrong_otp: 'Galat OTP hai, dobara try karo',
      otp_expired: 'OTP expire ho gaya — naya mangwao',
      too_many_attempts: 'Bahut try kar liya. Thodi der baad try karo.',
      send_failed: 'OTP bhejne me dikkat. Dobara try karo.',
      failed: 'Kuch gadbad hui. Dobara try karo.',
    },
  },
  en: {
    title: 'Enter OTP',
    subtitle: 'A 6-digit OTP has been sent to',
    verifyBtn: 'Verify',
    verifyingBtn: 'Verifying…',
    resend: 'Resend OTP',
    resendIn: (s: number) => `Resend available in ${s}s`,
    voice: '📞 Hear OTP on a call',
    changeNumber: '← Change number',
    errors: {
      incomplete: 'Enter the complete 6-digit OTP',
      wrong_otp: 'Wrong OTP, try again',
      otp_expired: 'OTP expired — request a new one',
      too_many_attempts: 'Too many attempts. Try after some time.',
      send_failed: 'Could not send OTP. Try again.',
      failed: 'Something went wrong. Try again.',
    },
  },
}

const RESEND_COOLDOWN = 45

function OtpPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') ?? ''

  const [lang, setLang] = useState<Lang>('hi')
  const t = copy[lang]

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN)
  const [failedSends, setFailedSends] = useState(0)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  // No phone → back to login
  useEffect(() => {
    if (!phone || phone.length !== 10) router.replace('/login')
  }, [phone, router])

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  // Autofocus first box
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const handleChange = (idx: number, val: string) => {
    const clean = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx] = clean
    setDigits(next)
    setError('')
    if (clean && idx < 5) inputRefs.current[idx + 1]?.focus()
  }

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = [...digits]
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setDigits(next)
    setError('')
    inputRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const handleVerify = useCallback(async () => {
    const otp = digits.join('')
    if (otp.length !== 6) {
      setError(t.errors.incomplete)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      })
      const data = await res.json()
      if (data.ok) {
        router.push(data.redirectTo ?? '/dashboard')
        return
      }
      setError(t.errors[data.error as keyof typeof t.errors] ?? t.errors.failed)
      if (data.error === 'wrong_otp') {
        setDigits(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
      }
    } catch {
      setError(t.errors.failed)
    } finally {
      setLoading(false)
    }
  }, [digits, phone, router, t])

  // Auto-submit when all 6 digits entered
  useEffect(() => {
    if (digits.every((d) => d !== '') && !loading) {
      const id = setTimeout(() => handleVerify(), 350)
      return () => clearTimeout(id)
    }
  }, [digits, loading, handleVerify])

  const handleResend = async (viaVoice = false) => {
    if (cooldown > 0 || resending) return
    setResending(true)
    setError('')
    try {
      const endpoint = viaVoice ? '/api/auth/otp/retry-voice' : '/api/auth/otp/send'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (data.ok) {
        setCooldown(RESEND_COOLDOWN)
        setDigits(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
      } else {
        setFailedSends((f) => f + 1)
        setError(t.errors.send_failed)
      }
    } catch {
      setError(t.errors.failed)
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm">
        <div className="glass-card p-8">
          {/* Lang toggle */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-white/10"
            >
              {lang === 'hi' ? 'EN' : 'HI'}
            </button>
          </div>

          <div className="text-center mb-2">
            <span className="text-4xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-center text-white mb-1">{t.title}</h1>
          <p className="text-gray-400 text-sm text-center mb-6">
            {t.subtitle} <span className="text-white font-medium amount-display">+91 {phone}</span>
          </p>

          {/* OTP boxes */}
          <div className="flex gap-2 justify-center mb-6" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                aria-label={`Digit ${i + 1}`}
                className="w-12 h-14 text-center text-2xl font-bold bg-white/5 border border-white/15 rounded-xl text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none transition-all amount-display"
              />
            ))}
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold transition-all mb-4"
          >
            {loading ? t.verifyingBtn : t.verifyBtn}
          </button>

          <div className="text-center space-y-2 text-sm">
            {cooldown > 0 ? (
              <p className="text-gray-500">{t.resendIn(cooldown)}</p>
            ) : (
              <button
                onClick={() => handleResend(false)}
                disabled={resending}
                className="text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-50"
              >
                {resending ? t.verifyingBtn : t.resend}
              </button>
            )}
            {failedSends >= 1 && (
              <div>
                <button
                  onClick={() => handleResend(true)}
                  disabled={resending || cooldown > 0}
                  className="text-gray-400 hover:text-gray-200 disabled:opacity-50"
                >
                  {t.voice}
                </button>
              </div>
            )}
            <div>
              <button
                onClick={() => router.push('/login')}
                className="text-gray-500 hover:text-gray-300"
              >
                {t.changeNumber}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OtpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="skeleton w-80 h-96 rounded-2xl" />
        </div>
      }
    >
      <OtpPageInner />
    </Suspense>
  )
}
