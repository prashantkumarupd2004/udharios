import type { Metadata, Viewport } from 'next'
import { Inter, Sora } from 'next/font/google'
import './globals.css'
import { LanguageProvider } from '@/hooks/useLanguage'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
  weight: ['600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'Ugaahi — AI Payment Collection for Indian Merchants',
  description:
    'WhatsApp reminders, AI voice calls, aur UPI payment links — sab automatic. Apni ugahi karo bina tension ke.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ugaahi',
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: 'Ugaahi',
    title: 'Ugaahi — AI Payment Collection',
    description: 'Automate your udhaari collection with WhatsApp & AI voice calls',
  },
}

export const viewport: Viewport = {
  themeColor: '#EA580C',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="hi" className={`${inter.variable} ${sora.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased bg-[#FDF9F1] text-stone-900 min-h-screen">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
