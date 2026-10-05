'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'

const CATEGORIES = [
  { value: 'kirana', label: 'Kirana Store', icon: '🛒' },
  { value: 'wholesale', label: 'Wholesale', icon: '📦' },
  { value: 'distributor', label: 'Distributor', icon: '🚚' },
  { value: 'pharmacy', label: 'Pharmacy', icon: '💊' },
  { value: 'hardware', label: 'Hardware', icon: '🔧' },
  { value: 'general', label: 'General', icon: '🏪' },
]

export default function OnboardingPage() {
  const { lang } = useLanguage()
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    businessName: '',
    category: '',
    upiVpa: '',
    quietStart: '21:00',
    quietEnd: '09:00',
  })

  const updateForm = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/merchant/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error occurred')
        return
      }
      router.push('/dashboard')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="absolute top-0 left-1/3 w-72 h-72 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🏪</div>
          <h1 className="text-2xl font-bold text-white">
            {lang === 'hi' ? 'Apna business setup karein' : 'Set up your business'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {lang === 'hi' ? `Step ${step} of 3` : `Step ${step} of 3`}
          </p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-all ${s <= step ? 'bg-indigo-500' : 'bg-white/10'}`}
            />
          ))}
        </div>

        <div className="glass-card p-6 space-y-5">
          {step === 1 && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  {lang === 'hi' ? 'Business ka naam' : 'Business name'} *
                </label>
                <input
                  id="business-name-input"
                  type="text"
                  value={form.businessName}
                  onChange={(e) => updateForm('businessName', e.target.value)}
                  placeholder={lang === 'hi' ? 'e.g. Gupta General Store' : 'e.g. Gupta General Store'}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {lang === 'hi' ? 'Business type' : 'Business type'} *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => updateForm('category', cat.value)}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        form.category === cat.value
                          ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      <div className="text-2xl mb-1">{cat.icon}</div>
                      <div className="text-xs">{cat.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!form.businessName || !form.category}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-700 text-white py-3.5 rounded-xl font-semibold transition-all"
                id="onboard-step1-next"
              >
                {lang === 'hi' ? 'Aage Chalein →' : 'Next →'}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  {lang === 'hi' ? 'UPI ID / VPA (optional)' : 'UPI ID / VPA (optional)'}
                </label>
                <input
                  id="upi-vpa-input"
                  type="text"
                  value={form.upiVpa}
                  onChange={(e) => updateForm('upiVpa', e.target.value)}
                  placeholder="merchant@upi"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <p className="text-xs text-gray-600 mt-1">
                  {lang === 'hi'
                    ? 'Payment links mein pre-fill hoga'
                    : 'Will be pre-filled in payment links'}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 bg-white/10 hover:bg-white/15 text-white py-3.5 rounded-xl font-semibold transition-all"
                >
                  ← {lang === 'hi' ? 'Wapas' : 'Back'}
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-xl font-semibold transition-all"
                  id="onboard-step2-next"
                >
                  {lang === 'hi' ? 'Aage →' : 'Next →'}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  {lang === 'hi' ? 'Quiet Hours (reminders band rahenge)' : 'Quiet Hours (no reminders sent)'}
                </label>
                <p className="text-xs text-gray-600 mb-3">
                  {lang === 'hi'
                    ? 'Default: 9 PM se 9 AM tak koi reminder nahi'
                    : 'Default: No reminders from 9 PM to 9 AM'}
                </p>
                <div className="flex gap-3 items-center">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">
                      {lang === 'hi' ? 'Start' : 'Start'}
                    </label>
                    <input
                      type="time"
                      value={form.quietStart}
                      onChange={(e) => updateForm('quietStart', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="text-gray-600 mt-5">→</div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">
                      {lang === 'hi' ? 'End' : 'End'}
                    </label>
                    <input
                      type="time"
                      value={form.quietEnd}
                      onChange={(e) => updateForm('quietEnd', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-white/10 hover:bg-white/15 text-white py-3.5 rounded-xl font-semibold transition-all"
                >
                  ← {lang === 'hi' ? 'Wapas' : 'Back'}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white py-3.5 rounded-xl font-semibold transition-all"
                  id="onboard-complete-btn"
                >
                  {loading
                    ? (lang === 'hi' ? 'Saving...' : 'Saving...')
                    : (lang === 'hi' ? 'Shuru Karein! 🚀' : 'Let\'s Go! 🚀')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
