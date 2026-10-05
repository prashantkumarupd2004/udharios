'use client'

import { useEffect, useState } from 'react'
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
      <h1 className="text-2xl font-bold text-white">
        🤝 {lang === 'hi' ? 'Payment Promises' : 'Payment Promises'}
      </h1>

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
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {lang === 'hi' ? f.hi : f.en}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      ) : promises.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🤝</div>
          <p className="text-gray-500">
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
                className={`glass-card p-4 ${
                  p.status === 'broken' ? 'border-red-500/20' :
                  p.status === 'kept' ? 'border-green-500/20' :
                  expired ? 'border-orange-500/20' : 'border-white/10'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    p.status === 'kept' ? 'bg-green-500/20 text-green-400' :
                    p.status === 'broken' ? 'bg-red-500/20 text-red-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {p.customer.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white text-sm">{p.customer.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        p.status === 'kept' ? 'badge-paid' :
                        p.status === 'broken' ? 'badge-overdue' :
                        expired ? 'badge-disputed' : 'badge-promised'
                      }`}>
                        {p.status === 'kept' ? (lang === 'hi' ? 'Rakha ✓' : 'Kept ✓') :
                         p.status === 'broken' ? (lang === 'hi' ? 'Toot Gaya' : 'Broken') :
                         expired ? (lang === 'hi' ? 'Expired!' : 'Expired!') :
                         (lang === 'hi' ? 'Khula' : 'Open')}
                      </span>
                      <span className="text-xs text-gray-500 capitalize">{p.source}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {lang === 'hi' ? 'Payment date:' : 'Promised date:'} <span className="text-yellow-400 font-medium">{formatIndianDate(p.promisedDate)}</span>
                    </p>
                    {p.notes && (
                      <p className="text-xs text-gray-600 mt-1 italic">{p.notes}</p>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-white font-mono">
                      {formatINR(parseFloat(p.outstanding.amount))}
                    </p>
                    {p.outstanding.invoiceNo && (
                      <p className="text-xs text-gray-600">#{p.outstanding.invoiceNo}</p>
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
