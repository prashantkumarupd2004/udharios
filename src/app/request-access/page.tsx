'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/hooks/useLanguage'
import SiteFooter from '@/components/SiteFooter'
import SiteNav from '@/components/SiteNav'
import { ClipboardList, Check, ArrowRight, Loader2, Phone } from 'lucide-react'

const BUSINESS_TYPES = [
  { v: 'kirana', hi: 'Kirana Store', en: 'Kirana Store' },
  { v: 'wholesale', hi: 'Wholesale', en: 'Wholesale' },
  { v: 'distributor', hi: 'Distributor', en: 'Distributor' },
  { v: 'pharmacy', hi: 'Pharmacy', en: 'Pharmacy' },
  { v: 'hardware', hi: 'Hardware', en: 'Hardware' },
  { v: 'textile', hi: 'Textile', en: 'Textile' },
  { v: 'electronics', hi: 'Electronics', en: 'Electronics' },
  { v: 'other', hi: 'Other', en: 'Other' },
]

const VOLUMES = [
  { v: 'under_1L', hi: '₹1L se kam / mahina', en: 'Under ₹1L / month' },
  { v: '1L_5L', hi: '₹1L – ₹5L / mahina', en: '₹1L – ₹5L / month' },
  { v: '5L_25L', hi: '₹5L – ₹25L / mahina', en: '₹5L – ₹25L / month' },
  { v: 'above_25L', hi: '₹25L se zyada / mahina', en: 'Above ₹25L / month' },
]

export default function RequestAccessPage() {
  const { lang } = useLanguage()
  const hi = lang === 'hi'

  const [form, setForm] = useState({
    name: '',
    businessName: '',
    phone: '',
    email: '',
    city: '',
    businessType: '',
    monthlyVolume: '',
    message: '',
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          businessType: form.businessType || undefined,
          monthlyVolume: form.monthlyVolume || undefined,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        const msgs: Record<string, string> = {
          already_pending: hi
            ? 'Is number se pehle hi request bheji ja chuki hai — review me hai.'
            : 'A request from this number is already under review.',
          already_approved: hi
            ? 'Ye number pehle se approved hai — seedha login karo.'
            : 'This number is already approved — just log in.',
          too_many_requests: hi
            ? 'Bahut saari koshishein — kal phir try karo.'
            : 'Too many attempts — try again tomorrow.',
          invalid_input: hi ? 'Form me kuch galat hai — check karo.' : 'Please check the form fields.',
          invalid_phone: hi ? 'Sahi mobile number daalo.' : 'Enter a valid mobile number.',
        }
        setErrorMsg(msgs[data.error] ?? (hi ? 'Kuch galat hua — phir try karo.' : 'Something went wrong — try again.'))
        setStatus('error')
        return
      }
      setStatus('done')
    } catch {
      setErrorMsg(hi ? 'Network error — phir try karo.' : 'Network error — try again.')
      setStatus('error')
    }
  }

  const inputCls =
    'w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 transition-all'

  if (status === 'done') {
    return (
      <div className="min-h-screen bg-[#FDF9F1]">
        <SiteNav />
        <main className="pt-32 sm:pt-40 pb-20 px-4 sm:px-6">
          <div className="max-w-lg mx-auto text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-100 border border-green-200 flex items-center justify-center mb-6">
              <Check className="w-10 h-10 text-green-600" strokeWidth={3} />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-stone-900 tracking-tight mb-4">
              {hi ? 'Request mil gayi! 🎉' : 'Request received! 🎉'}
            </h1>
            <p className="text-stone-600 text-lg leading-relaxed mb-8">
              {hi
                ? 'Hamari team tumhari application review karegi. Approve hote hi tum login karke Ugaahi use kar paoge — 24-48 ghante me update milega.'
                : 'Our team will review your application. Once approved, you can log in and start using Ugaahi — expect an update within 24-48 hours.'}
            </p>
            <Link href="/" className="btn-primary px-8 py-3.5">
              {hi ? 'Home wapas' : 'Back to home'} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FDF9F1]">
      <SiteNav />
      <main className="pt-28 sm:pt-36 pb-20 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-orange-400/15 rounded-full blur-[110px]" />
          <div className="absolute inset-0 pattern-jaali opacity-60" />
        </div>
        <div className="relative max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25 mb-5">
              <ClipboardList className="w-7 h-7 text-white" />
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-stone-900 tracking-tight mb-4">
              {hi ? 'Access ke liye apply karo' : 'Request access'}
            </h1>
            <p className="text-stone-600 text-lg max-w-xl mx-auto">
              {hi
                ? 'Neeche form bharo — hamari team review karke tumhe access degi. Sirf approved merchants login kar sakte hain.'
                : 'Fill the form below — our team will review and grant you access. Only approved merchants can log in.'}
            </p>
          </div>

          <form onSubmit={submit} className="bg-white rounded-3xl border border-orange-100 shadow-xl shadow-orange-900/5 p-6 sm:p-10 space-y-5">
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className="field-label">{hi ? 'Tumhara naam *' : 'Your name *'}</label>
                <input required minLength={2} maxLength={100} value={form.name} onChange={set('name')}
                  placeholder={hi ? 'e.g. Ramesh Gupta' : 'e.g. Ramesh Gupta'} className={inputCls} />
              </div>
              <div>
                <label className="field-label">{hi ? 'Business ka naam *' : 'Business name *'}</label>
                <input required minLength={2} maxLength={100} value={form.businessName} onChange={set('businessName')}
                  placeholder={hi ? 'e.g. Gupta General Store' : 'e.g. Gupta General Store'} className={inputCls} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className="field-label">{hi ? 'Mobile number *' : 'Mobile number *'}</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input required value={form.phone} onChange={set('phone')} inputMode="numeric"
                    placeholder="98765 43210" className={`${inputCls} pl-11`} />
                </div>
                <p className="text-xs text-stone-400 mt-1.5">
                  {hi ? 'Isi number se OTP login hoga (approval ke baad)' : 'OTP login will use this number (after approval)'}
                </p>
              </div>
              <div>
                <label className="field-label">{hi ? 'Email (optional)' : 'Email (optional)'}</label>
                <input type="email" value={form.email} onChange={set('email')}
                  placeholder="you@business.com" className={inputCls} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className="field-label">{hi ? 'Sheher' : 'City'}</label>
                <input value={form.city} onChange={set('city')} maxLength={100}
                  placeholder={hi ? 'e.g. Delhi' : 'e.g. Delhi'} className={inputCls} />
              </div>
              <div>
                <label className="field-label">{hi ? 'Business type' : 'Business type'}</label>
                <select value={form.businessType} onChange={set('businessType')} className={inputCls}>
                  <option value="">{hi ? 'Chuno…' : 'Select…'}</option>
                  {BUSINESS_TYPES.map(b => (
                    <option key={b.v} value={b.v}>{hi ? b.hi : b.en}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="field-label">{hi ? 'Mahine ki udhaari (approx)' : 'Monthly credit given (approx)'}</label>
              <select value={form.monthlyVolume} onChange={set('monthlyVolume')} className={inputCls}>
                <option value="">{hi ? 'Chuno…' : 'Select…'}</option>
                {VOLUMES.map(v => (
                  <option key={v.v} value={v.v}>{hi ? v.hi : v.en}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">{hi ? 'Kuch batana ho to (optional)' : 'Anything else (optional)'}</label>
              <textarea value={form.message} onChange={set('message')} maxLength={1000} rows={3}
                placeholder={hi ? 'e.g. Mere 200+ customers hain, roz udhaar hota hai…' : 'e.g. I have 200+ customers with daily credit…'}
                className={`${inputCls} resize-none`} />
            </div>

            {status === 'error' && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-xl px-4 py-3">
                {errorMsg}
              </div>
            )}

            <button type="submit" disabled={status === 'loading'} className="btn-primary w-full py-4 text-base disabled:opacity-60">
              {status === 'loading' ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> {hi ? 'Bheja ja raha hai…' : 'Submitting…'}</>
              ) : (
                <>{hi ? 'Request bhejo' : 'Submit request'} <ArrowRight className="w-5 h-5" /></>
              )}
            </button>

            <p className="text-center text-sm text-stone-500">
              {hi ? 'Pehle se approved ho?' : 'Already approved?'}{' '}
              <Link href="/login" className="text-orange-600 font-bold hover:underline">
                {hi ? 'Login karo' : 'Log in'}
              </Link>
            </p>
          </form>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
