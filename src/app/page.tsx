'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import {
  MessageCircle,
  Phone,
  CreditCard,
  Zap,
  BarChart3,
  ShieldCheck,
  IndianRupee,
  ArrowRight,
  Play,
  Check,
  ChevronDown,
  Menu,
  X,
  Bell,
  Clock,
  TrendingUp,
  Wallet,
  Sparkles,
  Store,
} from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import SiteFooter from '@/components/SiteFooter'

/* ── Scroll reveal wrapper ─────────────────────────────────────────── */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold: 0.12 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/* ── Brand logo ────────────────────────────────────────────────────── */
function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'w-11 h-11' : 'w-9 h-9'
  const icon = size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'
  return (
    <div className="flex items-center gap-2.5">
      <div className={`${box} rounded-xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/30`}>
        <IndianRupee className={`${icon} text-white`} strokeWidth={2.5} />
      </div>
      <div className="leading-none">
        <span className="font-extrabold text-xl tracking-tight text-stone-900">
          Udhari <span className="gradient-text">OS</span>
        </span>
        <p className="text-[10px] font-semibold tracking-[0.22em] text-orange-700/80 mt-0.5">उधारी वसूली</p>
      </div>
    </div>
  )
}

/* ── Light dashboard mockup for hero ───────────────────────────────── */
function DashboardMockup({ lang }: { lang: 'hi' | 'en' }) {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-gradient-to-r from-orange-400/25 via-amber-400/20 to-green-500/15 rounded-[2rem] blur-2xl" />
      <div className="relative bg-white rounded-2xl p-5 sm:p-6 shadow-2xl shadow-orange-900/10 border border-orange-100 floaty">
        {/* window bar */}
        <div className="flex items-center gap-2 mb-5">
          <span className="w-3 h-3 rounded-full bg-red-400" />
          <span className="w-3 h-3 rounded-full bg-amber-400" />
          <span className="w-3 h-3 rounded-full bg-green-500" />
          <span className="ml-3 text-xs text-stone-400 font-medium">udhari.app/dashboard</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: lang === 'hi' ? 'Kul Udhaari' : 'Outstanding', value: '₹4.2L', tone: 'text-stone-900', bg: 'bg-orange-50 border-orange-100' },
            { label: lang === 'hi' ? 'Is Hafte Vasool' : 'Collected', value: '₹1.1L', tone: 'text-green-700', bg: 'bg-green-50 border-green-100' },
            { label: lang === 'hi' ? 'Overdue' : 'Overdue', value: '₹86K', tone: 'text-red-600', bg: 'bg-red-50 border-red-100' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} border rounded-xl p-3`}>
              <p className={`text-lg sm:text-xl font-bold amount-display ${s.tone}`}>{s.value}</p>
              <p className="text-[11px] text-stone-500 mt-0.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* reminder timeline mini */}
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-stone-700">Gupta General Store — ₹50,000</p>
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              {lang === 'hi' ? 'Day 5' : 'Day 5'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {[
              { done: true, icon: MessageCircle },
              { done: true, icon: MessageCircle },
              { done: true, icon: CreditCard },
              { done: false, icon: Phone },
              { done: false, icon: Bell },
            ].map((st, i) => (
              <div key={i} className="flex items-center flex-1 last:flex-none">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                    st.done
                      ? 'bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-500/30'
                      : 'bg-white border-stone-200 text-stone-300'
                  }`}
                >
                  {st.done ? <Check className="w-4 h-4" strokeWidth={3} /> : <st.icon className="w-4 h-4" />}
                </div>
                {i < 4 && <div className={`h-0.5 flex-1 mx-1 rounded ${st.done ? 'bg-orange-400' : 'bg-stone-200'}`} />}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-stone-400 font-medium">
            <span>Day 1</span><span>Day 3</span><span>Day 5</span><span>Day 7</span><span>Day 15</span>
          </div>
        </div>

        {/* payment notification */}
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3.5">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-green-500/30">
            <Check className="w-5 h-5 text-white" strokeWidth={3} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-green-800">
              {lang === 'hi' ? '₹25,000 vasool ho gaya ✓' : '₹25,000 collected ✓'}
            </p>
            <p className="text-xs text-stone-500 truncate">
              {lang === 'hi' ? 'Sharma Kirana — reminders auto-stop' : 'Sharma Kirana — reminders auto-stopped'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════ PAGE ═══════════════════════════════════ */
export default function LandingPage() {
  const { t, lang, toggleLang } = useLanguage()
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)

  const features = [
    {
      icon: MessageCircle,
      title: 'Staged WhatsApp Reminders',
      desc: lang === 'hi'
        ? 'Day 1 polite, Day 3 payment link, Day 5 firm, Day 14 final notice — Hindi templates, auto-personalized.'
        : 'Day 1 polite, Day 3 payment link, Day 5 firm, Day 14 final notice — Hindi templates, auto-personalized.',
      tint: 'bg-green-50 text-green-600 border-green-100',
    },
    {
      icon: Phone,
      title: lang === 'hi' ? 'AI Voice Calls (Hindi)' : 'AI Voice Calls (Hindi)',
      desc: lang === 'hi'
        ? 'System khud call karke Hindi me baat karta hai — date capture, dispute record, transcript save.'
        : 'The system calls and speaks Hindi itself — captures dates, records disputes, saves transcripts.',
      tint: 'bg-orange-50 text-orange-600 border-orange-100',
    },
    {
      icon: CreditCard,
      title: lang === 'hi' ? 'UPI Payment Links' : 'UPI Payment Links',
      desc: lang === 'hi'
        ? 'Har reminder me Razorpay link — customer ek tap me UPI se pay kare. Webhook se auto-reconcile.'
        : 'Razorpay link in every reminder — customer pays via UPI in one tap. Auto-reconciled via webhook.',
      tint: 'bg-amber-50 text-amber-600 border-amber-100',
    },
    {
      icon: Zap,
      title: lang === 'hi' ? 'Payment Pe Auto-Stop' : 'Auto-Stop on Payment',
      desc: lang === 'hi'
        ? 'Paisa aate hi saare future reminders khud band. Koi double-reminder ka embarrassment nahi.'
        : 'All future reminders stop the moment payment arrives. No embarrassing double-reminders.',
      tint: 'bg-yellow-50 text-yellow-600 border-yellow-100',
    },
    {
      icon: BarChart3,
      title: lang === 'hi' ? 'Collection Dashboard' : 'Collection Dashboard',
      desc: lang === 'hi'
        ? 'Kul udhaari, aging buckets (30/60/90 din), defaulter list, collection rate — sab ek screen pe.'
        : 'Total outstanding, aging buckets (30/60/90 days), defaulter list, collection rate — one screen.',
      tint: 'bg-blue-50 text-blue-600 border-blue-100',
    },
    {
      icon: ShieldCheck,
      title: lang === 'hi' ? 'Compliance-First' : 'Compliance-First',
      desc: lang === 'hi'
        ? 'DLT templates, STOP pe instant opt-out, 9AM–9PM window, max 2 touches/din. Professional, kabhi spammy nahi.'
        : 'DLT templates, instant opt-out on STOP, 9AM–9PM window, max 2 touches/day. Professional, never spammy.',
      tint: 'bg-teal-50 text-teal-600 border-teal-100',
    },
  ]

  const timeline = [
    { day: 'Day 1', icon: MessageCircle, label: lang === 'hi' ? 'Polite WhatsApp' : 'Polite WhatsApp', desc: lang === 'hi' ? 'Halki si yaad' : 'Gentle nudge' },
    { day: 'Day 3', icon: CreditCard, label: lang === 'hi' ? 'Reminder + Pay Link' : 'Reminder + Pay Link', desc: lang === 'hi' ? 'UPI link ke saath' : 'With UPI link' },
    { day: 'Day 5', icon: MessageCircle, label: lang === 'hi' ? 'Firm Message' : 'Firm Message', desc: lang === 'hi' ? 'Thoda sakht' : 'Firmer tone' },
    { day: 'Day 7', icon: Phone, label: lang === 'hi' ? 'AI Voice Call' : 'AI Voice Call', desc: lang === 'hi' ? 'Hindi me baat' : 'Hindi conversation' },
    { day: 'Day 10', icon: Phone, label: lang === 'hi' ? 'Call Retry' : 'Call Retry', desc: lang === 'hi' ? 'Dusri koshish' : 'Second attempt' },
    { day: 'Day 14', icon: MessageCircle, label: lang === 'hi' ? 'Final Notice' : 'Final Notice', desc: lang === 'hi' ? 'Antim soochna' : 'Final notice' },
    { day: 'Day 15', icon: Bell, label: lang === 'hi' ? 'Aapko Escalation' : 'Escalation to You', desc: lang === 'hi' ? 'Ab aap sambhalo' : 'Human takeover' },
  ]

  const faqs = [
    {
      q: lang === 'hi' ? 'Kya yeh safe aur legal hai?' : 'Is this safe and legal?',
      a: lang === 'hi'
        ? 'Bilkul. DLT-registered templates, har message me opt-out option, calls sirf subah 9 se raat 9 ke beech, ek customer ko din me max 2 messages. Data India (Mumbai) servers pe store hota hai. Ye professional collection hai — recovery-agent wali dadagiri nahi.'
        : 'Absolutely. DLT-registered templates, opt-out in every message, calls only 9AM–9PM, max 2 touches/customer/day. Data stored on India (Mumbai) servers. This is professional collection — not strong-arm recovery.',
    },
    {
      q: lang === 'hi' ? 'Mere customers bura to nahi maanenge?' : "Won't my customers feel harassed?",
      a: lang === 'hi'
        ? 'Isi liye staged approach hai — pehle polite yaad, phir dheere-dheere firm. Tone hamesha respectful rehta hai, aur payment aate hi sab kuch turant band ho jata hai. Aksar customers kehte hain ki yaad dilaane ke liye shukriya.'
        : "That's why it's staged — polite nudge first, gradually firmer. Tone stays respectful throughout, and everything stops instantly on payment. Customers often thank merchants for the reminder.",
    },
    {
      q: lang === 'hi' ? 'Customer ne STOP bola toh?' : 'What if a customer says STOP?',
      a: lang === 'hi'
        ? 'Turant ek confirmation message jaata hai aur us number pe hamesha ke liye reminders band. Opt-out list ka 100% samman — ye non-negotiable hai.'
        : 'One confirmation goes out immediately and that number is silenced forever. The opt-out list is respected 100% — non-negotiable.',
    },
    {
      q: lang === 'hi' ? 'Setup me kitna time lagega?' : 'How long does setup take?',
      a: lang === 'hi'
        ? '5 minute. Signup → dukaan ka naam + UPI ID → customers add karo (Excel import bhi hai) → bas. Pehla reminder system khud bhej dega.'
        : '5 minutes. Sign up → shop name + UPI ID → add customers (Excel import supported) → done. The system sends the first reminder itself.',
    },
    {
      q: lang === 'hi' ? 'AI voice call me kya hota hai?' : 'What happens on the AI voice call?',
      a: lang === 'hi'
        ? 'Exotel call lagata hai, Sarvam AI Hindi me baat karta hai. Customer date de sakta hai ("shukravaar tak"), dispute raise kar sakta hai, ya turant pay kar sakta hai. Poori baat-cheet transcript me save hoti hai aur aap dashboard pe padh sakte ho.'
        : 'Exotel places the call, Sarvam AI speaks Hindi. The customer can promise a date ("by Friday"), raise a dispute, or pay instantly. The full conversation is saved as a transcript you can read on the dashboard.',
    },
  ]

  return (
    <div className="min-h-screen bg-[#FDF9F1] text-stone-900 overflow-x-clip">
      <div className="tricolor-bar fixed top-0 left-0 right-0 z-[60]" />

      {/* ── Nav ── */}
      <nav className="fixed top-[3px] left-0 right-0 z-50 bg-[#FDF9F1]/85 backdrop-blur-xl border-b border-orange-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="Udhari OS home">
            <Logo />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-stone-600">
            <a href="#features" className="hover:text-orange-600 transition-colors">Features</a>
            <Link href="/services" className="hover:text-orange-600 transition-colors">{lang === 'hi' ? 'Services' : 'Services'}</Link>
            <a href="#journey" className="hover:text-orange-600 transition-colors">{lang === 'hi' ? 'Kaise Kaam Karta Hai' : 'How It Works'}</a>
            <a href="#pricing" className="hover:text-orange-600 transition-colors">{lang === 'hi' ? 'Pricing' : 'Pricing'}</a>
            <a href="#faq" className="hover:text-orange-600 transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleLang}
              className="text-xs font-bold text-stone-600 hover:text-orange-600 px-3 py-2 rounded-lg border border-stone-200 hover:border-orange-300 bg-white transition-all"
            >
              {lang === 'hi' ? 'EN' : 'हिं'}
            </button>
            <Link
              href="/login"
              className="hidden sm:block text-sm font-semibold text-stone-700 hover:text-orange-600 px-4 py-2 rounded-lg hover:bg-orange-50 transition-all"
            >
              {lang === 'hi' ? 'Login' : 'Login'}
            </Link>
            <Link href="/login" className="btn-primary hidden sm:inline-flex text-sm px-5 py-2.5">
              {t.landing.hero.cta} <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={() => setMobileMenu(!mobileMenu)}
              className="md:hidden p-2 text-stone-600 hover:text-orange-600"
              aria-label="Menu"
            >
              {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <div className="md:hidden border-t border-orange-100 px-4 py-4 space-y-1 bg-white/95 backdrop-blur-xl">
            {[
              { href: '#features', label: 'Features' },
              { href: '#journey', label: lang === 'hi' ? 'Kaise Kaam Karta Hai' : 'How It Works' },
              { href: '#pricing', label: lang === 'hi' ? 'Pricing' : 'Pricing' },
              { href: '#faq', label: 'FAQ' },
              { href: '/login', label: lang === 'hi' ? 'Login' : 'Login' },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileMenu(false)}
                className="block px-3 py-2.5 rounded-lg text-stone-700 hover:bg-orange-50 hover:text-orange-700 text-sm font-medium"
              >
                {l.label}
              </a>
            ))}
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 sm:pt-40 pb-16 sm:pb-24 px-4 sm:px-6 pattern-jaali">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[900px] h-[420px] bg-orange-400/15 rounded-full blur-[120px]" />
          <div className="absolute top-40 -left-40 w-96 h-96 bg-amber-400/15 rounded-full blur-[100px]" />
          <div className="absolute top-60 -right-40 w-96 h-96 bg-green-500/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <Reveal>
              <div className="inline-flex items-center gap-2 bg-white text-orange-700 px-4 py-1.5 rounded-full text-[13px] font-semibold mb-6 border border-orange-200 shadow-sm">
                <Sparkles className="w-3.5 h-3.5" />
                {lang === 'hi' ? '14-din free trial — credit card nahi chahiye' : '14-day free trial — no credit card needed'}
              </div>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="text-[2.6rem] leading-[1.08] sm:text-6xl font-extrabold mb-6 tracking-tight text-stone-900">
                {lang === 'hi' ? (
                  <>
                    Udhaari vasool karna,
                    <br />
                    <span className="gradient-text">ab automatic.</span>
                  </>
                ) : (
                  <>
                    Payment collection,
                    <br />
                    <span className="gradient-text">on autopilot.</span>
                  </>
                )}
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="text-lg text-stone-600 mb-8 max-w-lg leading-relaxed">
                {t.landing.hero.subheadline}{' '}
                <span className="text-stone-900 font-semibold">
                  {lang === 'hi'
                    ? 'Phone uthane ki zaroorat hi nahi padegi.'
                    : 'You may never need to pick up the phone again.'}
                </span>
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="flex flex-col sm:flex-row gap-3.5 mb-10">
                <Link href="/login" className="btn-primary px-8 py-4 text-base">
                  {t.landing.hero.cta} <ArrowRight className="w-5 h-5" />
                </Link>
                <a
                  href="#journey"
                  className="btn-ghost px-8 py-4 text-base"
                >
                  <span className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center shadow-md shadow-orange-500/30">
                    <Play className="w-3.5 h-3.5 ml-0.5 text-white" fill="currentColor" />
                  </span>
                  {t.landing.hero.demo}
                </a>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                {[
                  { icon: Clock, big: lang === 'hi' ? '5 min' : '5 min', small: lang === 'hi' ? 'me setup' : 'setup time' },
                  { icon: Zap, big: '24/7', small: lang === 'hi' ? 'automatic chase' : 'automatic chase' },
                  { icon: ShieldCheck, big: '100%', small: lang === 'hi' ? 'opt-out samman' : 'opt-out respected' },
                ].map((s) => (
                  <div key={s.small} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-orange-100 flex items-center justify-center shadow-sm">
                      <s.icon className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="font-bold text-stone-900 leading-none">{s.big}</p>
                      <p className="text-xs text-stone-500 mt-1">{s.small}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={200} className="lg:pl-4">
            <DashboardMockup lang={lang} />
          </Reveal>
        </div>
      </section>

      {/* ── Trust strip ── */}
      <section className="border-y border-orange-100 bg-white py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-stone-400 font-bold mb-6">
            {lang === 'hi' ? 'Bharat ke vyapaariyon ke liye banaya gaya' : 'Built for Bharat’s traders'}
          </p>
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-4 text-stone-600 font-semibold">
            {[
              { icon: '🛒', label: lang === 'hi' ? 'Kirana Stores' : 'Kirana Stores' },
              { icon: '📦', label: lang === 'hi' ? 'Wholesale Distributors' : 'Wholesale Distributors' },
              { icon: '🚚', label: lang === 'hi' ? 'FMCG Suppliers' : 'FMCG Suppliers' },
              { icon: '🔧', label: lang === 'hi' ? 'Hardware Dealers' : 'Hardware Dealers' },
              { icon: '💊', label: lang === 'hi' ? 'Pharma Stockists' : 'Pharma Stockists' },
            ].map((s) => (
              <span key={s.label} className="flex items-center gap-2 text-sm">
                <span className="text-lg">{s.icon}</span> {s.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 sm:py-28 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <p className="eyebrow justify-center mb-3">{lang === 'hi' ? 'Poora System' : 'The Full System'}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 text-stone-900">
              {lang === 'hi' ? 'Ek hi jagah, sab kuch' : 'Everything, in one place'}
            </h2>
            <p className="text-stone-600 text-lg">
              {lang === 'hi'
                ? 'Reminder bhejna, call karna, payment lena, hisaab rakhna — koi alag tool nahi chahiye.'
                : 'Sending reminders, making calls, collecting payments, keeping books — no separate tools needed.'}
            </p>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 90}>
                <div className="glass-card card-hover p-7 h-full group">
                  <div className={`w-12 h-12 rounded-2xl border ${f.tint} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                    <f.icon className="w-6 h-6" strokeWidth={2} />
                  </div>
                  <h3 className="font-bold text-stone-900 text-lg mb-2">{f.title}</h3>
                  <p className="text-stone-600 text-[15px] leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Collection journey timeline ── */}
      <section id="journey" className="py-20 sm:py-28 px-4 sm:px-6 bg-white border-y border-orange-100 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-orange-400/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <p className="eyebrow justify-center mb-3">{lang === 'hi' ? 'Engine Ke Andar' : 'Inside The Engine'}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 text-stone-900">
              {lang === 'hi' ? 'Ek udhaari ki 15-din ki kahani' : 'The 15-day journey of one due'}
            </h2>
            <p className="text-stone-600 text-lg">
              {lang === 'hi'
                ? 'Aapne entry ki — uske baad system ne sab sambhal liya. Dekho kaise:'
                : 'You made the entry — the system handled the rest. Watch how:'}
            </p>
          </Reveal>

          <div className="relative">
            <div className="hidden lg:block absolute top-7 left-[4%] right-[4%] h-0.5 bg-gradient-to-r from-orange-200 via-orange-400 to-orange-200 rounded" />
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
              {timeline.map((st, i) => (
                <Reveal key={st.day} delay={i * 70}>
                  <div className="relative text-center group">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-white border-2 border-orange-200 flex items-center justify-center mb-3 group-hover:border-orange-500 group-hover:shadow-lg group-hover:shadow-orange-500/25 transition-all relative z-10">
                      <st.icon className="w-6 h-6 text-orange-600" />
                    </div>
                    <p className="text-xs font-bold text-orange-700 mb-1">{st.day}</p>
                    <p className="text-sm font-semibold text-stone-900 leading-tight mb-1">{st.label}</p>
                    <p className="text-xs text-stone-500">{st.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          <Reveal delay={200} className="mt-12">
            <div className="glass-card max-w-3xl mx-auto p-6 flex flex-col sm:flex-row items-center gap-5 !border-green-200">
              <div className="w-12 h-12 rounded-2xl bg-green-100 border border-green-200 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-6 h-6 text-green-700" />
              </div>
              <p className="text-stone-700 text-[15px] leading-relaxed text-center sm:text-left">
                {lang === 'hi'
                  ? 'Aur agar beech me kahin bhi payment aa gaya — chahe Day 2 ho ya Day 13 — to saare future steps turant cancel. Customer ko ek extra message tak nahi jayega.'
                  : 'And if payment arrives at any point — Day 2 or Day 13 — all future steps cancel instantly. The customer never gets one extra message.'}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6 pattern-jaali-green">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-14">
            <p className="eyebrow justify-center mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 text-stone-900">{t.landing.pricing.title}</h2>
            <p className="text-stone-600 text-lg">
              {lang === 'hi' ? 'Simple pricing. Koi hidden fees nahi, kabhi bhi cancel karo.' : 'Simple pricing. No hidden fees, cancel anytime.'}
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch max-w-5xl mx-auto">
            {[
              { ...t.landing.pricing.trial, highlight: false },
              { ...t.landing.pricing.starter, highlight: false },
              { ...t.landing.pricing.pro, highlight: true },
            ].map((plan, i) => (
              <Reveal key={plan.name} delay={i * 90} className="h-full">
                <div
                  className={`rounded-2xl p-7 flex flex-col h-full transition-all duration-300 hover:-translate-y-1.5 bg-white ${
                    plan.highlight
                      ? 'border-2 border-orange-500 shadow-2xl shadow-orange-500/20 relative'
                      : 'border border-orange-100 shadow-lg shadow-orange-900/5 hover:border-orange-300'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg whitespace-nowrap">
                      {lang === 'hi' ? '⭐ Sabse Popular' : '⭐ Most Popular'}
                    </div>
                  )}
                  <h3 className="text-lg font-bold text-stone-900 mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-2 mb-6">
                    <span className="text-4xl font-extrabold text-stone-900 amount-display">{plan.price}</span>
                    {'duration' in plan && plan.duration && (
                      <span className="text-sm text-stone-500">/ {plan.duration}</span>
                    )}
                  </div>
                  <ul className="space-y-3 flex-1 mb-8">
                    {plan.features.map((f: string, j: number) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm text-stone-700">
                        <span className="w-5 h-5 rounded-full bg-green-100 border border-green-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-green-700" strokeWidth={3} />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/login"
                    className={`w-full py-3.5 rounded-xl text-center font-bold transition-all flex items-center justify-center gap-2 ${
                      plan.highlight ? 'btn-primary' : 'btn-ghost'
                    }`}
                  >
                    {lang === 'hi' ? 'Shuru Karein' : 'Get Started'} <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={150}>
            <p className="text-center text-sm text-stone-500 mt-8 flex items-center justify-center gap-2">
              <Wallet className="w-4 h-4" />
              {lang === 'hi'
                ? 'WhatsApp/SMS/Call ke operator charges alag se (paise me, actual usage pe)'
                : 'Operator charges for WhatsApp/SMS/calls billed separately (pennies, pay-as-you-go)'}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 sm:py-28 px-4 sm:px-6 bg-white border-y border-orange-100">
        <div className="max-w-3xl mx-auto">
          <Reveal className="text-center mb-12">
            <p className="eyebrow justify-center mb-3">FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-900">
              {lang === 'hi' ? 'Aksar poochhe jaane wale sawaal' : 'Frequently asked questions'}
            </h2>
          </Reveal>
          <div className="space-y-3.5">
            {faqs.map((faq, i) => (
              <Reveal key={i} delay={i * 60}>
                <div className={`glass-card overflow-hidden transition-all ${openFaq === i ? '!border-orange-400' : ''}`}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-orange-50/50 transition-colors"
                    aria-expanded={openFaq === i}
                  >
                    <span className="font-semibold text-[15px] sm:text-base text-stone-900 pr-4">{faq.q}</span>
                    <span className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center transition-all ${openFaq === i ? 'bg-orange-500 border-orange-500 rotate-180' : 'border-stone-300'}`}>
                      <ChevronDown className={`w-4 h-4 ${openFaq === i ? 'text-white' : 'text-stone-500'}`} />
                    </span>
                  </button>
                  <div
                    className={`grid transition-all duration-300 ease-out ${openFaq === i ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-6 pb-6 text-stone-600 text-[15px] leading-relaxed">{faq.a}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 sm:py-32 px-4 sm:px-6 relative overflow-hidden pattern-jaali">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-orange-400/15 rounded-full blur-[120px]" />
        </div>
        <Reveal className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-orange-200 rounded-full px-4 py-1.5 text-sm font-semibold text-stone-600 mb-6 shadow-sm">
            <Store className="w-4 h-4 text-orange-600" />
            {lang === 'hi' ? 'Har din ka delay = paisa atka hua' : 'Every delayed day = money stuck'}
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-5 leading-tight text-stone-900">
            {lang === 'hi' ? (
              <>Aaj ka udhaar, <span className="gradient-text">aaj se automatic.</span></>
            ) : (
              <>Today&apos;s dues, <span className="gradient-text">automatic from today.</span></>
            )}
          </h2>
          <p className="text-stone-600 text-lg mb-10 max-w-xl mx-auto">
            {lang === 'hi'
              ? '14 din free. Koi credit card nahi. 5 minute me setup. Pehla reminder aaj hi jayega.'
              : '14 days free. No credit card. 5-minute setup. Your first reminder goes out today.'}
          </p>
          <Link href="/login" className="btn-primary px-10 py-4 text-lg">
            {t.landing.hero.cta} <ArrowRight className="w-5 h-5" />
          </Link>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <SiteFooter />
    </div>
  )
}
