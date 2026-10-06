'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Store, ArrowRight, ArrowLeft, Check, BadgeCheck, Clock, BellRing,
  MessageCircle, Phone, IndianRupee, ShieldCheck, Sparkles, Pencil,
  ChevronRight, Timer, Quote, CreditCard, MoonStar,
} from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'

/* ---------------------------------- data ---------------------------------- */

const CATEGORIES = [
  { value: 'kirana', label: 'Kirana Store', hi: 'किराना स्टोर', desc: 'Daily needs & grocery', icon: Store },
  { value: 'wholesale', label: 'Wholesale', hi: 'थोक व्यापार', desc: 'Bulk goods & supply', icon: CreditCard },
  { value: 'distributor', label: 'Distributor', hi: 'डिस्ट्रीब्यूटर', desc: 'Brands & territory', icon: Phone },
  { value: 'pharmacy', label: 'Pharmacy', hi: 'दवाई की दुकान', desc: 'Medicines & care', icon: BadgeCheck },
  { value: 'hardware', label: 'Hardware', hi: 'हार्डवेयर', desc: 'Tools & materials', icon: ShieldCheck },
  { value: 'general', label: 'General Store', hi: 'जनरल स्टोर', desc: 'Everything else', icon: Sparkles },
]

const STEP_META = [
  { key: 'business', icon: Store },
  { key: 'payments', icon: IndianRupee },
  { key: 'reminders', icon: BellRing },
  { key: 'review', icon: BadgeCheck },
]

const UPI_RE = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/

/* --------------------------------- helpers --------------------------------- */

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** Quiet segments as [startMin, endMin] pairs, handling overnight wrap. */
function quietSegments(start: string, end: string): Array<[number, number]> {
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (s === e) return [[0, 1440]]
  if (s < e) return [[s, e]]
  return [[s, 1440], [0, e]]
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

/* --------------------------------- component -------------------------------- */

export default function OnboardingPage() {
  const { lang } = useLanguage()
  const router = useRouter()
  const hi = lang === 'hi'

  // screen: 0 welcome, 1 business, 2 payments, 3 reminders, 4 review, 5 success
  const [screen, setScreen] = useState(0)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [triedNext, setTriedNext] = useState(false)

  const [form, setForm] = useState({
    businessName: '',
    category: '',
    upiVpa: '',
    quietStart: '21:00',
    quietEnd: '09:00',
  })
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const nameOk = form.businessName.trim().length >= 3
  const catOk = !!form.category
  const upiOk = form.upiVpa.trim() === '' || UPI_RE.test(form.upiVpa.trim())
  const bizName = form.businessName.trim() || (hi ? 'Aapka Business' : 'Your Business')

  const stepIndex = screen >= 1 && screen <= 4 ? screen - 1 : screen === 5 ? 4 : -1

  const nextFromBusiness = () => {
    setTriedNext(true)
    if (nameOk && catOk) { setTriedNext(false); setScreen(2) }
  }
  const nextFromPayments = () => {
    if (upiOk) setScreen(3)
  }

  const handleSubmit = async () => {
    setLoading(true)
    setApiError('')
    try {
      const res = await fetch('/api/merchant/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, upiVpa: form.upiVpa.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setApiError(data.error ?? (hi ? 'Kuch galat ho gaya' : 'Something went wrong'))
        return
      }
      setScreen(5)
    } catch {
      setApiError(hi ? 'Network error — dobara try karein' : 'Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const stepLabel = (i: number) =>
    [
      hi ? 'Business profile' : 'Business profile',
      hi ? 'Payments' : 'Payments',
      hi ? 'Reminders' : 'Reminders',
      hi ? 'Review' : 'Review',
    ][i]

  /* ------------------------------- left panel ------------------------------ */
  const leftPanel = (
    <div className="hidden lg:flex flex-col justify-between w-[42%] max-w-[460px] shrink-0 relative overflow-hidden bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500 text-white p-10">
      <div className="absolute inset-0 pattern-jaali opacity-20" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-amber-300/20 blur-2xl" />

      <div className="relative">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-11 h-11 rounded-2xl bg-white/95 flex items-center justify-center shadow-lg">
            <Store className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <p className="font-extrabold text-xl leading-none">Ugaahi</p>
            <p className="text-orange-100 text-sm mt-1">उधारी वसूली, smart tarike se</p>
          </div>
        </div>

        {/* steps checklist */}
        <div className="space-y-1">
          {STEP_META.map((s, i) => {
            const done = stepIndex > i
            const active = stepIndex === i
            const Icon = s.icon
            return (
              <div key={s.key} className="flex items-center gap-4 py-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  done ? 'bg-white text-orange-600' : active ? 'bg-white/25 text-white ring-2 ring-white/60' : 'bg-white/10 text-orange-100'
                }`}>
                  {done ? <Check className="w-5 h-5" strokeWidth={3} /> : <Icon className="w-5 h-5" />}
                </div>
                <div>
                  <p className={`font-bold text-[15px] ${active || done ? 'text-white' : 'text-orange-100/80'}`}>
                    {stepLabel(i)}
                  </p>
                  <p className="text-orange-100/70 text-xs">
                    {i === 0 && (hi ? 'Dukaan ki pehchaan' : 'Your shop identity')}
                    {i === 1 && (hi ? 'Paise kaise aayenge' : 'How money arrives')}
                    {i === 2 && (hi ? 'Yaad dilane ka time' : 'When to remind')}
                    {i === 3 && (hi ? 'Final check' : 'Final check')}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="relative">
        <div className="bg-white/15 backdrop-blur rounded-2xl p-5 border border-white/20">
          <Quote className="w-6 h-6 text-amber-200 mb-2" />
          <p className="text-[15px] leading-relaxed font-medium">
            {hi
              ? '“Pehle hafte me hi ₹38,000 ka purana udhaar vasool ho gaya — bina ek phone kiye.”'
              : '"₹38,000 of old dues recovered in the first week — without making a single call."'}
          </p>
          <p className="text-orange-100 text-sm mt-3 font-semibold">
            {hi ? '— Ramesh Gupta, Kirana Store, Lucknow' : '— Ramesh Gupta, Kirana Store, Lucknow'}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-5 text-orange-100 text-sm font-medium">
          <ShieldCheck className="w-4 h-4" />
          {hi ? '10,000+ vyapariyon ka bharosa' : 'Trusted by 10,000+ merchants'}
        </div>
      </div>
    </div>
  )

  /* ------------------------------ mobile header ----------------------------- */
  const mobileHeader = (
    <div className="lg:hidden flex items-center justify-between px-5 pt-5 pb-2">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/25">
          <Store className="w-5 h-5 text-white" />
        </div>
        <p className="font-extrabold text-stone-900">Ugaahi</p>
      </div>
      {stepIndex >= 0 && stepIndex < 4 && (
        <p className="text-xs font-bold text-stone-500 bg-white border border-stone-200 rounded-full px-3 py-1.5">
          {hi ? `Step ${stepIndex + 1} / 4` : `Step ${stepIndex + 1} of 4`}
        </p>
      )}
    </div>
  )

  /* ------------------------------ progress bar ------------------------------ */
  const progressBar = stepIndex >= 0 && stepIndex < 4 && (
    <div className="flex gap-2 px-5 sm:px-10 pt-4 lg:pt-10 max-w-2xl w-full mx-auto">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex-1">
          <div className={`h-1.5 rounded-full transition-all duration-500 ${i <= stepIndex ? 'bg-gradient-to-r from-orange-500 to-amber-500' : 'bg-stone-200'}`} />
          <p className={`hidden sm:block text-[11px] font-bold mt-1.5 ${i <= stepIndex ? 'text-orange-700' : 'text-stone-400'}`}>
            {stepLabel(i)}
          </p>
        </div>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-[#FDF9F1] flex flex-col lg:flex-row">
      <div className="absolute top-0 left-0 right-0 tricolor-bar z-10" />
      {leftPanel}

      <div className="flex-1 flex flex-col min-w-0">
        {mobileHeader}
        {progressBar}

        <div className="flex-1 flex items-start lg:items-center justify-center px-5 sm:px-10 py-8 w-full">
          <div className="w-full max-w-2xl">

            {/* ============================ WELCOME ============================ */}
            {screen === 0 && (
              <div className="text-center lg:text-left">
                <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 text-sm font-bold rounded-full px-4 py-2 mb-6">
                  <Sparkles className="w-4 h-4" />
                  {hi ? '14 din FREE trial • Card nahi chahiye' : '14-day FREE trial • No card needed'}
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-stone-900 leading-tight">
                  {hi ? 'Namaste! 🙏' : 'Namaste! 🙏'}<br />
                  {hi ? 'Apni udhaari ko autopilot par daalein' : 'Put your udhaari on autopilot'}
                </h1>
                <p className="text-stone-500 mt-3 text-[15px] leading-relaxed max-w-lg mx-auto lg:mx-0">
                  {hi
                    ? '2 minute me setup karein — uske baad Ugaahi khud yaad dilayega, payment link bhejega aur hisaab rakhega.'
                    : 'Set up in 2 minutes — then Ugaahi reminds, sends payment links and tracks everything on its own.'}
                </p>

                <div className="grid sm:grid-cols-3 gap-3 mt-8 text-left">
                  {[
                    { icon: MessageCircle, t: hi ? 'WhatsApp reminders' : 'WhatsApp reminders', d: hi ? 'Aapke naam se polite messages' : 'Polite messages in your name' },
                    { icon: Phone, t: hi ? 'Hindi AI voice calls' : 'Hindi AI voice calls', d: hi ? 'Bade udhaar ke liye phone call' : 'Calls for bigger dues' },
                    { icon: IndianRupee, t: hi ? 'UPI payment links' : 'UPI payment links', d: hi ? 'Ek tap me paisa seedha account me' : 'One tap, money to your account' },
                  ].map((f) => (
                    <div key={f.t} className="bg-white rounded-2xl border border-orange-100 p-4 shadow-sm">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center mb-3">
                        <f.icon className="w-5 h-5 text-orange-600" />
                      </div>
                      <p className="font-bold text-stone-900 text-sm">{f.t}</p>
                      <p className="text-stone-500 text-xs mt-1 leading-relaxed">{f.d}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
                  <button onClick={() => setScreen(1)} className="btn-primary px-8 py-4 text-base w-full sm:w-auto" id="onboard-start">
                    {hi ? 'Setup shuru karein' : "Let's set up"} <ArrowRight className="w-5 h-5" />
                  </button>
                  <p className="flex items-center gap-1.5 text-stone-400 text-sm font-medium">
                    <Timer className="w-4 h-4" /> {hi ? 'Sirf ~2 minute lagega' : 'Takes ~2 minutes'}
                  </p>
                </div>
              </div>
            )}

            {/* ============================ BUSINESS ============================ */}
            {screen === 1 && (
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900">
                  {hi ? 'Aapki dukaan ka naam kya hai?' : "What's your shop called?"}
                </h2>
                <p className="text-stone-500 mt-2 text-[15px]">
                  {hi ? 'Ye naam reminders aur payment links me dikhega.' : 'This name appears on reminders and payment links.'}
                </p>

                <div className="mt-6">
                  <label className="field-label" htmlFor="business-name-input">
                    {hi ? 'Business ka naam *' : 'Business name *'}
                  </label>
                  <input
                    id="business-name-input"
                    type="text"
                    value={form.businessName}
                    onChange={(e) => set('businessName', e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && nextFromBusiness()}
                    placeholder={hi ? 'e.g. Gupta General Store' : 'e.g. Gupta General Store'}
                    className={`field text-lg py-3.5 ${triedNext && !nameOk ? '!border-red-400 !bg-red-50/50' : ''}`}
                    autoFocus
                    maxLength={60}
                  />
                  {triedNext && !nameOk && (
                    <p className="text-red-600 text-sm font-medium mt-1.5">
                      {hi ? 'Kam se kam 3 akshar likhein' : 'Please enter at least 3 characters'}
                    </p>
                  )}
                </div>

                <div className="mt-6">
                  <label className="field-label !mb-2.5">{hi ? 'Business type chunein *' : 'Choose business type *'}</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {CATEGORIES.map((cat) => {
                      const Icon = cat.icon
                      const active = form.category === cat.value
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => set('category', cat.value)}
                          className={`p-3.5 rounded-2xl border-2 text-left transition-all ${
                            active
                              ? 'bg-orange-50 border-orange-500 shadow-md shadow-orange-500/15'
                              : 'bg-white border-stone-200 hover:border-orange-300 hover:shadow-sm'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${
                            active ? 'bg-orange-500 text-white' : 'bg-stone-100 text-stone-500'
                          }`}>
                            <Icon className="w-[18px] h-[18px]" />
                          </div>
                          <p className={`text-sm font-bold ${active ? 'text-orange-800' : 'text-stone-700'}`}>
                            {hi ? cat.hi : cat.label}
                          </p>
                          <p className="text-[11px] text-stone-400 mt-0.5">{cat.desc}</p>
                        </button>
                      )
                    })}
                  </div>
                  {triedNext && !catOk && (
                    <p className="text-red-600 text-sm font-medium mt-1.5">
                      {hi ? 'Ek business type chunein' : 'Please choose a business type'}
                    </p>
                  )}
                </div>

                {/* live preview */}
                <div className="mt-6 bg-white rounded-2xl border border-stone-200 p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-orange-500/25">
                    <Store className="w-6 h-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wide">
                      {hi ? 'Aise dikhega' : 'Preview'}
                    </p>
                    <p className="font-extrabold text-stone-900 truncate">{bizName}</p>
                    <p className="text-xs text-stone-500">
                      {hi ? 'Reminders isi naam se jayenge' : 'Reminders will go out in this name'}
                    </p>
                  </div>
                  <BadgeCheck className="w-5 h-5 text-green-600 ml-auto flex-shrink-0" />
                </div>

                <button onClick={nextFromBusiness} className="btn-primary w-full py-4 mt-6 text-base" id="onboard-step1-next">
                  {hi ? 'Aage chalein' : 'Continue'} <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* ============================ PAYMENTS ============================ */}
            {screen === 2 && (
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900">
                  {hi ? 'Paise seedha account me 💸' : 'Money straight to your account 💸'}
                </h2>
                <p className="text-stone-500 mt-2 text-[15px]">
                  {hi
                    ? 'Apni UPI ID jodein — har payment link me "Pay" button seedha aapke account me jayega.'
                    : 'Add your UPI ID — every payment link will pay directly into your account.'}
                </p>

                <div className="mt-6">
                  <label className="field-label" htmlFor="upi-vpa-input">
                    {hi ? 'UPI ID / VPA' : 'UPI ID / VPA'} <span className="text-stone-400 font-medium">(optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      id="upi-vpa-input"
                      type="text"
                      value={form.upiVpa}
                      onChange={(e) => set('upiVpa', e.target.value.trimStart())}
                      onKeyDown={(e) => e.key === 'Enter' && nextFromPayments()}
                      placeholder="apnishop@upi"
                      className={`field text-lg py-3.5 pr-12 ${form.upiVpa && !upiOk ? '!border-red-400' : form.upiVpa && upiOk ? '!border-green-400' : ''}`}
                      autoFocus
                      inputMode="email"
                    />
                    {form.upiVpa && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2">
                        {upiOk
                          ? <Check className="w-5 h-5 text-green-600" strokeWidth={3} />
                          : <span className="text-red-500 font-bold">!</span>}
                      </span>
                    )}
                  </div>
                  {form.upiVpa && !upiOk && (
                    <p className="text-red-600 text-sm font-medium mt-1.5">
                      {hi ? 'Sahi format likhein — jaise naam@upi' : 'Enter a valid format — like name@upi'}
                    </p>
                  )}
                </div>

                {/* payment link preview — phone mockup */}
                <div className="mt-6 flex flex-col sm:flex-row gap-5 items-start">
                  <div className="mx-auto sm:mx-0 w-[240px] shrink-0 rounded-[28px] border-[6px] border-stone-800 bg-[#EDE7DA] shadow-xl overflow-hidden">
                    <div className="bg-[#075E54] px-4 py-2.5 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center">
                        <Store className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-white text-xs font-bold leading-none">{bizName}</p>
                        <p className="text-green-200 text-[10px]">online</p>
                      </div>
                    </div>
                    <div className="p-3 space-y-2 min-h-[190px]">
                      <div className="bg-white rounded-xl rounded-tl-sm p-3 shadow-sm max-w-[200px]">
                        <p className="text-[11px] text-stone-700 leading-relaxed">
                          {hi ? 'Namaste 🙏' : 'Namaste 🙏'} <b>{bizName}</b> {hi ? 'se aapka' : '— your'}{' '}
                          <b>₹1,250</b> {hi ? 'ka payment pending hai.' : 'payment is pending.'}
                        </p>
                        <div className="mt-2 bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg text-center py-2">
                          <p className="text-white text-xs font-extrabold">Pay ₹1,250</p>
                        </div>
                        <p className="text-[9px] text-stone-400 mt-1.5 text-center">UPI • Cards • Netbanking</p>
                      </div>
                      <p className="text-[9px] text-stone-400 text-center pt-1">
                        {hi ? 'Customer ko aisa dikhega' : "What your customer sees"}
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 pt-1">
                    {[
                      { t: hi ? 'Zero commission' : 'Zero commission', d: hi ? 'UPI payments par koi katoti nahi' : 'No cuts on UPI payments' },
                      { t: hi ? 'Auto-reconciliation' : 'Auto-reconciliation', d: hi ? 'Payment aate hi udhaari apne aap clear' : 'Dues clear automatically on payment' },
                      { t: hi ? 'Har reminder ke saath' : 'With every reminder', d: hi ? 'WhatsApp aur voice call me link included' : 'Link included in WhatsApp & voice calls' },
                    ].map((b) => (
                      <div key={b.t} className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-3.5 h-3.5 text-green-700" strokeWidth={3} />
                        </span>
                        <div>
                          <p className="font-bold text-stone-900 text-sm">{b.t}</p>
                          <p className="text-stone-500 text-xs mt-0.5">{b.d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setScreen(1)} className="btn-ghost px-5 py-4">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <button onClick={nextFromPayments} disabled={!upiOk} className="btn-primary flex-1 py-4 text-base" id="onboard-step2-next">
                    {form.upiVpa ? (hi ? 'Aage chalein' : 'Continue') : (hi ? 'Abhi skip karein' : 'Skip for now')} <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* ============================ REMINDERS ============================ */}
            {screen === 3 && (
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900">
                  {hi ? 'Reminders kab jayein? 🔔' : 'When should reminders go? 🔔'}
                </h2>
                <p className="text-stone-500 mt-2 text-[15px]">
                  {hi
                    ? 'Quiet hours me koi reminder nahi jayega — grahak se rishta bana rahe.'
                    : 'No reminders during quiet hours — keeps customer relationships healthy.'}
                </p>

                <div className="mt-6 bg-white rounded-2xl border border-stone-200 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <MoonStar className="w-5 h-5 text-indigo-500" />
                    <p className="font-bold text-stone-900">{hi ? 'Quiet hours' : 'Quiet hours'}</p>
                  </div>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-stone-500 mb-1.5 block">{hi ? 'Shuru' : 'From'}</label>
                      <input type="time" value={form.quietStart} onChange={(e) => set('quietStart', e.target.value)} className="field" />
                    </div>
                    <div className="text-stone-300 font-bold pb-3">→</div>
                    <div className="flex-1">
                      <label className="text-xs font-bold text-stone-500 mb-1.5 block">{hi ? 'Tak' : 'To'}</label>
                      <input type="time" value={form.quietEnd} onChange={(e) => set('quietEnd', e.target.value)} className="field" />
                    </div>
                  </div>

                  {/* 24h timeline */}
                  <div className="mt-5">
                    <div className="relative h-9 rounded-xl overflow-hidden bg-gradient-to-r from-orange-400 via-amber-400 to-orange-400">
                      {quietSegments(form.quietStart, form.quietEnd).map(([s, e], i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 bg-slate-700/85"
                          style={{ left: `${(s / 1440) * 100}%`, width: `${((e - s) / 1440) * 100}%` }}
                        />
                      ))}
                      <div className="absolute inset-0 flex justify-between items-end px-1.5 pb-1 pointer-events-none">
                        {['12a', '6a', '12p', '6p', '12a'].map((t, i) => (
                          <span key={i} className="text-[9px] font-bold text-white/90 drop-shadow">{t}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2.5 text-xs font-semibold text-stone-500">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-gradient-to-r from-orange-400 to-amber-400 inline-block" />
                        {hi ? 'Reminders active' : 'Reminders active'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-slate-700 inline-block" />
                        {hi ? `Quiet (${fmtTime(form.quietStart)} – ${fmtTime(form.quietEnd)})` : `Quiet (${fmtTime(form.quietStart)} – ${fmtTime(form.quietEnd)})`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* reminder preview */}
                <div className="mt-4 bg-white rounded-2xl border border-stone-200 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageCircle className="w-5 h-5 text-green-600" />
                    <p className="font-bold text-stone-900 text-sm">{hi ? 'Reminder ka preview' : 'Reminder preview'}</p>
                  </div>
                  <div className="bg-[#EDE7DA] rounded-xl p-3">
                    <div className="bg-white rounded-xl rounded-tl-sm p-3 shadow-sm">
                      <p className="text-[13px] text-stone-700 leading-relaxed">
                        {hi ? 'Namaste 🙏' : 'Namaste 🙏'} <b>{bizName}</b> {hi ? 'se aapka' : '— your'}{' '}
                        <b>₹2,450</b> {hi ? 'ka udhaar 5 din se pending hai. Kripya jald se jald pay karein:' : 'due has been pending for 5 days. Please pay at the earliest:'}
                      </p>
                      <p className="text-[13px] text-orange-600 font-bold mt-1.5 underline">pay.udharios.in/x7k2</p>
                    </div>
                  </div>
                  <p className="text-xs text-stone-400 mt-2">
                    {hi ? 'Tone hamesha polite rahega — sakht shabdon ka option dashboard me milega.' : 'Tone stays polite — stricter options available in the dashboard.'}
                  </p>
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setScreen(2)} className="btn-ghost px-5 py-4">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <button onClick={() => setScreen(4)} className="btn-primary flex-1 py-4 text-base">
                    {hi ? 'Review karein' : 'Review'} <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* ============================ REVIEW ============================ */}
            {screen === 4 && (
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900">
                  {hi ? 'Sab sahi hai? 👀' : 'Everything look right? 👀'}
                </h2>
                <p className="text-stone-500 mt-2 text-[15px]">
                  {hi ? 'Launch se pehle ek nazar daal lein — baad me dashboard se badal sakte hain.' : 'One last check before launch — you can change these later in settings.'}
                </p>

                <div className="mt-6 bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
                  {[
                    { label: hi ? 'Business' : 'Business', value: bizName, sub: hi ? CATEGORIES.find(c => c.value === form.category)?.hi : CATEGORIES.find(c => c.value === form.category)?.label, go: 1 },
                    { label: 'UPI ID', value: form.upiVpa.trim() || (hi ? 'Baad me jodenge' : 'Will add later'), sub: form.upiVpa.trim() ? (hi ? 'Payment links isi par jayenge' : 'Payment links will use this') : undefined, go: 2 },
                    { label: hi ? 'Quiet hours' : 'Quiet hours', value: `${fmtTime(form.quietStart)} – ${fmtTime(form.quietEnd)}`, sub: hi ? 'Is dauraan koi reminder nahi' : 'No reminders during this window', go: 3 },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-4 p-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wide">{row.label}</p>
                        <p className="font-bold text-stone-900 truncate">{row.value}</p>
                        {row.sub && <p className="text-xs text-stone-500 mt-0.5">{row.sub}</p>}
                      </div>
                      <button
                        onClick={() => setScreen(row.go)}
                        className="flex items-center gap-1 text-sm font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg px-3 py-2 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" /> {hi ? 'Badlein' : 'Edit'}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 bg-green-50 border border-green-200 rounded-2xl p-4 flex gap-3">
                  <ShieldCheck className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <p className="text-sm text-green-800 font-medium leading-relaxed">
                    {hi
                      ? 'Launch ke baad 14 din ka free trial shuru hoga. Koi card nahi, kabhi bhi cancel karein.'
                      : 'Your 14-day free trial starts after launch. No card required, cancel anytime.'}
                  </p>
                </div>

                {apiError && (
                  <p className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4 font-medium">{apiError}</p>
                )}

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setScreen(3)} className="btn-ghost px-5 py-4">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1 py-4 text-base" id="onboard-complete-btn">
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        {hi ? 'Setup ho raha hai…' : 'Setting up…'}
                      </span>
                    ) : (
                      <>{hi ? '🚀 Launch karein' : '🚀 Launch my setup'} <ChevronRight className="w-5 h-5" /></>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ============================ SUCCESS ============================ */}
            {screen === 5 && (
              <div className="text-center py-6">
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full bg-green-100 animate-ping opacity-40" />
                  <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-xl shadow-green-500/30">
                    <Check className="w-12 h-12 text-white" strokeWidth={3} />
                  </div>
                </div>
                <h2 className="text-3xl font-extrabold text-stone-900">
                  {hi ? 'Badhai ho! 🎉' : 'You’re all set! 🎉'}
                </h2>
                <p className="text-stone-500 mt-2 max-w-md mx-auto">
                  <b className="text-stone-800">{bizName}</b>{' '}
                  {hi ? 'ab Ugaahi par live hai. Aage kya karna hai:' : 'is now live on Ugaahi. Here’s what’s next:'}
                </p>

                <div className="grid sm:grid-cols-3 gap-3 mt-8 text-left">
                  {[
                    { n: '1', t: hi ? 'Grahak jodein' : 'Add customers', d: hi ? 'Apni udhaari wali list upload karein' : 'Add your list of debtors' },
                    { n: '2', t: hi ? 'Pehla reminder bhejein' : 'Send first reminder', d: hi ? 'Ek click me WhatsApp reminder' : 'One-click WhatsApp reminder' },
                    { n: '3', t: hi ? 'Vasuli track karein' : 'Track collections', d: hi ? 'Kaun pay kar raha hai, live dekhein' : 'Watch who pays, live' },
                  ].map((s) => (
                    <div key={s.n} className="bg-white rounded-2xl border border-orange-100 p-4">
                      <div className="w-8 h-8 rounded-full bg-orange-500 text-white font-extrabold flex items-center justify-center mb-2.5 text-sm">{s.n}</div>
                      <p className="font-bold text-stone-900 text-sm">{s.t}</p>
                      <p className="text-stone-500 text-xs mt-1">{s.d}</p>
                    </div>
                  ))}
                </div>

                <button onClick={() => router.push('/dashboard')} className="btn-primary px-10 py-4 text-base mt-8" id="onboard-goto-dashboard">
                  {hi ? 'Dashboard kholein' : 'Open dashboard'} <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}

          </div>
        </div>

        {/* footer note */}
        {screen < 5 && (
          <p className="text-center text-xs text-stone-400 pb-6 px-5">
            {hi ? '🔒 Aapka data encrypted aur surakshit hai' : '🔒 Your data is encrypted and secure'}
          </p>
        )}
      </div>
    </div>
  )
}
