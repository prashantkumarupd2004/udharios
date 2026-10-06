'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Loader2, ArrowLeft, Ban, CheckCircle2 } from 'lucide-react'

interface Merchant {
  id: string
  businessName: string
  phone: string
  email: string | null
  plan: string
  isApproved: boolean
  isKillSwitched: boolean
  trialEndsAt: string | null
  createdAt: string
  customers: number
  reminders: number
  calls: number
}

export default function AdminMerchantsPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/merchants?search=${encodeURIComponent(q)}&limit=50`)
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json()
      if (data.ok) {
        setMerchants(data.merchants)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { load('') }, [load])

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => load(query), 400)
    return () => clearTimeout(id)
  }, [query, load])

  return (
    <div className="min-h-screen bg-[#0c0a09] text-white">
      <header className="border-b border-stone-800 bg-stone-950/80 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link href="/admin" className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-extrabold text-lg">Merchants</h1>
            <p className="text-stone-500 text-xs">{total} total</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="relative mb-6">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search: naam, mobile, ya email…"
            className="w-full bg-stone-900 border border-stone-800 rounded-2xl pl-12 pr-4 py-3.5 text-white placeholder:text-stone-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>
        ) : merchants.length === 0 ? (
          <p className="text-center text-stone-500 py-12">Koi merchant nahi mila.</p>
        ) : (
          <div className="grid gap-3">
            {merchants.map(m => (
              <Link key={m.id} href={`/admin/merchants/${m.id}`}
                className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 hover:border-orange-700 transition-all flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold truncate">{m.businessName}</p>
                    {m.isKillSwitched && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-950 text-red-400 flex items-center gap-1">
                        <Ban className="w-3 h-3" /> Suspended
                      </span>
                    )}
                    {!m.isApproved && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-400">Unapproved</span>
                    )}
                  </div>
                  <p className="text-stone-400 text-sm">{m.phone}{m.email ? ` • ${m.email}` : ''}</p>
                  <p className="text-stone-500 text-xs mt-1">
                    {m.customers} customers • {m.reminders} msgs • {m.calls} calls
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-stone-800 text-stone-300 capitalize">{m.plan}</span>
                  {m.isApproved && <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto mt-1.5" />}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
