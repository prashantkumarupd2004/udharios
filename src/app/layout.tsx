import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { LanguageProvider } from '@/hooks/useLanguage'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Udhari OS — AI Payment Collection for Indian Merchants',
  description:
    'WhatsApp reminders, AI voice calls, aur UPI payment links — sab automatic. Apna udhaari vasool karo bina tension ke.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Udhari OS',
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: 'Udhari OS',
    title: 'Udhari OS — AI Payment Collection',
    description: 'Automate your udhaari collection with WhatsApp & AI voice calls',
  },
}

export const viewport: Viewport = {
  themeColor: '#6366f1',
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
    <html lang="hi" className={inter.variable}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased bg-gray-950 text-gray-100 min-h-screen">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
