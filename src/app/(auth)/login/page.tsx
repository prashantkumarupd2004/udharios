'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const IS_DEV = process.env.NODE_ENV === 'development'

type Lang = 'hi' | 'en'

const copy = {
  hi: {
    tagline: 'Aapka collection assistant',
    phoneLabel: 'Apna mobile number daalo',
    sendBtn: IS_DEV ? '🔓 Dev Login (OTP Skip)' : 'OTP Bhejo',
    sendingBtn: 'Loading…',
    terms: 'Login karke aap hamare Terms aur Privacy Policy se agree karte hain',
    switchLang: 'Switch to English',
    errors: {
      invalid_phone: '10 digit ka valid Indian number daalo (6-9 se shuru)',
      failed: 'Kuch gadbad hui. Dobara try karo.',
    },
  },
  en: {
    tagline: 'Your collection assistant',
    phoneLabel: 'Enter your mobile number',
    sendBtn: IS_DEV ? '🔓 Dev Login (Skip OTP)' : 'Send OTP',
    sendingBtn: 'Loading…',
    terms: 'By logging in, you agree to our Terms and Privacy Policy',
    switchLang: 'हिंदी में देखें',
    errors: {
      invalid_phone: 'Enter valid 10-digit Indian number (starts 6-9)',
      failed: 'Something went wrong. Try again.',
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

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (phone.length !== 10 || !/^[6-9]/.test(phone)) {
      setError(t.errors.invalid_phone)
      return
    }

    setLoading(true)
    try {
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

      // Production: go to OTP step (will be built later)
      router.push(`/login/otp?phone=${phone}`)
    } catch {
      setError(t.errors.failed)
    } finally {
      setLoading(false)
    }
  }, [phone, t, router])

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',system-ui,sans-serif}
    .lb{min-height:100svh;background:#030712;display:flex;align-items:center;justify-content:center;padding:16px;position:relative;overflow:hidden}
    .orb{position:absolute;border-radius:9999px;filter:blur(80px);pointer-events:none}
    .o1{width:420px;height:420px;top:-100px;left:8%;background:rgba(99,102,241,.18)}
    .o2{width:340px;height:340px;bottom:-80px;right:6%;background:rgba(139,92,246,.14)}
    .card{width:100%;max-width:400px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:22px;padding:36px 28px;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 25px 60px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08);position:relative;z-index:1}
    .logo{width:62px;height:62px;background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 14px;box-shadow:0 8px 24px rgba(99,102,241,.4)}
    h1.brand{font-size:1.5rem;font-weight:700;text-align:center;background:linear-gradient(135deg,#a5b4fc,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .sub{text-align:center;color:#6b7280;font-size:.84rem;margin:4px 0 28px}
    .lbl{display:block;color:#9ca3af;font-size:.78rem;margin-bottom:8px;font-weight:500}
    .pw{display:flex}
    .pre{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-right:none;border-radius:12px 0 0 12px;padding:0 14px;display:flex;align-items:center;color:#9ca3af;font-size:.95rem;font-weight:500;white-space:nowrap}
    .pi{flex:1;width:0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:0 12px 12px 0;padding:14px 16px;color:#fff;font-size:1.1rem;letter-spacing:.05em;outline:none;transition:border-color .2s;font-family:inherit}
    .pi::placeholder{color:#374151}.pi:focus{border-color:#6366f1}
    .btn{width:100%;background:linear-gradient(135deg,#4f46e5,#6d28d9);color:#fff;border:none;border-radius:12px;padding:14px;font-size:.95rem;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .2s,transform .15s;box-shadow:0 4px 16px rgba(99,102,241,.35);margin-top:12px}
    .btn:hover:not(:disabled){opacity:.85;transform:translateY(-1px)}.btn:active:not(:disabled){transform:translateY(0)}
    .btn:disabled{background:rgba(99,102,241,.18);color:#6366f1;box-shadow:none;cursor:not-allowed}
    .dev-badge{display:inline-block;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.3);color:#fbbf24;font-size:.7rem;font-weight:600;padding:3px 8px;border-radius:6px;margin-bottom:16px;letter-spacing:.04em}
    .err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.22);border-radius:10px;padding:10px 14px;color:#f87171;font-size:.82rem;margin-top:10px}
    .ghost{background:none;border:none;color:#6b7280;font-size:.78rem;cursor:pointer;padding:6px 0;transition:color .2s;font-family:inherit}
    .ghost:hover{color:#e5e7eb}
    .lr{text-align:center;margin-top:20px}
    .terms{text-align:center;color:#374151;font-size:.72rem;margin-top:8px}
    @media(max-width:420px){.card{padding:24px 16px}}
  `

  return (
    <>
      <style>{css}</style>
      <div className="lb">
        <div className="orb o1" /><div className="orb o2" />
        <div className="card">
          <div className="logo">💰</div>
          <h1 className="brand">Udhari OS</h1>
          <p className="sub">{t.tagline}</p>

          {IS_DEV && (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <span className="dev-badge">⚡ DEV MODE — OTP bypassed</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <label htmlFor="phone" className="lbl">{t.phoneLabel}</label>
            <div className="pw">
              <span className="pre">🇮🇳 +91</span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                className="pi"
                maxLength={10}
                autoFocus
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
              />
            </div>

            {error && <div className="err" role="alert">{error}</div>}

            <button
              type="submit"
              id="login-btn"
              className="btn"
              disabled={loading || phone.length !== 10}
            >
              {loading ? t.sendingBtn : t.sendBtn}
            </button>
          </form>

          <div className="lr">
            <button className="ghost" onClick={() => setLang(l => l === 'hi' ? 'en' : 'hi')}>
              {t.switchLang}
            </button>
          </div>
          <p className="terms">{t.terms}</p>
        </div>
      </div>
    </>
  )
}
