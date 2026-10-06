'use client'

import Link from 'next/link'
import {
  Phone,
  MessageCircle,
  Mail,
  CreditCard,
  BarChart3,
  Wallet,
  ArrowRight,
  Check,
  IndianRupee,
  AlertTriangle,
  ShieldCheck,
  Zap,
  Clock,
} from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import SiteFooter from '@/components/SiteFooter'
import SiteNav from '@/components/SiteNav'

const SERVICES = [
  {
    id: 'voice-calls',
    icon: Phone,
    tint: 'bg-orange-50 text-orange-600 border-orange-200',
    titleHi: 'AI Voice Call Reminders',
    titleEn: 'AI Voice Call Reminders',
    descHi:
      'System khud customer ko call karke Hindi me baat karta hai — naam, bill number, amount aur overdue din batata hai. Promise-to-pay capture, vivaad record, poori transcript save. Bade ya lambe pending udhaar ke liye sabse effective.',
    descEn:
      'The system calls customers itself and speaks in Hindi — mentioning name, bill number, amount and overdue days. Captures promise-to-pay, records disputes, saves full transcripts. Most effective for high-value or long-pending dues.',
    pointsHi: ['Hindi AI voice, human jaisi baat', 'Bill details auto-boli jaati hain', 'Har call ki transcript + recording'],
    pointsEn: ['Human-like Hindi AI voice', 'Bill details spoken automatically', 'Transcript + recording of every call'],
  },
  {
    id: 'whatsapp',
    icon: MessageCircle,
    tint: 'bg-green-50 text-green-600 border-green-200',
    titleHi: 'WhatsApp Reminders',
    titleEn: 'WhatsApp Reminders',
    descHi:
      'Day 1 polite, Day 3 payment link ke saath, Day 5 firm, Day 14 final notice — Hindi templates, har customer ke naam aur bill ke saath auto-personalized. Scheduled follow-ups time pe, professional record ke saath.',
    descEn:
      'Day 1 polite, Day 3 with payment link, Day 5 firm, Day 14 final notice — Hindi templates, auto-personalized with each customer\'s name and bill. Scheduled follow-ups on time, with a professional record.',
    pointsHi: ['Hindi templates, auto-personalized', 'Har message me UPI payment link', 'Read/delivery tracking'],
    pointsEn: ['Hindi templates, auto-personalized', 'UPI payment link in every message', 'Read/delivery tracking'],
  },
  {
    id: 'sms-email',
    icon: Mail,
    tint: 'bg-blue-50 text-blue-600 border-blue-200',
    titleHi: 'SMS & Email Reminders',
    titleEn: 'SMS & Email Reminders',
    descHi:
      'Invoice details aur due amount ke saath automated SMS aur email. WhatsApp na ho to bhi customer tak pahuncho — har channel pe consistent, professional communication ka clear record.',
    descEn:
      'Automated SMS and email with invoice details and due amounts. Reach customers even without WhatsApp — consistent, professional communication with a clear record on every channel.',
    pointsHi: ['Multi-channel coverage', 'Invoice PDF attachment', 'DLT-compliant SMS'],
    pointsEn: ['Multi-channel coverage', 'Invoice PDF attachment', 'DLT-compliant SMS'],
  },
  {
    id: 'upi-links',
    icon: CreditCard,
    tint: 'bg-amber-50 text-amber-600 border-amber-200',
    titleHi: 'UPI Payment Links',
    titleEn: 'UPI Payment Links',
    descHi:
      'Har reminder me Razorpay UPI link — customer ek tap me pay kare. Payment aate hi webhook se auto-reconcile, aur saare future reminders khud band. Paisa vasool, bina peecha kiye.',
    descEn:
      'Razorpay UPI link in every reminder — customer pays in one tap. Webhook auto-reconciles on payment, and all future reminders stop automatically. Money collected, no chasing needed.',
    pointsHi: ['Ek tap me UPI payment', 'Auto-reconciliation', 'Payment pe reminders auto-stop'],
    pointsEn: ['One-tap UPI payment', 'Auto-reconciliation', 'Reminders auto-stop on payment'],
  },
  {
    id: 'tracking',
    icon: Wallet,
    tint: 'bg-purple-50 text-purple-600 border-purple-200',
    titleHi: 'Credit Tracking',
    titleEn: 'Credit Tracking',
    descHi:
      'Har customer ka udhaar ek jagah — bill-wise outstanding, overdue din, payment history. Kaun kitna, kab se pending — sab kuch dashboard pe saaf dikhe. Tally se auto-sync bhi.',
    descEn:
      'Every customer\'s credit in one place — bill-wise outstanding, overdue days, payment history. Who owes how much, since when — all clearly visible on the dashboard. Auto-syncs with Tally too.',
    pointsHi: ['Customer-wise ledger', 'Overdue ageing report', 'Tally auto-sync'],
    pointsEn: ['Customer-wise ledger', 'Overdue ageing report', 'Tally auto-sync'],
  },
  {
    id: 'reports',
    icon: BarChart3,
    tint: 'bg-teal-50 text-teal-600 border-teal-200',
    titleHi: 'Smart Reports & Insights',
    titleEn: 'Smart Reports & Insights',
    descHi:
      'Vasuli trend, at-risk customers, promise follow-ups — AI insights batayein aaj kisko call karna hai. Weekly collection report seedha WhatsApp pe. Data-driven vasuli, andaza nahi.',
    descEn:
      'Collection trends, at-risk customers, promise follow-ups — AI insights tell you who to call today. Weekly collection report straight to WhatsApp. Data-driven recovery, not guesswork.',
    pointsHi: ['AI-powered insights', 'Weekly WhatsApp reports', 'CSV export'],
    pointsEn: ['AI-powered insights', 'Weekly WhatsApp reports', 'CSV export'],
  },
]

const CHALLENGES = [
  {
    icon: Clock,
    titleHi: 'Time ki barbaadi',
    titleEn: 'Wasted time',
    descHi: 'Roz phone karke yaad dilana — dukandaar ka keemti time khaata hai.',
    descEn: 'Calling every day to remind — eats up the merchant\'s precious time.',
  },
  {
    icon: AlertTriangle,
    titleHi: 'Rishte kharab',
    titleEn: 'Strained relations',
    descHi: 'Baar-baar maangne se customer ke saath sambandh bigadte hain.',
    descEn: 'Repeated asking strains the relationship with customers.',
  },
  {
    icon: Wallet,
    titleHi: 'Cash flow atakna',
    titleEn: 'Blocked cash flow',
    descHi: 'Udhaar atka to naya maal, nayi scheme — sab ruk jaata hai.',
    descEn: 'Stuck credit blocks new stock, new schemes — everything stalls.',
  },
  {
    icon: BarChart3,
    titleHi: 'Hisab me gadbad',
    titleEn: 'Messy records',
    descHi: 'Copy-kitaab me kaun kitna pending hai, yaad rakhna mushkil.',
    descEn: 'Hard to track who owes how much in paper ledgers.',
  },
]

export default function ServicesPage() {
  const { lang, toggleLang } = useLanguage()
  const hi = lang === 'hi'

  return (
    <div className="min-h-screen bg-[#FDF9F1]">
      <SiteNav />

      {/* Hero */}
      <section className="pt-28 sm:pt-32 pb-14 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block text-xs font-bold tracking-[0.2em] text-orange-700 bg-orange-100 border border-orange-200 rounded-full px-4 py-1.5 mb-5">
            {hi ? 'HAMARI SERVICES' : 'OUR SERVICES'}
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-stone-900 leading-tight">
            {hi ? (
              <>Smart Payment Recovery se <span className="text-orange-600">Cash Flow</span> badhao</>
            ) : (
              <>Boost Cash Flow with <span className="text-orange-600">Smart Payment Recovery</span></>
            )}
          </h1>
          <p className="mt-5 text-lg text-stone-600 leading-relaxed max-w-2xl mx-auto">
            {hi
              ? 'Udhaari vasuli ka poora system hum sambhalte hain — tum apne business ki growth pe dhyaan do. AI calls, WhatsApp reminders aur UPI links, sab automatic.'
              : 'We handle your entire collection system — you focus on growing your business. AI calls, WhatsApp reminders and UPI links, all automatic.'}
          </p>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 mt-8 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-bold px-8 py-3.5 rounded-2xl shadow-lg shadow-orange-500/30 hover:shadow-xl hover:scale-[1.02] transition-all"
          >
            {hi ? 'Start Now' : 'Start Now'}
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Services grid */}
      <section className="py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SERVICES.map((s) => (
              <article
                key={s.id}
                id={s.id}
                className="bg-white rounded-3xl border border-orange-100 shadow-sm hover:shadow-xl hover:shadow-orange-900/5 hover:-translate-y-1 transition-all p-7 scroll-mt-28"
              >
                <div className={`p-3.5 rounded-2xl border ${s.tint} w-fit mb-5`}>
                  <s.icon className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-extrabold text-stone-900 mb-2.5">
                  {hi ? s.titleHi : s.titleEn}
                </h2>
                <p className="text-stone-600 text-[15px] leading-relaxed mb-5">
                  {hi ? s.descHi : s.descEn}
                </p>
                <ul className="space-y-2">
                  {(hi ? s.pointsHi : s.pointsEn).map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-stone-700">
                      <Check className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" strokeWidth={3} />
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Challenges */}
      <section className="py-16 px-4 sm:px-6 bg-white border-y border-orange-100">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-stone-900 text-center tracking-tight">
            {hi ? 'Bina System ke Mushkilein' : 'Challenges Without a Collection System'}
          </h2>
          <p className="text-center text-stone-500 mt-3 max-w-2xl mx-auto">
            {hi
              ? 'Udhaari vasuli ka system na ho to ye problems aati hain —'
              : 'Without a collection system, businesses face these problems —'}
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            {CHALLENGES.map((c) => (
              <div key={c.titleEn} className="bg-[#FDF9F1] rounded-2xl border border-stone-200 p-6">
                <c.icon className="w-8 h-8 text-red-500 mb-4" />
                <h3 className="font-bold text-stone-900 mb-2">{hi ? c.titleHi : c.titleEn}</h3>
                <p className="text-sm text-stone-600 leading-relaxed">{hi ? c.descHi : c.descEn}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-stone-900 text-center tracking-tight">
            {hi ? 'Ugaahi hi kyun?' : 'Why Ugaahi?'}
          </h2>
          <div className="grid sm:grid-cols-3 gap-5 mt-10">
            {[
              {
                icon: ShieldCheck,
                t: hi ? 'Safe aur Bharosemand' : 'Safe & Trusted',
                d: hi ? 'Tumhara data encrypted aur surakshit. Sirf tumhara access.' : 'Your data encrypted and secure. Only your access.',
              },
              {
                icon: Zap,
                t: hi ? 'Fully Automatic' : 'Fully Automatic',
                d: hi ? 'Ek baar setup karo — reminders, calls, follow-ups sab khud.' : 'Set up once — reminders, calls, follow-ups all automatic.',
              },
              {
                icon: IndianRupee,
                t: hi ? 'Indian Merchants ke liye' : 'Built for Indian Merchants',
                d: hi ? 'Hindi voice, UPI payments, Tally sync — Bharat ke hisaab se bana hai.' : 'Hindi voice, UPI payments, Tally sync — built for Bharat.',
              },
            ].map((f) => (
              <div key={f.t} className="text-center bg-white rounded-2xl border border-orange-100 p-7">
                <f.icon className="w-10 h-10 text-orange-600 mx-auto mb-4" />
                <h3 className="font-bold text-stone-900 mb-2">{f.t}</h3>
                <p className="text-sm text-stone-600 leading-relaxed">{f.d}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-bold px-8 py-3.5 rounded-2xl shadow-lg shadow-orange-500/30 hover:shadow-xl hover:scale-[1.02] transition-all"
            >
              {hi ? 'Free me Shuru Karo' : 'Start Free'}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
