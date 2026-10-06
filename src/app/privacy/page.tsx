'use client'

import { useLanguage } from '@/hooks/useLanguage'
import SiteFooter from '@/components/SiteFooter'
import SiteNav from '@/components/SiteNav'
import { ShieldCheck } from 'lucide-react'

export default function PrivacyPage() {
  const { lang } = useLanguage()
  const hi = lang === 'hi'

  const sections = hi
    ? [
        {
          t: '1. Hum kaun sa data lete hain',
          b: 'Ugaahi tumhara naam, phone number, business details, customer list, bill/udhaar records aur payment history store karta hai. OTP login ke liye phone number use hota hai. Call recordings sirf tumhari permission se save hoti hain.',
        },
        {
          t: '2. Data ka istemal',
          b: 'Tumhara data sirf in kaamon ke liye use hota hai: WhatsApp/SMS reminders bhejna, AI voice calls karna, UPI payment links banana, reports dikhana aur Tally sync. Hum tumhara data kabhi bechte nahi, aur third-party ads ke liye share nahi karte.',
        },
        {
          t: '3. Data security',
          b: 'Saara data encrypted connection (HTTPS) pe bheja jaata hai aur secure servers pe store hota hai. OTP aur passwords kabhi plain text me save nahi hote. Sirf tum (aur tumhare authorized staff) apna data dekh sakte hain.',
        },
        {
          t: '4. Third-party services',
          b: 'Hum in services ka use karte hain: MSG91 (OTP/SMS), Exotel (voice calls), Sarvam AI (Hindi voice), Razorpay (payments), Supabase (database). Inka apna privacy policy hota hai; hum sirf zaroori data hi bhejte hain.',
        },
        {
          t: '5. Tumhare adhikaar',
          b: 'Tum kabhi bhi apna data download kar sakte ho, galat data sudharwa sakte ho, ya account delete karke saara data mitwa sakte ho. Iske liye support@udhari.app pe likho — 7 din me action hoga.',
        },
        {
          t: '6. Bachchon ki privacy',
          b: 'Ugaahi business owners ke liye hai. Hum jaan-boojh kar 18 saal se kam umra ke logon ka data collect nahi karte.',
        },
        {
          t: '7. Policy me badlaav',
          b: 'Agar is policy me koi important badlaav hoga to hum tumhe WhatsApp/email pe pehle batayenge. Aakhri update: 6 October 2026.',
        },
      ]
    : [
        {
          t: '1. What data we collect',
          b: 'Ugaahi stores your name, phone number, business details, customer lists, bill/credit records and payment history. Your phone number is used for OTP login. Call recordings are saved only with your permission.',
        },
        {
          t: '2. How we use it',
          b: 'Your data is used only for: sending WhatsApp/SMS reminders, making AI voice calls, generating UPI payment links, showing reports and Tally sync. We never sell your data or share it for third-party ads.',
        },
        {
          t: '3. Data security',
          b: 'All data travels over encrypted connections (HTTPS) and is stored on secure servers. OTPs and passwords are never stored in plain text. Only you (and your authorized staff) can see your data.',
        },
        {
          t: '4. Third-party services',
          b: 'We use: MSG91 (OTP/SMS), Exotel (voice calls), Sarvam AI (Hindi voice), Razorpay (payments), Supabase (database). Each has its own privacy policy; we send them only the data they need.',
        },
        {
          t: '5. Your rights',
          b: 'You can download your data, correct mistakes, or delete your account and all data anytime. Write to support@udhari.app — we act within 7 days.',
        },
        {
          t: '6. Children\'s privacy',
          b: 'Ugaahi is for business owners. We do not knowingly collect data from anyone under 18.',
        },
        {
          t: '7. Changes to this policy',
          b: 'If we make important changes, we will inform you first via WhatsApp/email. Last updated: 6 October 2026.',
        },
      ]

  return (
    <div className="min-h-screen bg-[#FDF9F1]">
      <SiteNav />
      <main className="pt-28 sm:pt-32 pb-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <ShieldCheck className="w-12 h-12 text-orange-600 mx-auto mb-4" />
            <h1 className="text-4xl font-extrabold text-stone-900 tracking-tight">
              Privacy Policy
            </h1>
            <p className="text-stone-500 mt-3">
              {hi ? 'Aakhri update: 6 October 2026' : 'Last updated: 6 October 2026'}
            </p>
          </div>
          <div className="bg-white rounded-3xl border border-orange-100 p-8 sm:p-10 space-y-8 shadow-sm">
            {sections.map((s) => (
              <section key={s.t}>
                <h2 className="text-lg font-bold text-stone-900 mb-2">{s.t}</h2>
                <p className="text-stone-600 leading-relaxed text-[15px]">{s.b}</p>
              </section>
            ))}
            <section className="pt-4 border-t border-stone-100">
              <p className="text-sm text-stone-500">
                {hi
                  ? 'Sawaal ho to likho: '
                  : 'Questions? Write to: '}
                <a href="mailto:support@udhari.app" className="text-orange-600 font-semibold hover:underline">
                  support@udhari.app
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
