'use client'

import Link from 'next/link'
import { IndianRupee, Phone, Mail, MapPin, Clock } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'

export default function SiteFooter() {
  const { lang } = useLanguage()

  const serviceLinks = [
    { href: '/services#voice-calls', label: lang === 'hi' ? 'AI Voice Calls' : 'AI Voice Calls' },
    { href: '/services#whatsapp', label: lang === 'hi' ? 'WhatsApp Reminders' : 'WhatsApp Reminders' },
    { href: '/services#sms-email', label: lang === 'hi' ? 'SMS & Email' : 'SMS & Email' },
    { href: '/services#upi-links', label: lang === 'hi' ? 'UPI Payment Links' : 'UPI Payment Links' },
    { href: '/services#tracking', label: lang === 'hi' ? 'Credit Tracking' : 'Credit Tracking' },
    { href: '/services#reports', label: lang === 'hi' ? 'Smart Reports' : 'Smart Reports' },
  ]

  const pageLinks = [
    { href: '/', label: lang === 'hi' ? 'Home' : 'Home' },
    { href: '/services', label: lang === 'hi' ? 'Services' : 'Services' },
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/terms', label: lang === 'hi' ? 'Terms' : 'Terms' },
  ]

  return (
    <footer className="bg-stone-900 text-stone-300 pt-14 pb-8 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <img
                src="/ugaahi-icon.png"
                alt="Ugaahi logo"
                className="w-9 h-9 rounded-xl shadow-lg object-cover"
              />
              <div className="leading-none">
                <span className="font-extrabold text-lg text-white">
                  Ugaahi
                </span>
                <p className="text-[10px] font-semibold tracking-[0.22em] text-orange-400/80 mt-0.5">
                  उगाही
                </p>
              </div>
            </div>
            <p className="text-sm text-stone-400 leading-relaxed">
              {lang === 'hi'
                ? 'Indian merchants ke liye AI payment collection — WhatsApp reminders, Hindi AI voice calls aur UPI payment links, sab automatic.'
                : 'AI payment collection for Indian merchants — WhatsApp reminders, Hindi AI voice calls and UPI payment links, all automatic.'}
            </p>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-white font-bold text-sm tracking-wide mb-4">
              {lang === 'hi' ? 'SERVICES' : 'SERVICES'}
            </h4>
            <ul className="space-y-2.5 text-sm">
              {serviceLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-stone-400 hover:text-orange-400 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Pages */}
          <div>
            <h4 className="text-white font-bold text-sm tracking-wide mb-4">
              {lang === 'hi' ? 'PAGES' : 'PAGES'}
            </h4>
            <ul className="space-y-2.5 text-sm">
              {pageLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-stone-400 hover:text-orange-400 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-bold text-sm tracking-wide mb-4">
              {lang === 'hi' ? 'SAMPARK' : 'CONTACT'}
            </h4>
            <ul className="space-y-3 text-sm text-stone-400">
              <li className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 mt-0.5 text-orange-400 flex-shrink-0" />
                <a href="mailto:support@udhari.app" className="hover:text-orange-400 transition-colors">
                  support@udhari.app
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <Phone className="w-4 h-4 mt-0.5 text-orange-400 flex-shrink-0" />
                <span>+91 82002 18733</span>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 mt-0.5 text-orange-400 flex-shrink-0" />
                <span>{lang === 'hi' ? 'Bharat' : 'India'}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 mt-0.5 text-orange-400 flex-shrink-0" />
                <span>{lang === 'hi' ? 'Som–Shan, 10am–7pm' : 'Mon–Sat, 10am–7pm'}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="h-1 rounded-full mt-10 opacity-60 bg-gradient-to-r from-orange-500 via-white to-green-600" />
        <p className="text-center text-xs text-stone-500 mt-6">
          © 2026 Ugaahi.{' '}
          {lang === 'hi' ? 'Sabhi adhikaar surakshit. 🇮🇳' : 'All rights reserved. 🇮🇳'}
        </p>
      </div>
    </footer>
  )
}
