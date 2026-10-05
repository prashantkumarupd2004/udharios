'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'

interface MerchantSettings {
  businessName: string
  category: string
  upiVpa: string | null
  quietStart: string
  quietEnd: string
  phone: string
  plan: string
  trialEndsAt: string | null
  isKillSwitched: boolean
}

export default function SettingsPage() {
  const { lang, toggleLang } = useLanguage()
  const [settings, setSettings] = useState<MerchantSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    businessName: '',
    upiVpa: '',
    quietStart: '21:00',
    quietEnd: '09:00',
  })

  useEffect(() => {
    fetch('/api/merchant/settings')
      .then(r => r.json())
      .then(d => {
        setSettings(d.merchant)
        setForm({
          businessName: d.merchant.businessName,
          upiVpa: d.merchant.upiVpa ?? '',
          quietStart: d.merchant.quietStart,
          quietEnd: d.merchant.quietEnd,
        })
        setLoading(false)
      })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    await fetch('/api/merchant/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">
        ⚙️ {lang === 'hi' ? 'Settings' : 'Settings'}
      </h1>

      {/* Plan info */}
      <div className={`glass-card p-4 flex items-center justify-between ${
        settings?.plan === 'pro' ? 'border-indigo-500/30' : 'border-yellow-500/30'
      }`}>
        <div>
          <p className="text-sm text-gray-400">{lang === 'hi' ? 'Current Plan' : 'Current Plan'}</p>
          <p className="font-bold text-white capitalize">{settings?.plan} {settings?.plan === 'trial' && settings.trialEndsAt ? `(${lang === 'hi' ? 'expires' : 'expires'} ${new Date(settings.trialEndsAt).toLocaleDateString('en-IN')})` : ''}</p>
        </div>
        <a
          href="/dashboard/billing"
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all"
        >
          {lang === 'hi' ? 'Upgrade Karo' : 'Upgrade'}
        </a>
      </div>

      {/* Business settings */}
      <div className="glass-card p-5 space-y-4">
        <h2 className="font-semibold text-white">
          {lang === 'hi' ? '🏪 Business Details' : '🏪 Business Details'}
        </h2>

        <div>
          <label className="block text-sm text-gray-400 mb-1">
            {lang === 'hi' ? 'Business naam' : 'Business name'}
          </label>
          <input
            value={form.businessName}
            onChange={e => setForm(p => ({ ...p, businessName: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">
            {lang === 'hi' ? 'UPI ID / VPA' : 'UPI ID / VPA'}
          </label>
          <input
            value={form.upiVpa}
            onChange={e => setForm(p => ({ ...p, upiVpa: e.target.value }))}
            placeholder="merchant@upi"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Quiet hours */}
      <div className="glass-card p-5 space-y-4">
        <h2 className="font-semibold text-white">
          🌙 {lang === 'hi' ? 'Quiet Hours (Koi reminder nahi)' : 'Quiet Hours (No reminders)'}
        </h2>
        <p className="text-xs text-gray-500">
          {lang === 'hi'
            ? 'In ghanton mein koi WhatsApp message ya call nahi jayega'
            : 'No WhatsApp messages or calls will be sent during these hours'}
        </p>
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <label className="text-xs text-gray-500 block mb-1">{lang === 'hi' ? 'Shuru' : 'Start'}</label>
            <input
              type="time"
              value={form.quietStart}
              onChange={e => setForm(p => ({ ...p, quietStart: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="text-gray-600 mt-5">→</div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 block mb-1">{lang === 'hi' ? 'Khatam' : 'End'}</label>
            <input
              type="time"
              value={form.quietEnd}
              onChange={e => setForm(p => ({ ...p, quietEnd: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Language toggle */}
      <div className="glass-card p-5">
        <h2 className="font-semibold text-white mb-3">
          🌐 {lang === 'hi' ? 'Language' : 'Language'}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {lang === 'hi' ? 'Hinglish (Hindi)' : 'English'}
          </span>
          <button
            onClick={toggleLang}
            className={`relative w-12 h-6 rounded-full transition-all ${lang === 'en' ? 'bg-indigo-600' : 'bg-white/20'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${lang === 'en' ? 'left-7' : 'left-1'}`} />
          </button>
          <span className="text-sm text-gray-400">
            {lang === 'hi' ? 'English' : 'Hinglish'}
          </span>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white px-6 py-3 rounded-xl font-semibold transition-all"
          id="save-settings-btn"
        >
          {saving ? '...' : (lang === 'hi' ? 'Save Karo' : 'Save Settings')}
        </button>
        {saved && (
          <span className="text-green-400 text-sm animate-pulse">
            ✓ {lang === 'hi' ? 'Saved!' : 'Saved!'}
          </span>
        )}
      </div>

      {/* Danger zone */}
      <div className="glass-card p-5 border-red-500/20">
        <h2 className="font-semibold text-red-400 mb-3">
          ⚠️ {lang === 'hi' ? 'Danger Zone' : 'Danger Zone'}
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-red-500/5 rounded-xl">
            <div>
              <p className="text-sm text-white">{lang === 'hi' ? 'Logout' : 'Logout'}</p>
              <p className="text-xs text-gray-500">{lang === 'hi' ? 'Is device se logout karein' : 'Sign out from this device'}</p>
            </div>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' })
                window.location.href = '/login'
              }}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-xl text-sm transition-all"
            >
              {lang === 'hi' ? 'Logout' : 'Logout'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
