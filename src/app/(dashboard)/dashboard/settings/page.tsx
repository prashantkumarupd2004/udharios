'use client'

import { useEffect, useState } from 'react'
import {
  Settings as SettingsIcon, Store, MoonStar, Languages, LogOut, Crown,
  CreditCard, Landmark, Bell, User, Check,
} from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import PaymentGatewaySettings from './PaymentGatewaySettings'

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
  accountHolderName: string | null
  accountNumber: string | null
  bankName: string | null
  ifscCode: string | null
}

type TabId = 'business' | 'payments' | 'reminders' | 'account'

export default function SettingsPage() {
  const { lang, toggleLang } = useLanguage()
  const [settings, setSettings] = useState<MerchantSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<TabId>('business')
  const [form, setForm] = useState({
    businessName: '',
    upiVpa: '',
    quietStart: '21:00',
    quietEnd: '09:00',
    accountHolderName: '',
    accountNumber: '',
    bankName: '',
    ifscCode: '',
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
          accountHolderName: d.merchant.accountHolderName ?? '',
          accountNumber: d.merchant.accountNumber ?? '',
          bankName: d.merchant.bankName ?? '',
          ifscCode: d.merchant.ifscCode ?? '',
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

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'business', label: lang === 'hi' ? 'Business' : 'Business', icon: <Store className="w-4 h-4" /> },
    { id: 'payments', label: lang === 'hi' ? 'Payments' : 'Payments', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'reminders', label: lang === 'hi' ? 'Reminders' : 'Reminders', icon: <Bell className="w-4 h-4" /> },
    { id: 'account', label: lang === 'hi' ? 'Account' : 'Account', icon: <User className="w-4 h-4" /> },
  ]

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="skeleton h-12 rounded-2xl mb-6" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-stone-900 flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md shadow-orange-500/30">
            <SettingsIcon className="w-5 h-5 text-white" />
          </span>
          {lang === 'hi' ? 'Settings' : 'Settings'}
        </h1>
        <p className="text-sm text-stone-500 mt-1 ml-11">
          {lang === 'hi' ? 'Dukaan aur system ki setting' : 'Shop and system preferences'}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-white rounded-2xl border border-stone-200/80 shadow-sm mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[110px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
              tab === t.id
                ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ BUSINESS TAB ============ */}
      {tab === 'business' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
              <Store className="w-5 h-5 text-orange-600" />
              <h2 className="font-extrabold text-stone-900">
                {lang === 'hi' ? 'Business Details' : 'Business Details'}
              </h2>
            </div>
            <div>
              <label className="field-label">{lang === 'hi' ? 'Business naam' : 'Business name'}</label>
              <input
                value={form.businessName}
                onChange={e => setForm(p => ({ ...p, businessName: e.target.value }))}
                className="field"
                placeholder="Meri Dukaan"
              />
            </div>
            <div>
              <label className="field-label">UPI ID / VPA</label>
              <input
                value={form.upiVpa}
                onChange={e => setForm(p => ({ ...p, upiVpa: e.target.value }))}
                placeholder="merchant@upi"
                className="field"
              />
              <p className="text-xs text-stone-400 mt-1.5">
                {lang === 'hi' ? 'Payment links me auto-fill hoga' : 'Auto-filled in payment links'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
              <Landmark className="w-5 h-5 text-blue-600" />
              <h2 className="font-extrabold text-stone-900">
                {lang === 'hi' ? 'Bank Details' : 'Bank Details'}
              </h2>
              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                {lang === 'hi' ? 'bina gateway ke kaam aayega' : 'used without gateway'}
              </span>
            </div>
            <p className="text-xs text-stone-500 -mt-2">
              {lang === 'hi'
                ? 'Agar payment gateway nahi hai to WhatsApp reminder me ye details jayengi'
                : 'If no payment gateway, these details go in WhatsApp reminders'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">{lang === 'hi' ? 'Khata Holder' : 'Account Holder'}</label>
                <input
                  value={form.accountHolderName}
                  onChange={e => setForm(p => ({ ...p, accountHolderName: e.target.value }))}
                  placeholder="Ramesh Kumar"
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">{lang === 'hi' ? 'Khata Number' : 'Account Number'}</label>
                <input
                  value={form.accountNumber}
                  onChange={e => setForm(p => ({ ...p, accountNumber: e.target.value }))}
                  placeholder="1234567890"
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">{lang === 'hi' ? 'Bank' : 'Bank Name'}</label>
                <input
                  value={form.bankName}
                  onChange={e => setForm(p => ({ ...p, bankName: e.target.value }))}
                  placeholder="HDFC Bank"
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">IFSC</label>
                <input
                  value={form.ifscCode}
                  onChange={e => setForm(p => ({ ...p, ifscCode: e.target.value.toUpperCase() }))}
                  placeholder="HDFC0001234"
                  className="field"
                />
              </div>
            </div>
          </div>

          <SaveBar saving={saving} saved={saved} onSave={handleSave} lang={lang} />
        </div>
      )}

      {/* ============ PAYMENTS TAB ============ */}
      {tab === 'payments' && (
        <div className="[&_h2]:!text-base [&_.glass-card]:!bg-white [&_.glass-card]:!rounded-2xl [&_.glass-card]:!border-stone-200/80 [&_.glass-card]:!shadow-sm">
          <PaymentGatewaySettings />
        </div>
      )}

      {/* ============ REMINDERS TAB ============ */}
      {tab === 'reminders' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
              <MoonStar className="w-5 h-5 text-indigo-500" />
              <h2 className="font-extrabold text-stone-900">
                {lang === 'hi' ? 'Quiet Hours' : 'Quiet Hours'}
              </h2>
              <span className="text-[11px] font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
                {lang === 'hi' ? 'koi reminder nahi' : 'no reminders'}
              </span>
            </div>
            <p className="text-xs text-stone-500 -mt-2">
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

          <SaveBar saving={saving} saved={saved} onSave={handleSave} lang={lang} />
        </div>
      )}

      {/* ============ ACCOUNT TAB ============ */}
      {tab === 'account' && (
        <div className="space-y-5">
          {/* Plan */}
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-6 bg-gradient-to-br from-amber-50/60 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md shadow-orange-500/30">
                  <Crown className="w-6 h-6 text-white" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    {lang === 'hi' ? 'Current Plan' : 'Current Plan'}
                  </p>
                  <p className="font-extrabold text-stone-900 capitalize text-xl">
                    {settings?.plan}
                    {settings?.plan === 'trial' && settings.trialEndsAt && (
                      <span className="text-xs font-semibold text-stone-500 ml-2">
                        (expires {new Date(settings.trialEndsAt).toLocaleDateString('en-IN')})
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <a href="/dashboard/billing" className="btn-primary px-5 py-2.5 text-sm">
                {lang === 'hi' ? 'Upgrade' : 'Upgrade'}
              </a>
            </div>
          </div>

          {/* Language */}
          <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100 mb-4">
              <Languages className="w-5 h-5 text-orange-600" />
              <h2 className="font-extrabold text-stone-900">{lang === 'hi' ? 'Language' : 'Language'}</h2>
            </div>
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

          {/* Danger zone */}
          <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6">
            <h2 className="font-extrabold text-red-700 mb-4">⚠️ {lang === 'hi' ? 'Danger Zone' : 'Danger Zone'}</h2>
            <div className="flex items-center justify-between p-4 bg-red-50/60 border border-red-100 rounded-xl">
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
      )}
    </div>
  )
}

function SaveBar({ saving, saved, onSave, lang }: {
  saving: boolean; saved: boolean; onSave: () => void; lang: string
}) {
  return (
    <div className="sticky bottom-4 flex items-center gap-3 bg-white/90 backdrop-blur rounded-2xl border border-stone-200/80 shadow-lg p-3">
      <button onClick={onSave} disabled={saving} className="btn-primary px-8 py-3 flex-1">
        {saving ? '...' : (lang === 'hi' ? 'Save Karo' : 'Save Settings')}
      </button>
      {saved && (
        <span className="text-green-700 text-sm font-bold flex items-center gap-1 pr-2">
          <Check className="w-4 h-4" /> {lang === 'hi' ? 'Saved!' : 'Saved!'}
        </span>
      )}
    </div>
  )
}
