'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { formatINR, formatIndianDate } from '@/lib/date-utils'

interface Dispute {
  id: string
  reason: string
  status: 'open' | 'resolved' | 'withdrawn'
  resolution: string | null
  createdAt: string
  outstanding: { id: string; amount: string; invoiceNo: string | null; status: string }
  customer: { id: string; name: string; phone: string }
}

export default function DisputesPage() {
  const { lang } = useLanguage()
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')
  const [resolving, setResolving] = useState<string | null>(null)
  const [resolution, setResolution] = useState('')

  const fetchDisputes = async (status = filter) => {
    setLoading(true)
    const res = await fetch(`/api/disputes?status=${status}`)
    const data = await res.json()
    setDisputes(data.disputes ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchDisputes(filter) }, [filter])

  const handleResolve = async (disputeId: string) => {
    if (!resolution.trim()) return
    await fetch(`/api/disputes/${disputeId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution }),
    })
    setResolving(null)
    setResolution('')
    fetchDisputes(filter)
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-white">
        ⚡ {lang === 'hi' ? 'Disputes' : 'Disputes'}
      </h1>

      <div className="flex gap-2">
        {[
          { key: 'open', hi: 'Khule', en: 'Open' },
          { key: 'resolved', hi: 'Suljhe', en: 'Resolved' },
          { key: 'withdrawn', hi: 'Hataye', en: 'Withdrawn' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setLoading(true) }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f.key
                ? 'bg-orange-600 text-white'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {lang === 'hi' ? f.hi : f.en}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
        </div>
      ) : disputes.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-gray-500">
            {lang === 'hi' ? 'Koi dispute nahi hai! Great.' : 'No disputes! Great.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {disputes.map(d => (
            <div
              key={d.id}
              className={`glass-card p-4 ${
                d.status === 'open' ? 'border-orange-500/20' :
                d.status === 'resolved' ? 'border-green-500/20' : 'border-white/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${
                  d.status === 'open' ? 'bg-orange-500/20' : 'bg-green-500/20'
                }`}>
                  {d.status === 'resolved' ? '✅' : '⚡'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white text-sm">{d.customer.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      d.status === 'open' ? 'badge-disputed' :
                      d.status === 'resolved' ? 'badge-paid' : 'badge-written_off'
                    }`}>
                      {d.status === 'open' ? (lang === 'hi' ? 'Khula' : 'Open') :
                       d.status === 'resolved' ? (lang === 'hi' ? 'Sulja' : 'Resolved') :
                       (lang === 'hi' ? 'Hataya' : 'Withdrawn')}
                    </span>
                  </div>

                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{d.reason}</p>

                  {d.resolution && (
                    <p className="text-xs text-green-400 mt-1 italic">
                      {lang === 'hi' ? 'Resolution:' : 'Resolution:'} {d.resolution}
                    </p>
                  )}

                  <p className="text-xs text-gray-600 mt-1">{formatIndianDate(d.createdAt)}</p>

                  {d.status === 'open' && (
                    <>
                      {resolving === d.id ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={resolution}
                            onChange={e => setResolution(e.target.value)}
                            placeholder={lang === 'hi' ? 'Resolution detail likhein...' : 'Describe the resolution...'}
                            rows={2}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-green-500 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleResolve(d.id)}
                              disabled={!resolution.trim()}
                              className="bg-green-600 hover:bg-green-500 disabled:bg-green-900 text-white px-4 py-2 rounded-xl text-xs font-medium transition-all"
                            >
                              {lang === 'hi' ? 'Resolve Karo' : 'Mark Resolved'}
                            </button>
                            <button
                              onClick={() => { setResolving(null); setResolution('') }}
                              className="bg-white/10 text-white px-4 py-2 rounded-xl text-xs"
                            >
                              {lang === 'hi' ? 'Cancel' : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setResolving(d.id)}
                          className="mt-2 text-xs text-green-400 hover:text-green-300 transition-colors"
                        >
                          {lang === 'hi' ? '✓ Resolve Karo' : '✓ Resolve'}
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-white font-mono">
                    {formatINR(parseFloat(d.outstanding.amount))}
                  </p>
                  {d.outstanding.invoiceNo && (
                    <p className="text-xs text-gray-600">#{d.outstanding.invoiceNo}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
