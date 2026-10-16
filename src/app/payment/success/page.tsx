import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Payment Successful — Ugaahi',
  description: 'Aapka payment mil gaya hai. Ye page band kar sakte hain.',
}

/**
 * GET /payment/success — payment ke baad gateway yahan redirect karta hai.
 *
 * Ye sirf ek confirmation screen hai — asli reconciliation gateway ke
 * server-to-server webhook (/api/webhooks/payment/[gateway]) se hota hai.
 * Isliye yahan koi "paid" marking nahi hoti.
 */
export default function PaymentSuccessPage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="glass-card w-full max-w-md p-8 text-center">
        {/* Success tick */}
        <div
          aria-hidden
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-10 w-10 text-primary"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>

        <h1 className="font-display text-2xl font-bold text-foreground">
          Payment Successful!
        </h1>
        <p className="mt-2 text-lg font-semibold text-primary">Payment mil gaya ✓</p>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Aapka payment safaltapoorvak receive ho gaya hai.
          <br />
          Aap ye page band kar sakte hain — koi aur step zaroori nahi hai.
        </p>

        <div className="mt-8">
          <Link href="/" className="btn-primary inline-block px-8 py-3">
            Home
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Koi dikkat ho to dukandaar se sampark karein.
        </p>
      </div>
    </main>
  )
}
