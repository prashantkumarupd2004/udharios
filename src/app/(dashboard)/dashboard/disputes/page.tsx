'use client'

import { useEffect, useState } from 'react'
import { Zap, CheckCircle2 } from 'lucide-react'
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
      <div>
        <h1 className="text-2xl font-extrabold text-stone-900 flex items-center gap-2">
          <Zap className="w-6 h-6 text-orange-600" />
          {lang === 'hi' ? 'Disputes' : 'Disputes'}
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">
          {lang === 'hi' ? 'Customers ki shikaayatein — jaldi suljhao' : 'Customer complaints — resolve them fast'}
        </p>
      </div>

      <div className="flex gap-2">
        {[
          { key: 'open', hi: 'Khule', en: 'Open' },
          { key: 'resolved', hi: 'Suljhe', en: 'Resolved' },
          { key: 'withdrawn', hi: 'Hataye', en: 'Withdrawn' },
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
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-32" />)}
        </div>
      ) : disputes.length === 0 ? (
        <div className="text-center py-16 glass-card">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-stone-500 font-medium">
            {lang === 'hi' ? 'Koi dispute nahi hai! Great.' : 'No disputes! Great.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {disputes.map(d => (
            <div
              key={d.id}
              className={`glass-card card-hover p-4 ${
                d.status === 'open' ? '!border-orange-300' :
                d.status === 'resolved' ? '!border-green-200' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xl flex-shrink-0 text-white shadow-md ${
                  d.status === 'resolved' ? 'bg-green-500 shadow-green-500/25' : 'bg-orange-500 shadow-orange-500/25'
                }`}>
                  {d.status === 'resolved' ? <CheckCircle2 className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-stone-900 text-sm">{d.customer.name}</p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      d.status === 'open' ? 'badge-disputed' :
                      d.status === 'resolved' ? 'badge-paid' : 'badge-written_off'
                    }`}>
                      {d.status === 'open' ? (lang === 'hi' ? 'Khula' : 'Open') :
                       d.status === 'resolved' ? (lang === 'hi' ? 'Sulja ✓' : 'Resolved ✓') :
                       (lang === 'hi' ? 'Hataya' : 'Withdrawn')}
                    </span>
                  </div>

                  <p className="text-sm text-stone-600 mt-1.5 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                    “{d.reason}”
                  </p>

                  {d.resolution && (
                    <p className="text-xs text-green-700 mt-2 italic bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      ✓ {lang === 'hi' ? 'Resolution:' : 'Resolution:'} {d.resolution}
                    </p>
                  )}

                  <p className="text-xs text-stone-400 mt-1.5">{formatIndianDate(d.createdAt)}</p>

                  {d.status === 'open' && (
                    <>
                      {resolving === d.id ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={resolution}
                            onChange={e => setResolution(e.target.value)}
                            placeholder={lang === 'hi' ? 'Resolution detail likhein...' : 'Describe the resolution...'}
                            rows={2}
                            className="field resize-none text-sm"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleResolve(d.id)}
                              disabled={!resolution.trim()}
                              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
                            >
                              {lang === 'hi' ? 'Resolve Karo' : 'Mark Resolved'}
                            </button>
                            <button
                              onClick={() => { setResolving(null); setResolution('') }}
                              className="btn-ghost px-4 py-2 text-xs"
                            >
                              {lang === 'hi' ? 'Cancel' : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setResolving(d.id)}
                          className="mt-2 text-xs font-bold text-green-700 hover:text-green-800 transition-colors"
                        >
                          ✓ {lang === 'hi' ? 'Resolve Karo' : 'Resolve'}
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-stone-900 amount-display">
                    {formatINR(parseFloat(d.outstanding.amount))}
                  </p>
                  {d.outstanding.invoiceNo && (
                    <p className="text-xs text-stone-400">#{d.outstanding.invoiceNo}</p>
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
