'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/hooks/useLanguage'

export default function LandingPage() {
  const { t, lang, toggleLang } = useLanguage()
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const faqs = [
    {
      q: lang === 'hi' ? 'Kya yeh safe hai?' : 'Is this safe?',
      a: lang === 'hi'
        ? 'Bilkul. Aapka data Supabase (India servers) mein store hota hai. Razorpay India ka #1 payment gateway hai. Koi bhi API key client-side nahi hai.'
        : 'Absolutely. Data stored on Supabase India servers. Razorpay is India\'s #1 payment gateway. No API keys on client-side.',
    },
    {
      q: lang === 'hi' ? 'Customer ko kitne reminder bhejenge?' : 'How many reminders will customers get?',
      a: lang === 'hi'
        ? 'Default mein: Day 1 polite WhatsApp, Day 3 payment link, Day 5 firm message, Day 7 & 10 AI voice call, Day 14 final notice, Day 15 aapko escalation. Max 2 messages/customer/din. Quiet hours 9 PM – 9 AM mein koi message nahi.'
        : 'Default: Day 1 polite WhatsApp, Day 3 payment link, Day 5 firm message, Day 7 & 10 AI voice call, Day 14 final notice, Day 15 escalation. Max 2 touches/customer/day. No messages 9 PM – 9 AM.',
    },
    {
      q: lang === 'hi' ? 'Customer ne STOP bola toh?' : 'What if customer says STOP?',
      a: lang === 'hi'
        ? 'Turant ek confirmation message jaata hai aur hum permanently band kar dete hain. Opt-out list ka poora dhyan rakha jaata hai.'
        : 'One confirmation message sent immediately and permanently opted out. Opt-out list is always respected.',
    },
    {
      q: lang === 'hi' ? 'Kaunse WhatsApp provider support hote hain?' : 'Which WhatsApp providers are supported?',
      a: lang === 'hi'
        ? 'AiSensy, Gupshup, Interakt, aur Meta Cloud API — sab support hain. Provider change karna sirf ek env variable badalna hai.'
        : 'AiSensy, Gupshup, Interakt, and Meta Cloud API — all supported. Changing provider is just one env variable change.',
    },
    {
      q: lang === 'hi' ? 'AI voice call mein kya hota hai?' : 'What happens on an AI voice call?',
      a: lang === 'hi'
        ? 'Exotel call place karta hai. Sarvam AI Hindi mein baat karta hai. Customer payment date de sakta hai, dispute raise kar sakta hai, ya payment confirm kar sakta hai. Puri conversation transcript save hoti hai.'
        : 'Exotel places the call. Sarvam AI speaks in Hindi. Customer can give a payment date, raise a dispute, or confirm payment. Full transcript is saved.',
    },
  ]

  const features = [
    { icon: '💬', title: lang === 'hi' ? 'WhatsApp Reminders' : 'WhatsApp Reminders', desc: lang === 'hi' ? 'Staged Hindi reminders — polite se firm tak' : 'Staged Hindi reminders — polite to firm' },
    { icon: '📞', title: lang === 'hi' ? 'AI Voice Calls' : 'AI Voice Calls', desc: lang === 'hi' ? 'Hindi mein baat, date capture, dispute record' : 'Hindi conversation, date capture, dispute recording' },
    { icon: '💳', title: lang === 'hi' ? 'UPI Payment Links' : 'UPI Payment Links', desc: lang === 'hi' ? 'Razorpay link — customer seedha pay kar le' : 'Razorpay link — customer pays instantly' },
    { icon: '⚡', title: lang === 'hi' ? 'Auto Stop' : 'Auto Stop', desc: lang === 'hi' ? 'Payment aate hi sab reminders band' : 'All reminders stop the moment payment arrives' },
    { icon: '📊', title: lang === 'hi' ? 'Live Dashboard' : 'Live Dashboard', desc: lang === 'hi' ? 'Outstanding, collected, defaulter list' : 'Outstanding, collected, defaulter list' },
    { icon: '🛡️', title: lang === 'hi' ? 'Opt-out Safe' : 'Opt-out Safe', desc: lang === 'hi' ? 'STOP bola → forever band' : 'STOP said → forever silenced' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💰</span>
            <span className="font-bold text-xl gradient-text">Udhari OS</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLang}
              className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30 transition-all"
            >
              {lang === 'hi' ? 'EN' : 'HI'}
            </button>
            <Link
              href="/login"
              className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded-lg hover:bg-white/10 transition-all"
            >
              {lang === 'hi' ? 'Login' : 'Login'}
            </Link>
            <Link
              href="/login"
              className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-all font-medium"
            >
              {t.landing.hero.cta}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-4 text-center relative overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 px-4 py-1.5 rounded-full text-sm mb-6 border border-indigo-500/30">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            {lang === 'hi' ? '14-din free trial — credit card nahi chahiye' : '14-day free trial — no credit card needed'}
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 leading-tight">
            {lang === 'hi' ? (
              <>
                Udhaari collection<br />
                <span className="gradient-text">ab automatic</span>
              </>
            ) : (
              <>
                Payment collection<br />
                <span className="gradient-text">on autopilot</span>
              </>
            )}
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            {t.landing.hero.subheadline}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-all hover:scale-105 shadow-lg shadow-indigo-500/25"
            >
              {t.landing.hero.cta}
            </Link>
            <a
              href="#demo"
              className="bg-white/10 hover:bg-white/15 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-all border border-white/20"
            >
              {t.landing.hero.demo} →
            </a>
          </div>

          {/* Social proof */}
          <p className="mt-8 text-sm text-gray-500">
            {lang === 'hi'
              ? '🏪 Kirana stores, wholesale distributors, aur suppliers ke liye banaya gaya'
              : '🏪 Built for kirana stores, wholesale distributors, and suppliers'}
          </p>
        </div>
      </section>

      {/* ── Demo Video Placeholder ── */}
      <section id="demo" className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card aspect-video flex items-center justify-center group hover:border-indigo-500/30 transition-all cursor-pointer">
            <div className="text-center">
              <div className="w-20 h-20 bg-indigo-600/30 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-indigo-600/50 transition-all">
                <svg className="w-8 h-8 text-indigo-400 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">
                {lang === 'hi' ? '2-minute demo dekhein' : 'Watch 2-minute demo'}
              </p>
              <p className="text-gray-600 text-xs mt-1">
                {lang === 'hi' ? 'Video jald aayega' : 'Video coming soon'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            {lang === 'hi' ? 'Kya milta hai?' : 'What you get'}
          </h2>
          <p className="text-gray-400 text-center mb-12 max-w-xl mx-auto">
            {lang === 'hi'
              ? 'Ek complete collection system — WhatsApp se lekar AI voice call tak'
              : 'A complete collection system — from WhatsApp to AI voice calls'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <div
                key={i}
                className="glass-card p-6 hover:border-indigo-500/30 transition-all group"
              >
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                  {f.title}
                </h3>
                <p className="text-gray-400 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-16 px-4 bg-white/2">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            {lang === 'hi' ? 'Kaise kaam karta hai?' : 'How it works'}
          </h2>
          <div className="space-y-6">
            {[
              { step: '1', icon: '➕', title: lang === 'hi' ? 'Customer + Udhaar add karo' : 'Add customer + outstanding', desc: lang === 'hi' ? 'Naam, phone, amount, due date. Excel import bhi ho sakta hai.' : 'Name, phone, amount, due date. Excel import supported.' },
              { step: '2', icon: '🤖', title: lang === 'hi' ? 'System automatically chase karta hai' : 'System automatically chases', desc: lang === 'hi' ? 'WhatsApp → payment link → AI voice call — sab apne aap, quiet hours respect karte hue.' : 'WhatsApp → payment link → AI voice call — all automatic, respecting quiet hours.' },
              { step: '3', icon: '✅', title: lang === 'hi' ? 'Payment aate hi sab band' : 'Payment received — everything stops', desc: lang === 'hi' ? 'Razorpay webhook aate hi — paid mark, reminders cancel, aapko notification.' : 'Razorpay webhook arrives — marked paid, reminders cancelled, you get notified.' },
            ].map((s) => (
              <div key={s.step} className="flex gap-4 items-start">
                <div className="w-12 h-12 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold flex-shrink-0">
                  {s.step}
                </div>
                <div className="glass-card flex-1 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{s.icon}</span>
                    <h3 className="font-semibold">{s.title}</h3>
                  </div>
                  <p className="text-gray-400 text-sm">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">{t.landing.pricing.title}</h2>
          <p className="text-gray-400 text-center mb-12">
            {lang === 'hi' ? 'Simple pricing. Koi hidden fees nahi.' : 'Simple pricing. No hidden fees.'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { ...t.landing.pricing.trial, highlight: false },
              { ...t.landing.pricing.starter, highlight: false },
              { ...t.landing.pricing.pro, highlight: true },
            ].map((plan, i) => (
              <div
                key={i}
                className={`glass-card p-6 flex flex-col ${plan.highlight ? 'border-indigo-500/50 bg-indigo-500/10' : ''}`}
              >
                {plan.highlight && (
                  <div className="text-xs text-indigo-300 font-medium mb-2 uppercase tracking-wider">
                    {lang === 'hi' ? '⭐ Sabse Popular' : '⭐ Most Popular'}
                  </div>
                )}
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <div className="text-3xl font-bold text-white mb-4">
                  {plan.price}
                  {'duration' in plan && plan.duration && (
                    <span className="text-sm text-gray-400 font-normal ml-1">
                      ({plan.duration})
                    </span>
                  )}
                </div>
                <ul className="space-y-2 flex-1 mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="text-green-400">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={`w-full py-3 rounded-xl text-center font-medium transition-all ${
                    plan.highlight
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      : 'bg-white/10 hover:bg-white/15 text-white border border-white/20'
                  }`}
                >
                  {lang === 'hi' ? 'Shuru Karein' : 'Get Started'}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-10">
            {lang === 'hi' ? 'Sawaal Jawab' : 'FAQ'}
          </h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="glass-card overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                  aria-expanded={openFaq === i}
                >
                  <span className="font-medium text-sm sm:text-base">{faq.q}</span>
                  <span className={`text-indigo-400 transition-transform ml-3 ${openFaq === i ? 'rotate-45' : ''}`}>
                    +
                  </span>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-gray-400 text-sm leading-relaxed border-t border-white/5 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials placeholder ── */}
      <section className="py-16 px-4 bg-white/2">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-8">
            {lang === 'hi' ? 'Merchants kya kehte hain' : 'What merchants say'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { name: 'Ramesh Gupta', role: lang === 'hi' ? 'Wholesale Distributor, Delhi' : 'Wholesale Distributor, Delhi', quote: lang === 'hi' ? '"Pehle 2 ghante call karne mein jaate the. Ab sab automatic hai. ₹2.4 lakh is mahine vasool."' : '"Used to spend 2 hours calling. Now everything is automatic. ₹2.4L collected this month."' },
              { name: 'Priya Sharma', role: lang === 'hi' ? 'Kirana Supplier, Mumbai' : 'Kirana Supplier, Mumbai', quote: lang === 'hi' ? '"WhatsApp reminders bahut polite hain. Customers bura nahi maante aur pay kar dete hain."' : '"WhatsApp reminders are so polite. Customers don\'t mind and just pay."' },
              { name: 'Vijay Mehta', role: lang === 'hi' ? 'Hardware Dealer, Pune' : 'Hardware Dealer, Pune', quote: lang === 'hi' ? '"AI voice call feature kamaal ka hai. Customer date de deta hai aur system follow up kar leta hai."' : '"The AI voice call feature is amazing. Customer gives a date and the system follows up."' },
            ].map((t, i) => (
              <div key={i} className="glass-card p-5 text-left">
                <p className="text-gray-300 text-sm mb-4 italic">{t.quote}</p>
                <div>
                  <p className="font-semibold text-white text-sm">{t.name}</p>
                  <p className="text-gray-500 text-xs">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-4">
            {lang === 'hi' ? '* Illustrative testimonials' : '* Illustrative testimonials'}
          </p>
        </div>
      </section>

      {/* ── Footer CTA ── */}
      <section className="py-20 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">
            {lang === 'hi' ? 'Aaj hi shuru karein — free mein' : 'Start today — for free'}
          </h2>
          <p className="text-gray-400 mb-8">
            {lang === 'hi'
              ? '14 din ka free trial. Koi credit card nahi. Setup 5 minute mein.'
              : '14-day free trial. No credit card. Setup in 5 minutes.'}
          </p>
          <Link
            href="/login"
            className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-4 rounded-xl text-lg font-semibold transition-all hover:scale-105 shadow-lg shadow-indigo-500/25"
          >
            {t.landing.hero.cta}
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-gray-600 text-sm">
          <div className="flex items-center gap-2">
            <span>💰</span>
            <span className="font-bold text-gray-400">Udhari OS</span>
          </div>
          <p>© 2025 Udhari OS. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-gray-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-gray-400 transition-colors">Terms</a>
            <a href="mailto:support@udhari.app" className="hover:text-gray-400 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
