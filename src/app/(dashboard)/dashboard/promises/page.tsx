'use client'

import { useEffect, useState } from 'react'
import { Handshake } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { formatINR, formatIndianDate } from '@/lib/date-utils'

interface Promise_ {
  id: string
  promisedDate: string
  status: 'open' | 'kept' | 'broken'
  source: string
  notes: string | null
  outstanding: { id: string; amount: string; invoiceNo: string | null; status: string }
  customer: { id: string; name: string; phone: string }
}

export default function PromisesPage() {
  const { lang } = useLanguage()
  const [promises, setPromises] = useState<Promise_[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')

  useEffect(() => {
    fetch(`/api/promises?status=${filter}`)
      .then(r => r.json())
      .then(d => { setPromises(d.promises ?? []); setLoading(false) })
  }, [filter])

  const isExpired = (date: string) => new Date(date) < new Date()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-stone-900 flex items-center gap-2">
          <Handshake className="w-6 h-6 text-amber-600" />
          {lang === 'hi' ? 'Payment Promises' : 'Payment Promises'}
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">
          {lang === 'hi' ? 'Customers ne kab payment ka vaada kiya' : 'When customers promised to pay'}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { key: 'open', hi: 'Khule', en: 'Open' },
          { key: 'kept', hi: 'Rakhe', en: 'Kept' },
          { key: 'broken', hi: 'Toote', en: 'Broken' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setLoading(true) }}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
              filter === f.key
                ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/30'
                : 'bg-white text-stone-600 border-stone-200 hover:border-orange-300 hover:text-orange-700'
            }`}
          >
            {lang === 'hi' ? f.hi : f.en}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28" />)}
        </div>
      ) : promises.length === 0 ? (
        <div className="text-center py-16 glass-card">
          <div className="text-4xl mb-3">🤝</div>
          <p className="text-stone-500 font-medium">
            {lang === 'hi' ? 'Is category mein koi promise nahi' : 'No promises in this category'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {promises.map(p => {
            const expired = p.status === 'open' && isExpired(p.promisedDate)
            return (
              <div
                key={p.id}
                className={`glass-card card-hover p-4 ${
                  p.status === 'broken' ? '!border-red-200' :
                  p.status === 'kept' ? '!border-green-200' :
                  expired ? '!border-orange-300' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-base font-extrabold flex-shrink-0 text-white shadow-md ${
                    p.status === 'kept' ? 'bg-green-500 shadow-green-500/25' :
                    p.status === 'broken' ? 'bg-red-500 shadow-red-500/25' :
                    'bg-amber-500 shadow-amber-500/25'
                  }`}>
                    {p.customer.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-stone-900 text-sm">{p.customer.name}</p>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                        p.status === 'kept' ? 'badge-paid' :
                        p.status === 'broken' ? 'badge-overdue' :
                        expired ? 'badge-disputed' : 'badge-promised'
                      }`}>
                        {p.status === 'kept' ? (lang === 'hi' ? 'Rakha ✓' : 'Kept ✓') :
                         p.status === 'broken' ? (lang === 'hi' ? 'Toot Gaya' : 'Broken') :
                         expired ? (lang === 'hi' ? 'Expired!' : 'Expired!') :
                         (lang === 'hi' ? 'Khula' : 'Open')}
                      </span>
                      <span className="text-xs text-stone-400 capitalize font-medium">{p.source}</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-1.5">
                      {lang === 'hi' ? 'Payment date:' : 'Promised date:'}{' '}
                      <span className={`font-bold ${expired ? 'text-orange-700' : 'text-amber-700'}`}>
                        {formatIndianDate(p.promisedDate)}
                      </span>
                    </p>
                    {p.notes && (
                      <p className="text-xs text-stone-500 mt-1 italic bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5">
                        “{p.notes}”
                      </p>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-stone-900 amount-display">
                      {formatINR(parseFloat(p.outstanding.amount))}
                    </p>
                    {p.outstanding.invoiceNo && (
                      <p className="text-xs text-stone-400">#{p.outstanding.invoiceNo}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
