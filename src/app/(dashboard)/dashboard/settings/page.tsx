'use client'

import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Store, MoonStar, Languages, LogOut, Crown } from 'lucide-react'
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
    return <div className="space-y-4 max-w-2xl">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-16" />)}</div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold text-stone-900 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-orange-600" />
          {lang === 'hi' ? 'Settings' : 'Settings'}
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">
          {lang === 'hi' ? 'Dukaan aur system ki setting' : 'Shop and system preferences'}
        </p>
      </div>

      {/* Plan info */}
      <div className={`glass-card p-5 flex items-center justify-between ${
        settings?.plan === 'pro' ? '!border-orange-300 bg-gradient-to-br from-orange-50 to-white' : '!border-amber-300 bg-gradient-to-br from-amber-50 to-white'
      }`}>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md shadow-orange-500/30">
            <Crown className="w-5 h-5 text-white" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500">{lang === 'hi' ? 'Current Plan' : 'Current Plan'}</p>
            <p className="font-extrabold text-stone-900 capitalize text-lg">
              {settings?.plan}
              {settings?.plan === 'trial' && settings.trialEndsAt && (
                <span className="text-xs font-semibold text-stone-500 ml-2">
                  ({lang === 'hi' ? 'expires' : 'expires'} {new Date(settings.trialEndsAt).toLocaleDateString('en-IN')})
                </span>
              )}
            </p>
          </div>
        </div>
        <a href="/dashboard/billing" className="btn-primary px-4 py-2.5 text-sm">
          {lang === 'hi' ? 'Upgrade Karo' : 'Upgrade'}
        </a>
      </div>

      {/* Business settings */}
      <div className="glass-card p-5 space-y-4">
        <h2 className="font-bold text-stone-900 flex items-center gap-2">
          <Store className="w-4 h-4 text-orange-600" />
          {lang === 'hi' ? 'Business Details' : 'Business Details'}
        </h2>

        <div>
          <label className="field-label">{lang === 'hi' ? 'Business naam' : 'Business name'}</label>
          <input
            value={form.businessName}
            onChange={e => setForm(p => ({ ...p, businessName: e.target.value }))}
            className="field"
          />
        </div>

        <div>
          <label className="field-label">{lang === 'hi' ? 'UPI ID / VPA' : 'UPI ID / VPA'}</label>
          <input
            value={form.upiVpa}
            onChange={e => setForm(p => ({ ...p, upiVpa: e.target.value }))}
            placeholder="merchant@upi"
            className="field"
          />
          <p className="text-xs text-stone-400 mt-1">
            {lang === 'hi' ? 'Payment links me auto-fill hoga' : 'Auto-filled in payment links'}
          </p>
        </div>
      </div>

      {/* Quiet hours */}
      <div className="glass-card p-5 space-y-4">
        <h2 className="font-bold text-stone-900 flex items-center gap-2">
          <MoonStar className="w-4 h-4 text-indigo-500" />
          {lang === 'hi' ? 'Quiet Hours' : 'Quiet Hours'}
          <span className="text-[11px] font-semibold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
            {lang === 'hi' ? 'koi reminder nahi' : 'no reminders'}
          </span>
        </h2>
        <p className="text-xs text-stone-500">
          {lang === 'hi'
            ? 'In ghanton mein koi WhatsApp message ya call nahi jayega'
            : 'No WhatsApp messages or calls will be sent during these hours'}
        </p>
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <label className="field-label">{lang === 'hi' ? 'Shuru' : 'Start'}</label>
            <input
              type="time"
              value={form.quietStart}
              onChange={e => setForm(p => ({ ...p, quietStart: e.target.value }))}
              className="field"
            />
          </div>
          <div className="text-stone-400 font-bold mt-6">→</div>
          <div className="flex-1">
            <label className="field-label">{lang === 'hi' ? 'Khatam' : 'End'}</label>
            <input
              type="time"
              value={form.quietEnd}
              onChange={e => setForm(p => ({ ...p, quietEnd: e.target.value }))}
              className="field"
            />
          </div>
        </div>
      </div>

      {/* Language toggle */}
      <div className="glass-card p-5">
        <h2 className="font-bold text-stone-900 mb-3 flex items-center gap-2">
          <Languages className="w-4 h-4 text-orange-600" />
          {lang === 'hi' ? 'Language' : 'Language'}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-stone-600">
            {lang === 'hi' ? 'हिंग्लिश' : 'English'}
          </span>
          <button
            onClick={toggleLang}
            className={`relative w-14 h-7 rounded-full transition-all ${lang === 'en' ? 'bg-orange-500' : 'bg-stone-200'}`}
            aria-label="Toggle language"
          >
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${lang === 'en' ? 'left-8' : 'left-1'}`} />
          </button>
          <span className="text-sm font-semibold text-stone-600">
            {lang === 'hi' ? 'English' : 'हिंग्लिश'}
          </span>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary px-8 py-3"
          id="save-settings-btn"
        >
          {saving ? '...' : (lang === 'hi' ? 'Save Karo' : 'Save Settings')}
        </button>
        {saved && (
          <span className="text-green-700 text-sm font-bold animate-pulse">
            ✓ {lang === 'hi' ? 'Saved!' : 'Saved!'}
          </span>
        )}
      </div>

      {/* Danger zone */}
      <div className="glass-card p-5 !border-red-200">
        <h2 className="font-bold text-red-700 mb-3">
          ⚠️ {lang === 'hi' ? 'Danger Zone' : 'Danger Zone'}
        </h2>
        <div className="flex items-center justify-between p-4 bg-red-50 border border-red-100 rounded-xl">
          <div>
            <p className="text-sm font-bold text-stone-900">{lang === 'hi' ? 'Logout' : 'Logout'}</p>
            <p className="text-xs text-stone-500">{lang === 'hi' ? 'Is device se logout karein' : 'Sign out from this device'}</p>
          </div>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' })
              window.location.href = '/login'
            }}
            className="bg-white border border-red-200 hover:bg-red-50 text-red-700 px-4 py-2 rounded-xl text-sm font-bold transition-all inline-flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" /> {lang === 'hi' ? 'Logout' : 'Logout'}
          </button>
        </div>
      </div>
    </div>
  )
}
