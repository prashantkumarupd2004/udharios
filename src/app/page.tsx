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
  Star,
  Quote,
  BadgeCheck,
  Mic,
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

/* ── Animated counter ──────────────────────────────────────────────── */
function CountUp({ to, suffix = '', duration = 1400 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [val, setVal] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const t0 = performance.now()
          const tick = (t: number) => {
            const p = Math.min((t - t0) / duration, 1)
            const eased = 1 - Math.pow(1 - p, 3)
            setVal(Math.round(eased * to))
            if (p < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
          obs.disconnect()
        }
      },
      { threshold: 0.4 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [to, duration])

  return (
    <span ref={ref} className="amount-display">
      {val.toLocaleString('en-IN')}{suffix}
    </span>
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
        <span className="font-display font-extrabold text-xl tracking-tight text-stone-900">
          Udhari <span className="gradient-text">OS</span>
        </span>
        <p className="text-[10px] font-semibold tracking-[0.22em] text-orange-700/80 mt-0.5">उधारी वसूली</p>
      </div>
    </div>
  )
}

/* ── Phone mockup: WhatsApp-style reminder chat ────────────────────── */
function PhoneMockup({ lang }: { lang: 'hi' | 'en' }) {
  const hi = lang === 'hi'
  return (
    <div className="relative mx-auto w-[290px] sm:w-[320px]">
      {/* glow */}
      <div className="absolute -inset-8 bg-gradient-to-br from-orange-400/30 via-amber-300/20 to-green-400/20 rounded-[3rem] blur-3xl" />
      {/* phone frame */}
      <div className="relative bg-stone-900 rounded-[2.8rem] p-2.5 shadow-2xl shadow-orange-900/25">
        <div className="bg-[#ECE5DD] rounded-[2.2rem] overflow-hidden">
          {/* notch */}
          <div className="bg-stone-900 h-7 flex items-center justify-center">
            <div className="w-24 h-5 bg-stone-900 rounded-full border border-stone-800" />
          </div>
          {/* chat header */}
          <div className="bg-[#075E54] px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-bold text-sm">
              S
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">Sharma General Store</p>
              <p className="text-green-200/90 text-[11px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-300 rounded-full animate-pulse" />
                {hi ? 'online' : 'online'}
              </p>
            </div>
            <Phone className="w-4 h-4 text-white/80" />
          </div>
          {/* messages */}
          <div className="p-3 space-y-2.5 min-h-[340px] texture-dots">
            <div className="flex justify-center">
              <span className="text-[10px] bg-[#FFF3C4] text-stone-600 px-2.5 py-1 rounded-lg shadow-sm">
                {hi ? 'Aaj' : 'Today'}
              </span>
            </div>
            <div className="max-w-[85%] bg-white rounded-xl rounded-tl-sm p-2.5 shadow-sm">
              <p className="text-[12px] text-stone-800 leading-snug">
                {hi
                  ? 'Namaste Ramesh ji 🙏 Sharma General Store se yaad dila rahe hain — Bill #INV-1023 ka ₹5,400 kal due tha.'
                  : 'Namaste Ramesh ji 🙏 Gentle reminder from Sharma General Store — Bill #INV-1023 of ₹5,400 was due yesterday.'}
              </p>
              <p className="text-[10px] text-stone-400 text-right mt-1">9:00 AM ✓✓</p>
            </div>
            <div className="max-w-[85%] bg-white rounded-xl rounded-tl-sm p-2.5 shadow-sm">
              <p className="text-[12px] text-stone-800 leading-snug">
                {hi ? 'Neeche link se turant UPI payment kar sakte hain 👇' : 'You can pay instantly via UPI using the link below 👇'}
              </p>
              <div className="mt-2 bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg py-2 text-center">
                <p className="text-white text-[12px] font-bold">₹5,400 {hi ? 'Pay Karo' : 'Pay Now'}</p>
              </div>
              <p className="text-[10px] text-stone-400 text-right mt-1">9:00 AM ✓✓</p>
            </div>
            <div className="max-w-[70%] ml-auto bg-[#DCF8C6] rounded-xl rounded-tr-sm p-2.5 shadow-sm">
              <p className="text-[12px] text-stone-800">
                {hi ? 'Dhanyavaad! Abhi pay kar diya 👍' : 'Thanks! Just paid 👍'}
              </p>
              <p className="text-[10px] text-stone-400 text-right mt-1">9:04 AM ✓✓</p>
            </div>
            <div className="flex justify-center pt-1">
              <span className="text-[10px] bg-green-100 text-green-800 border border-green-200 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
                <Check className="w-3 h-3" strokeWidth={3} /> ₹5,400 {hi ? 'vasool ✓' : 'collected ✓'}
              </span>
            </div>
          </div>
          {/* input bar */}
          <div className="bg-[#F0F0F0] px-3 py-2.5 flex items-center gap-2">
            <div className="flex-1 bg-white rounded-full px-4 py-2 text-[12px] text-stone-400">
              {hi ? 'Message' : 'Message'}
            </div>
            <div className="w-9 h-9 rounded-full bg-[#00A884] flex items-center justify-center">
              <Mic className="w-4 h-4 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* floating card: payment received */}
      <div className="absolute -right-6 sm:-right-14 top-16 bg-white rounded-2xl shadow-xl shadow-green-900/10 border border-green-100 p-3.5 flex items-center gap-3 floaty z-10">
        <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shadow-md shadow-green-500/30">
          <Check className="w-5 h-5 text-white" strokeWidth={3} />
        </div>
        <div>
          <p className="text-sm font-extrabold text-green-700 amount-display">₹5,400</p>
          <p className="text-[11px] text-stone-500 font-medium">{hi ? 'Payment mil gaya' : 'Payment received'}</p>
        </div>
      </div>

      {/* floating card: AI call */}
      <div className="absolute -left-6 sm:-left-16 bottom-24 bg-white rounded-2xl shadow-xl shadow-orange-900/10 border border-orange-100 p-3.5 z-10 floaty" style={{ animationDelay: '1.2s' }}>
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
            <Phone className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-stone-900">{hi ? 'AI Voice Call' : 'AI Voice Call'}</p>
            <p className="text-[10px] text-stone-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> 1:24
            </p>
          </div>
        </div>
        <p className="text-[11px] text-stone-600 italic leading-snug max-w-[180px]">
          {hi ? '"Shukravaar tak pakka kar dunga…"' : '"I\'ll definitely pay by Friday…"'}
        </p>
        <p className="text-[10px] text-orange-700 font-bold mt-1.5">→ {hi ? 'Promise captured' : 'Promise captured'}</p>
      </div>
    </div>
  )
}

/* ════════════════════════════ PAGE ═══════════════════════════════════ */
export default function LandingPage() {
  const { t, lang, toggleLang } = useLanguage()
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const hi = lang === 'hi'

  const features = [
    {
      icon: Phone,
      title: hi ? 'AI Voice Calls (Hindi)' : 'AI Voice Calls (Hindi)',
      desc: hi
        ? 'System khud call karke Hindi me baat karta hai — naam, bill, amount bolta hai. Date capture, dispute record, poori transcript save.'
        : 'The system calls and speaks Hindi itself — says the name, bill and amount. Captures dates, records disputes, saves full transcripts.',
      tint: 'bg-orange-50 text-orange-600 border-orange-100',
      span: true,
    },
    {
      icon: MessageCircle,
      title: hi ? 'Staged WhatsApp Reminders' : 'Staged WhatsApp Reminders',
      desc: hi
        ? 'Day 1 polite, Day 3 payment link, Day 5 firm, Day 14 final notice — Hindi templates, auto-personalized.'
        : 'Day 1 polite, Day 3 payment link, Day 5 firm, Day 14 final notice — Hindi templates, auto-personalized.',
      tint: 'bg-green-50 text-green-600 border-green-100',
      span: false,
    },
    {
      icon: CreditCard,
      title: hi ? 'UPI Payment Links' : 'UPI Payment Links',
      desc: hi
        ? 'Har reminder me Razorpay link — customer ek tap me UPI se pay kare. Webhook se auto-reconcile.'
        : 'Razorpay link in every reminder — customer pays via UPI in one tap. Auto-reconciled via webhook.',
      tint: 'bg-amber-50 text-amber-600 border-amber-100',
      span: false,
    },
    {
      icon: Zap,
      title: hi ? 'Payment Pe Auto-Stop' : 'Auto-Stop on Payment',
      desc: hi
        ? 'Paisa aate hi saare future reminders khud band. Koi double-reminder ka embarrassment nahi.'
        : 'All future reminders stop the moment payment arrives. No embarrassing double-reminders.',
      tint: 'bg-yellow-50 text-yellow-600 border-yellow-100',
      span: false,
    },
    {
      icon: BarChart3,
      title: hi ? 'Collection Dashboard' : 'Collection Dashboard',
      desc: hi
        ? 'Kul udhaari, aging buckets (30/60/90 din), defaulter list, collection rate — sab ek screen pe.'
        : 'Total outstanding, aging buckets (30/60/90 days), defaulter list, collection rate — one screen.',
      tint: 'bg-blue-50 text-blue-600 border-blue-100',
      span: false,
    },
    {
      icon: ShieldCheck,
      title: hi ? 'Compliance-First' : 'Compliance-First',
      desc: hi
        ? 'DLT templates, STOP pe instant opt-out, 9AM–9PM window, max 2 touches/din. Professional, kabhi spammy nahi.'
        : 'DLT templates, instant opt-out on STOP, 9AM–9PM window, max 2 touches/day. Professional, never spammy.',
      tint: 'bg-teal-50 text-teal-600 border-teal-100',
      span: false,
    },
  ]

  const timeline = [
    { day: 'Day 1', icon: MessageCircle, label: hi ? 'Polite WhatsApp' : 'Polite WhatsApp', desc: hi ? 'Halki si yaad' : 'Gentle nudge' },
    { day: 'Day 3', icon: CreditCard, label: hi ? 'Reminder + Pay Link' : 'Reminder + Pay Link', desc: hi ? 'UPI link ke saath' : 'With UPI link' },
    { day: 'Day 5', icon: MessageCircle, label: hi ? 'Firm Message' : 'Firm Message', desc: hi ? 'Thoda sakht' : 'Firmer tone' },
    { day: 'Day 7', icon: Phone, label: hi ? 'AI Voice Call' : 'AI Voice Call', desc: hi ? 'Hindi me baat' : 'Hindi conversation' },
    { day: 'Day 10', icon: Phone, label: hi ? 'Call Retry' : 'Call Retry', desc: hi ? 'Dusri koshish' : 'Second attempt' },
    { day: 'Day 14', icon: MessageCircle, label: hi ? 'Final Notice' : 'Final Notice', desc: hi ? 'Antim soochna' : 'Final notice' },
    { day: 'Day 15', icon: Bell, label: hi ? 'Aapko Escalation' : 'Escalation to You', desc: hi ? 'Ab aap sambhalo' : 'Human takeover' },
  ]

  const faqs = [
    {
      q: hi ? 'Kya yeh safe aur legal hai?' : 'Is this safe and legal?',
      a: hi
        ? 'Bilkul. DLT-registered templates, har message me opt-out option, calls sirf subah 9 se raat 9 ke beech, ek customer ko din me max 2 messages. Data India (Mumbai) servers pe store hota hai. Ye professional collection hai — recovery-agent wali dadagiri nahi.'
        : 'Absolutely. DLT-registered templates, opt-out in every message, calls only 9AM–9PM, max 2 touches/customer/day. Data stored on India (Mumbai) servers. This is professional collection — not strong-arm recovery.',
    },
    {
      q: hi ? 'Mere customers bura to nahi maanenge?' : "Won't my customers feel harassed?",
      a: hi
        ? 'Isi liye staged approach hai — pehle polite yaad, phir dheere-dheere firm. Tone hamesha respectful rehta hai, aur payment aate hi sab kuch turant band ho jata hai. Aksar customers kehte hain ki yaad dilaane ke liye shukriya.'
        : "That's why it's staged — polite nudge first, gradually firmer. Tone stays respectful throughout, and everything stops instantly on payment. Customers often thank merchants for the reminder.",
    },
    {
      q: hi ? 'Customer ne STOP bola toh?' : 'What if a customer says STOP?',
      a: hi
        ? 'Turant ek confirmation message jaata hai aur us number pe hamesha ke liye reminders band. Opt-out list ka 100% samman — ye non-negotiable hai.'
        : 'One confirmation goes out immediately and that number is silenced forever. The opt-out list is respected 100% — non-negotiable.',
    },
    {
      q: hi ? 'Setup me kitna time lagega?' : 'How long does setup take?',
      a: hi
        ? '5 minute. Signup → dukaan ka naam + UPI ID → customers add karo (Excel import bhi hai) → bas. Pehla reminder system khud bhej dega.'
        : '5 minutes. Sign up → shop name + UPI ID → add customers (Excel import supported) → done. The system sends the first reminder itself.',
    },
    {
      q: hi ? 'AI voice call me kya hota hai?' : 'What happens on the AI voice call?',
      a: hi
        ? 'Exotel call lagata hai, Sarvam AI Hindi me baat karta hai. Customer date de sakta hai ("shukravaar tak"), dispute raise kar sakta hai, ya turant pay kar sakta hai. Poori baat-cheet transcript me save hoti hai aur aap dashboard pe padh sakte ho.'
        : 'Exotel places the call, Sarvam AI speaks Hindi. The customer can promise a date ("by Friday"), raise a dispute, or pay instantly. The full conversation is saved as a transcript you can read on the dashboard.',
    },
  ]

  const testimonials = [
    {
      quote: hi
        ? 'Pehle roz phone karke yaad dilana padta tha. Ab system khud karta hai — aur rishta bhi bana rehta hai.'
        : 'Earlier I had to call every day to remind. Now the system does it — and relationships stay intact.',
      name: 'Ramesh Gupta',
      role: hi ? 'Kirana Store, Delhi' : 'Kirana Store, Delhi',
      initial: 'R',
      color: 'from-orange-500 to-amber-500',
    },
    {
      quote: hi
        ? 'Day 7 wali AI Hindi call ke baad 3 purane customers ne khud payment kar diya. Transcript padhke maza aa gaya.'
        : 'After the Day-7 AI Hindi call, 3 old customers paid on their own. Reading the transcript was a delight.',
      name: 'Priya Sharma',
      role: hi ? 'Pharma Distributor, Mumbai' : 'Pharma Distributor, Mumbai',
      initial: 'P',
      color: 'from-green-500 to-emerald-500',
    },
    {
      quote: hi
        ? 'UPI link wala WhatsApp message kamaal hai — customer ek tap me pay kar deta hai, mujhe peecha hi nahi karna padta.'
        : 'The WhatsApp message with UPI link is magic — customers pay in one tap, I never have to chase.',
      name: 'Anil Patel',
      role: hi ? 'Electronics, Ahmedabad' : 'Electronics, Ahmedabad',
      initial: 'A',
      color: 'from-blue-500 to-indigo-500',
    },
  ]

  return (
    <div className="min-h-screen bg-[#FDF9F1] text-stone-900 overflow-x-clip">
      {/* ── Announcement bar ── */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 text-white text-center">
        <p className="text-[12px] sm:text-[13px] font-semibold py-2 px-4 flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">
            {hi ? '🎉 Launch offer: 14-din FREE trial — credit card nahi chahiye' : '🎉 Launch offer: 14-day FREE trial — no credit card needed'}
          </span>
        </p>
      </div>

      {/* ── Nav ── */}
      <nav className="fixed top-[33px] sm:top-[37px] left-0 right-0 z-50 bg-[#FDF9F1]/85 backdrop-blur-xl border-b border-orange-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="Udhari OS home">
            <Logo />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-stone-600">
            <a href="#features" className="hover:text-orange-600 transition-colors">Features</a>
            <Link href="/services" className="hover:text-orange-600 transition-colors">{hi ? 'Services' : 'Services'}</Link>
            <a href="#journey" className="hover:text-orange-600 transition-colors">{hi ? 'Kaise Kaam Karta Hai' : 'How It Works'}</a>
            <a href="#pricing" className="hover:text-orange-600 transition-colors">{hi ? 'Pricing' : 'Pricing'}</a>
            <a href="#faq" className="hover:text-orange-600 transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleLang}
              className="text-xs font-bold text-stone-600 hover:text-orange-600 px-3 py-2 rounded-lg border border-stone-200 hover:border-orange-300 bg-white transition-all"
            >
              {hi ? 'EN' : 'हिं'}
            </button>
            <Link
              href="/login"
              className="hidden sm:block text-sm font-semibold text-stone-700 hover:text-orange-600 px-4 py-2 rounded-lg hover:bg-orange-50 transition-all"
            >
              {hi ? 'Login' : 'Login'}
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
              { href: '/services', label: hi ? 'Services' : 'Services' },
              { href: '#journey', label: hi ? 'Kaise Kaam Karta Hai' : 'How It Works' },
              { href: '#pricing', label: hi ? 'Pricing' : 'Pricing' },
              { href: '#faq', label: 'FAQ' },
              { href: '/login', label: hi ? 'Login' : 'Login' },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileMenu(false)}
                className="block px-3 py-2.5 rounded-lg text-stone-700 hover:bg-orange-50 hover:text-orange-700 text-sm font-medium"
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-40 sm:pt-48 pb-20 sm:pb-28 px-4 sm:px-6 overflow-hidden">
        {/* mesh background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-br from-orange-300/40 via-amber-200/30 to-rose-200/30 rounded-full blur-[130px]" />
          <div className="absolute top-64 -left-48 w-[480px] h-[480px] bg-amber-300/25 rounded-full blur-[110px]" />
          <div className="absolute top-80 -right-48 w-[480px] h-[480px] bg-green-300/20 rounded-full blur-[110px]" />
          <div className="absolute inset-0 texture-grain opacity-[0.35]" />
          <div className="absolute inset-0 pattern-jaali opacity-70" />
        </div>

        <div className="relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-14 lg:gap-10 items-center">
          <div>
            <Reveal>
              <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur text-orange-800 pl-1.5 pr-4 py-1.5 rounded-full text-[13px] font-semibold mb-7 border border-orange-200 shadow-sm">
                <span className="bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
                  {hi ? 'NAYA' : 'NEW'}
                </span>
                {hi ? 'Hindi AI voice calls ab live hain 🎙️' : 'Hindi AI voice calls are now live 🎙️'}
              </div>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="font-display text-[2.75rem] leading-[1.05] sm:text-6xl lg:text-[4.2rem] font-extrabold mb-6 tracking-tight text-stone-900">
                {hi ? (
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
              <p className="text-lg sm:text-xl text-stone-600 mb-9 max-w-lg leading-relaxed">
                {t.landing.hero.subheadline}{' '}
                <span className="text-stone-900 font-semibold">
                  {hi ? 'Phone uthane ki zaroorat hi nahi padegi.' : 'You may never need to pick up the phone again.'}
                </span>
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="flex flex-col sm:flex-row gap-3.5 mb-11">
                <Link href="/login" className="btn-primary px-8 py-4 text-base shadow-xl shadow-orange-500/30">
                  {t.landing.hero.cta} <ArrowRight className="w-5 h-5" />
                </Link>
                <a href="#journey" className="btn-ghost px-8 py-4 text-base bg-white/70 backdrop-blur">
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md shadow-orange-500/30">
                    <Play className="w-3.5 h-3.5 ml-0.5 text-white" fill="currentColor" />
                  </span>
                  {t.landing.hero.demo}
                </a>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <div className="flex flex-wrap gap-x-9 gap-y-4">
                {[
                  { icon: Clock, big: hi ? '5 min' : '5 min', small: hi ? 'me setup' : 'setup time' },
                  { icon: Zap, big: '24/7', small: hi ? 'automatic chase' : 'automatic chase' },
                  { icon: ShieldCheck, big: '100%', small: hi ? 'opt-out samman' : 'opt-out respected' },
                ].map((s) => (
                  <div key={s.small} className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-white border border-orange-100 flex items-center justify-center shadow-md shadow-orange-900/5">
                      <s.icon className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="font-display font-bold text-stone-900 leading-none text-lg">{s.big}</p>
                      <p className="text-xs text-stone-500 mt-1">{s.small}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={200} className="lg:pl-6">
            <PhoneMockup lang={lang} />
          </Reveal>
        </div>
      </section>

      {/* ── Marquee strip ── */}
      <section className="border-y border-orange-100 bg-white/70 backdrop-blur py-5 overflow-hidden">
        <div className="flex whitespace-nowrap animate-marquee w-max">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex items-center gap-12 pr-12" aria-hidden={dup === 1}>
              {[
                hi ? 'Kirana Stores' : 'Kirana Stores',
                hi ? 'Wholesale Distributors' : 'Wholesale Distributors',
                hi ? 'FMCG Suppliers' : 'FMCG Suppliers',
                hi ? 'Hardware Dealers' : 'Hardware Dealers',
                hi ? 'Pharma Stockists' : 'Pharma Stockists',
                hi ? 'Textile Traders' : 'Textile Traders',
                hi ? 'Electronics Dealers' : 'Electronics Dealers',
                hi ? 'Auto Parts' : 'Auto Parts',
              ].map((label) => (
                <span key={`${dup}-${label}`} className="flex items-center gap-3 text-stone-500 font-semibold text-sm">
                  <span className="w-2 h-2 rounded-full bg-gradient-to-br from-orange-500 to-amber-500" />
                  {label}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── Stats band (dark) ── */}
      <section className="relative bg-stone-950 py-16 sm:py-20 px-4 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[500px] h-[300px] bg-orange-600/25 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[250px] bg-amber-500/15 rounded-full blur-[100px]" />
          <div className="absolute inset-0 texture-dots-light opacity-60" />
          <div className="absolute inset-0 texture-grain opacity-20" />
        </div>
        <div className="relative max-w-6xl mx-auto">
          <Reveal className="text-center mb-12">
            <p className="text-orange-400 text-xs font-bold tracking-[0.22em] uppercase mb-3">
              {hi ? 'System ki taakat' : 'The system at work'}
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {hi ? 'Numbers me bharosa' : 'Trust, in numbers'}
            </h2>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[
              { to: 3, suffix: '', label: hi ? 'Reminder channels' : 'Reminder channels', sub: 'WhatsApp • SMS • Voice' },
              { to: 15, suffix: '-day', label: hi ? 'Smart journey' : 'Smart journey', sub: hi ? 'Auto-escalation' : 'Auto-escalation' },
              { to: 5, suffix: ' min', label: hi ? 'Setup time' : 'Setup time', sub: hi ? 'Excel import ke saath' : 'With Excel import' },
              { to: 100, suffix: '%', label: hi ? 'Opt-out samman' : 'Opt-out respected', sub: 'STOP = instant stop' },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 90}>
                <div className="rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur p-6 sm:p-8 text-center hover:bg-white/[0.09] hover:border-orange-500/40 transition-all">
                  <p className="font-display text-4xl sm:text-5xl font-extrabold text-white mb-2">
                    <CountUp to={s.to} suffix={s.suffix} />
                  </p>
                  <p className="text-orange-300 font-semibold text-sm">{s.label}</p>
                  <p className="text-stone-400 text-xs mt-1">{s.sub}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features bento ── */}
      <section id="features" className="py-20 sm:py-28 px-4 sm:px-6 relative">
        <div className="absolute inset-0 texture-dots opacity-40 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <p className="eyebrow justify-center mb-4">{hi ? 'Poora System' : 'The Full System'}</p>
            <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 text-stone-900">
              {hi ? 'Ek hi jagah, sab kuch' : 'Everything, in one place'}
            </h2>
            <p className="text-stone-600 text-lg">
              {hi
                ? 'Reminder bhejna, call karna, payment lena, hisaab rakhna — koi alag tool nahi chahiye.'
                : 'Sending reminders, making calls, collecting payments, keeping books — no separate tools needed.'}
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Large card: AI Voice Calls with transcript visual */}
            <Reveal className="md:col-span-2 md:row-span-2">
              <div className="gradient-border h-full p-8 sm:p-10 overflow-hidden relative group hover:shadow-2xl hover:shadow-orange-500/10 transition-all duration-300">
                <div className="absolute -top-24 -right-24 w-72 h-72 bg-orange-400/15 rounded-full blur-[80px] pointer-events-none" />
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 border border-orange-200 flex items-center justify-center mb-6 shadow-lg shadow-orange-500/25 group-hover:scale-110 transition-transform">
                  <Phone className="w-7 h-7 text-white" strokeWidth={2} />
                </div>
                <h3 className="font-display font-bold text-stone-900 text-2xl sm:text-3xl mb-3">
                  {features[0].title}
                </h3>
                <p className="text-stone-600 text-base sm:text-lg leading-relaxed max-w-xl mb-8">{features[0].desc}</p>
                {/* transcript visual */}
                <div className="bg-stone-950 rounded-2xl p-5 sm:p-6 max-w-xl relative overflow-hidden">
                  <div className="absolute inset-0 texture-dots-light opacity-40" />
                  <div className="relative space-y-3.5 text-[13px] sm:text-sm">
                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center">
                        <Mic className="w-4 h-4 text-white" />
                      </span>
                      <div className="bg-white/10 border border-white/10 rounded-xl rounded-tl-sm px-4 py-2.5 text-stone-200">
                        {hi ? '"Namaste Ramesh ji, Sharma General Store se bol raha hu. Bill 1023 ka ₹5,400 baaki hai…"' : '"Namaste Ramesh ji, calling from Sharma General Store. Bill 1023 of ₹5,400 is pending…"'}
                      </div>
                    </div>
                    <div className="flex gap-3 justify-end">
                      <div className="bg-orange-500/90 rounded-xl rounded-tr-sm px-4 py-2.5 text-white max-w-[80%]">
                        {hi ? '"Haan bhai, shukravaar tak pakka kar dunga."' : '"Yes brother, I\'ll definitely pay by Friday."'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <BadgeCheck className="w-4 h-4 text-green-400" />
                      <span className="text-green-300 font-semibold text-xs">
                        {hi ? 'Promise captured → Friday follow-up scheduled' : 'Promise captured → Friday follow-up scheduled'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* WhatsApp card */}
            <Reveal delay={90}>
              <div className="glass-card card-hover p-7 h-full group relative overflow-hidden">
                <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-green-400/10 rounded-full blur-[60px]" />
                <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 border border-green-100 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                  <MessageCircle className="w-6 h-6" strokeWidth={2} />
                </div>
                <h3 className="font-display font-bold text-stone-900 text-xl mb-2">{features[1].title}</h3>
                <p className="text-stone-600 text-[15px] leading-relaxed mb-5">{features[1].desc}</p>
                <div className="flex gap-1.5">
                  {['D1', 'D3', 'D5', 'D14'].map((d, i) => (
                    <span key={d} className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border ${i < 2 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-stone-50 text-stone-500 border-stone-200'}`}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* UPI card */}
            <Reveal delay={160}>
              <div className="glass-card card-hover p-7 h-full group relative overflow-hidden">
                <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-amber-400/15 rounded-full blur-[60px]" />
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                  <CreditCard className="w-6 h-6" strokeWidth={2} />
                </div>
                <h3 className="font-display font-bold text-stone-900 text-xl mb-2">{features[2].title}</h3>
                <p className="text-stone-600 text-[15px] leading-relaxed mb-5">{features[2].desc}</p>
                <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl py-3 text-center shadow-lg shadow-orange-500/25 group-hover:shadow-xl transition-shadow">
                  <p className="text-white font-bold text-sm flex items-center justify-center gap-2">
                    <IndianRupee className="w-4 h-4" /> {hi ? 'Ek tap me pay' : 'Pay in one tap'}
                  </p>
                </div>
              </div>
            </Reveal>

            {/* bottom row: 3 small cards */}
            {features.slice(3).map((f, i) => (
              <Reveal key={f.title} delay={i * 90}>
                <div className="glass-card card-hover p-7 h-full group">
                  <div className={`w-12 h-12 rounded-2xl border ${f.tint} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                    <f.icon className="w-6 h-6" strokeWidth={2} />
                  </div>
                  <h3 className="font-display font-bold text-stone-900 text-lg mb-2">{f.title}</h3>
                  <p className="text-stone-600 text-[15px] leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works: 3 steps ── */}
      <section className="py-20 sm:py-24 px-4 sm:px-6 bg-white border-y border-orange-100 relative overflow-hidden">
        <div className="absolute inset-0 pattern-jaali opacity-50 pointer-events-none" />
        <div className="relative max-w-6xl mx-auto">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <p className="eyebrow justify-center mb-4">{hi ? 'Sirf 3 Steps' : 'Just 3 Steps'}</p>
            <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 text-stone-900">
              {hi ? '5 minute me shuru karo' : 'Live in 5 minutes'}
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                n: '01',
                icon: Store,
                title: hi ? 'Dukaan setup karo' : 'Set up your shop',
                desc: hi ? 'Naam, UPI ID daalo. Customers Excel se import karo — bas 5 minute.' : 'Enter name, UPI ID. Import customers from Excel — just 5 minutes.',
              },
              {
                n: '02',
                icon: Zap,
                title: hi ? 'System kaam pe lage' : 'System takes over',
                desc: hi ? 'WhatsApp reminders, AI calls, UPI links — 15-din ka smart journey khud chalega.' : 'WhatsApp reminders, AI calls, UPI links — the 15-day smart journey runs itself.',
              },
              {
                n: '03',
                icon: TrendingUp,
                title: hi ? 'Paisa vasool dekho' : 'Watch money come in',
                desc: hi ? 'Dashboard pe live collection dekho. Payment aate hi reminders auto-stop.' : 'Watch live collections on the dashboard. Reminders auto-stop on payment.',
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 100}>
                <div className="relative bg-[#FDF9F1] rounded-3xl border border-orange-100 p-8 h-full hover:border-orange-300 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-1 transition-all">
                  <span className="font-display text-6xl font-extrabold text-orange-200 absolute top-5 right-7 select-none">{s.n}</span>
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center mb-6 shadow-lg shadow-orange-500/25 w-fit relative">
                    <s.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-display font-bold text-xl text-stone-900 mb-2.5 relative">{s.title}</h3>
                  <p className="text-stone-600 leading-relaxed relative">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Collection journey timeline ── */}
      <section id="journey" className="py-20 sm:py-28 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-orange-400/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <p className="eyebrow justify-center mb-4">{hi ? 'Engine Ke Andar' : 'Inside The Engine'}</p>
            <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 text-stone-900">
              {hi ? 'Ek udhaari ki 15-din ki kahani' : 'The 15-day journey of one due'}
            </h2>
            <p className="text-stone-600 text-lg">
              {hi
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
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-white border-2 border-orange-200 flex items-center justify-center mb-3 group-hover:border-orange-500 group-hover:shadow-lg group-hover:shadow-orange-500/25 group-hover:-translate-y-1 transition-all relative z-10">
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
                {hi
                  ? 'Aur agar beech me kahin bhi payment aa gaya — chahe Day 2 ho ya Day 13 — to saare future steps turant cancel. Customer ko ek extra message tak nahi jayega.'
                  : 'And if payment arrives at any point — Day 2 or Day 13 — all future steps cancel instantly. The customer never gets one extra message.'}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 bg-white border-y border-orange-100 relative overflow-hidden">
        <div className="absolute inset-0 texture-dots opacity-30 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <p className="eyebrow justify-center mb-4">{hi ? 'Vyapaari Bolte Hain' : 'Merchants Speak'}</p>
            <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 text-stone-900">
              {hi ? 'Beta merchants ki zubaani' : 'From our beta merchants'}
            </h2>
            <div className="flex items-center justify-center gap-2 mt-4">
              <div className="flex">
                {[0, 1, 2, 3, 4].map((s) => (
                  <Star key={s} className="w-5 h-5 text-amber-400" fill="currentColor" />
                ))}
              </div>
              <span className="text-sm font-semibold text-stone-600">5.0 / 5</span>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((tm, i) => (
              <Reveal key={tm.name} delay={i * 100}>
                <figure className="gradient-border p-8 h-full flex flex-col hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-1 transition-all">
                  <Quote className="w-8 h-8 text-orange-300 mb-4" fill="currentColor" />
                  <blockquote className="text-stone-700 leading-relaxed flex-1 mb-6">
                    “{tm.quote}”
                  </blockquote>
                  <figcaption className="flex items-center gap-3.5 pt-5 border-t border-stone-100">
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${tm.color} flex items-center justify-center text-white font-display font-bold text-lg shadow-md`}>
                      {tm.initial}
                    </div>
                    <div>
                      <p className="font-bold text-stone-900 text-sm">{tm.name}</p>
                      <p className="text-xs text-stone-500">{tm.role}</p>
                      <p className="text-[11px] text-orange-700 font-semibold mt-0.5 flex items-center gap-1">
                        <BadgeCheck className="w-3.5 h-3.5" /> {hi ? 'Beta merchant' : 'Beta merchant'}
                      </p>
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6 pattern-jaali-green relative">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-14">
            <p className="eyebrow justify-center mb-4">Pricing</p>
            <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 text-stone-900">{t.landing.pricing.title}</h2>
            <p className="text-stone-600 text-lg">
              {hi ? 'Simple pricing. Koi hidden fees nahi, kabhi bhi cancel karo.' : 'Simple pricing. No hidden fees, cancel anytime.'}
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
                  className={`rounded-3xl p-8 flex flex-col h-full transition-all duration-300 hover:-translate-y-2 bg-white ${
                    plan.highlight
                      ? 'border-2 border-orange-500 shadow-2xl shadow-orange-500/25 relative'
                      : 'border border-orange-100 shadow-lg shadow-orange-900/5 hover:border-orange-300 hover:shadow-xl'
                  }`}
                >
                  {plan.highlight && (
                    <>
                      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500 rounded-t-[1.4rem]" />
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg whitespace-nowrap">
                        {hi ? '⭐ Sabse Popular' : '⭐ Most Popular'}
                      </div>
                    </>
                  )}
                  <h3 className="font-display text-lg font-bold text-stone-900 mb-1 mt-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-2 mb-6">
                    <span className="font-display text-5xl font-extrabold text-stone-900 amount-display">{plan.price}</span>
                    {'duration' in plan && plan.duration && (
                      <span className="text-sm text-stone-500">/ {plan.duration}</span>
                    )}
                  </div>
                  <ul className="space-y-3.5 flex-1 mb-8">
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
                    className={`w-full py-4 rounded-2xl text-center font-bold transition-all flex items-center justify-center gap-2 ${
                      plan.highlight ? 'btn-primary text-base shadow-xl shadow-orange-500/30' : 'btn-ghost'
                    }`}
                  >
                    {hi ? 'Shuru Karein' : 'Get Started'} <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={150}>
            <p className="text-center text-sm text-stone-500 mt-8 flex items-center justify-center gap-2">
              <Wallet className="w-4 h-4" />
              {hi
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
            <p className="eyebrow justify-center mb-4">FAQ</p>
            <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-stone-900">
              {hi ? 'Aksar poochhe jaane wale sawaal' : 'Frequently asked questions'}
            </h2>
          </Reveal>
          <div className="space-y-3.5">
            {faqs.map((faq, i) => (
              <Reveal key={i} delay={i * 60}>
                <div className={`glass-card overflow-hidden transition-all ${openFaq === i ? '!border-orange-400 !shadow-lg !shadow-orange-500/10' : ''}`}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-orange-50/50 transition-colors"
                    aria-expanded={openFaq === i}
                  >
                    <span className="font-semibold text-[15px] sm:text-base text-stone-900 pr-4">{faq.q}</span>
                    <span className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center transition-all ${openFaq === i ? 'bg-gradient-to-br from-orange-500 to-amber-500 border-transparent rotate-180' : 'border-stone-300'}`}>
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

      {/* ── Final CTA (dark) ── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6">
        <Reveal className="max-w-6xl mx-auto">
          <div className="relative bg-stone-950 rounded-[2.5rem] overflow-hidden px-6 sm:px-16 py-16 sm:py-24 text-center">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-orange-600/30 rounded-full blur-[130px] animate-glow" />
              <div className="absolute -bottom-40 -left-24 w-[400px] h-[400px] bg-amber-500/15 rounded-full blur-[110px]" />
              <div className="absolute -bottom-40 -right-24 w-[400px] h-[400px] bg-green-600/10 rounded-full blur-[110px]" />
              <div className="absolute inset-0 texture-dots-light opacity-50" />
              <div className="absolute inset-0 texture-grain opacity-20" />
            </div>
            <div className="relative">
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-4 py-1.5 text-sm font-semibold text-orange-200 mb-7 backdrop-blur">
                <Store className="w-4 h-4" />
                {hi ? 'Har din ka delay = paisa atka hua' : 'Every delayed day = money stuck'}
              </div>
              <h2 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight mb-6 leading-[1.08] text-white">
                {hi ? (
                  <>Aaj ka udhaar, <span className="gradient-text">aaj se automatic.</span></>
                ) : (
                  <>Today&apos;s dues, <span className="gradient-text">automatic from today.</span></>
                )}
              </h2>
              <p className="text-stone-300 text-lg mb-10 max-w-xl mx-auto">
                {hi
                  ? '14 din free. Koi credit card nahi. 5 minute me setup. Pehla reminder aaj hi jayega.'
                  : '14 days free. No credit card. 5-minute setup. Your first reminder goes out today.'}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/login" className="btn-primary px-10 py-4 text-lg shadow-2xl shadow-orange-600/40">
                  {t.landing.hero.cta} <ArrowRight className="w-5 h-5" />
                </Link>
                <Link href="/services" className="px-8 py-4 rounded-[0.85rem] font-bold text-white border border-white/20 bg-white/5 backdrop-blur hover:bg-white/10 transition-all inline-flex items-center gap-2">
                  {hi ? 'Services dekho' : 'View services'}
                </Link>
              </div>
              <p className="text-stone-500 text-xs mt-8 flex items-center justify-center gap-4 flex-wrap">
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-green-400" strokeWidth={3} /> {hi ? 'Free trial' : 'Free trial'}</span>
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-green-400" strokeWidth={3} /> {hi ? 'No credit card' : 'No credit card'}</span>
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-green-400" strokeWidth={3} /> {hi ? '5-min setup' : '5-min setup'}</span>
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <SiteFooter />
    </div>
  )
}
