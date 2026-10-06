'use client'

import { useLanguage } from '@/hooks/useLanguage'
import SiteFooter from '@/components/SiteFooter'
import SiteNav from '@/components/SiteNav'
import { FileText } from 'lucide-react'

export default function TermsPage() {
  const { lang } = useLanguage()
  const hi = lang === 'hi'

  const sections = hi
    ? [
        {
          t: '1. Service kya hai',
          b: 'Udhari OS Indian merchants ko udhaar vasuli me madad karta hai — WhatsApp/SMS reminders, Hindi AI voice calls, UPI payment links, reports aur Tally sync. Service "as-is" basis pe milti hai; hum 100% vasuli ki guarantee nahi dete.',
        },
        {
          t: '2. Tumhari zimmedari',
          b: 'Tum jo customer data (naam, phone, bill) daalte ho, wo sahi aur kanooni hona chahiye. Tumhare paas un customers ko reminder/call karne ka adhikaar hona chahiye. Galat ya bina permission ke data ke liye tum zimmedaar hoge.',
        },
        {
          t: '3. Fair use — calls aur messages',
          b: 'Reminders sirf genuine pending dues ke liye bhejo. Spam, dhamki ya pareshan karne wale messages/calls mana hain. TRAI/DLT niyamon ka paalan zaroori hai. Galat istemal pe account suspend ho sakta hai.',
        },
        {
          t: '4. Payments aur credits',
          b: 'UPI payments Razorpay ke through hote hain — unke charges alag se lag sakte hain. Call/SMS credits ka istemal fair hona chahiye; khatm hone pe top-up karna padega. Refund policy: unused credits 7 din ke andar refund ho sakte hain.',
        },
        {
          t: '5. Account band karna',
          b: 'Tum kabhi bhi account band kar sakte ho — tumhara data 30 din me delete ho jayega. Hum bhi galat istemal pe bina notice account suspend kar sakte hain.',
        },
        {
          t: '6. Liability limit',
          b: 'Kanoon ke dayre me, Udhari OS ki zimmedari tumhare pichle 3 mahine ke paid amount tak seemit hai. Vasuli na hone se hue nuksaan ke liye hum zimmedaar nahi.',
        },
        {
          t: '7. Kanoon',
          b: 'Ye terms Bharat ke kanoon ke adheen hain. Koi vivaad ho to pehle baat-cheet se suljhane ki koshish hogi.',
        },
      ]
    : [
        {
          t: '1. What the service is',
          b: 'Udhari OS helps Indian merchants recover credit — WhatsApp/SMS reminders, Hindi AI voice calls, UPI payment links, reports and Tally sync. The service is provided "as-is"; we do not guarantee 100% recovery.',
        },
        {
          t: '2. Your responsibility',
          b: 'Customer data (names, phones, bills) you upload must be accurate and lawful. You must have the right to remind/call those customers. You are responsible for wrong or non-consented data.',
        },
        {
          t: '3. Fair use — calls & messages',
          b: 'Send reminders only for genuine pending dues. Spam, threats or harassing messages/calls are prohibited. TRAI/DLT rules must be followed. Misuse can lead to account suspension.',
        },
        {
          t: '4. Payments & credits',
          b: 'UPI payments go through Razorpay — their charges may apply separately. Call/SMS credits must be used fairly; top up when exhausted. Refunds: unused credits refundable within 7 days.',
        },
        {
          t: '5. Closing your account',
          b: 'You can close your account anytime — your data is deleted within 30 days. We may suspend accounts for misuse without notice.',
        },
        {
          t: '6. Liability limit',
          b: 'To the extent permitted by law, Udhari OS\'s liability is limited to what you paid in the last 3 months. We are not liable for losses from unrecovered dues.',
        },
        {
          t: '7. Governing law',
          b: 'These terms are governed by the laws of India. Disputes will first be attempted to resolve through discussion.',
        },
      ]

  return (
    <div className="min-h-screen bg-[#FDF9F1]">
      <SiteNav />
      <main className="pt-28 sm:pt-32 pb-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <FileText className="w-12 h-12 text-orange-600 mx-auto mb-4" />
            <h1 className="text-4xl font-extrabold text-stone-900 tracking-tight">
              {hi ? 'Terms of Service' : 'Terms of Service'}
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
                {hi ? 'Inhe sweekar karke tum Udhari OS use karne ke liye sahmat ho.' : 'By using Udhari OS you agree to these terms.'}
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
