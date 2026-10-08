'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, Search, History, Loader2, CheckCircle2, XCircle, FlaskConical } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { CHECK_META, CHECK_TYPES, type CheckType } from '@/lib/verification'

interface HistoryItem {
  id: string
  checkType: string
  input: string
  status: string
  provider: string
  createdAt: string
}

export default function BackgroundCheckPage() {
  const { lang } = useLanguage()
  const [active, setActive] = useState<CheckType | null>(null)
  const [input, setInput] = useState('')
  const [input2, setInput2] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [isMock, setIsMock] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])

  useEffect(() => {
    fetch('/api/verification/check')
      .then(r => r.json())
      .then(d => setHistory(d.history ?? []))
      .catch(() => {})
  }, [])

  const runCheck = async () => {
    if (!active || !input.trim()) return
    setLoading(true); setResult(null); setError('')
    try {
      const r = await fetch('/api/verification/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkType: active, input: input.trim(), input2: input2.trim() || undefined }),
      })
      const d = await r.json()
      if (d.ok) {
        setResult(d.result as Record<string, unknown>)
        setIsMock(!!d.mock)
        setHistory(h => [{ id: d.id, checkType: active, input, status: 'success', provider: 'karza', createdAt: new Date().toISOString() }, ...h].slice(0, 20))
      } else {
        setError(d.error ?? 'Check fail ho gaya')
      }
    } catch {
      setError('Network error')
    }
    setLoading(false)
  }

  const openCard = (t: CheckType) => {
    setActive(t); setInput(''); setInput2(''); setResult(null); setError('')
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-stone-900 flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/30">
            <ShieldCheck className="w-5 h-5 text-white" />
          </span>
          {lang === 'hi' ? 'Business Background Check' : 'Business Background Check'}
        </h1>
        <p className="text-sm text-stone-500 mt-1 ml-11">
          {lang === 'hi' ? 'Customer verify karo — PAN, company, address, credit' : 'Verify customers — PAN, company, address, credit'}
        </p>
      </div>

      {isMock && result && (
        <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800">
          <FlaskConical className="w-4 h-4 shrink-0" />
          {lang === 'hi' ? 'Test mode — sample data dikh raha hai. Live ke liye Karza API key lagao.' : 'Test mode — showing sample data. Add Karza API key for live results.'}
        </div>
      )}

      {/* Check cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {CHECK_TYPES.map(t => {
          const m = CHECK_META[t]
          const isActive = active === t
          return (
            <button
              key={t}
              onClick={() => openCard(t)}
              className={`text-left bg-white rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${
                isActive ? '!border-emerald-400 ring-2 ring-emerald-100' : 'border-stone-200/80'
              }`}
            >
              <div className="text-3xl mb-2">{m.icon}</div>
              <h3 className="font-extrabold text-stone-900">{lang === 'hi' ? m.titleHi : m.title}</h3>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">{lang === 'hi' ? m.descHi : m.desc}</p>
              <span className={`inline-flex items-center gap-1 mt-3 text-xs font-bold ${isActive ? 'text-emerald-700' : 'text-stone-400'}`}>
                <Search className="w-3.5 h-3.5" /> {lang === 'hi' ? 'Check karo' : 'Run check'} →
              </span>
            </button>
          )
        })}
      </div>

      {/* Active check panel */}
      {active && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-md p-6 mb-8">
          <h2 className="font-extrabold text-stone-900 text-lg mb-1">
            {CHECK_META[active].icon} {lang === 'hi' ? CHECK_META[active].titleHi : CHECK_META[active].title}
          </h2>
          <p className="text-xs text-stone-500 mb-4">{lang === 'hi' ? CHECK_META[active].descHi : CHECK_META[active].desc}</p>

          <div className={`grid gap-3 ${active === 'credit_report' ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="field-label">{CHECK_META[active].inputLabel}</label>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={CHECK_META[active].inputPlaceholder}
                className="field"
                onKeyDown={e => e.key === 'Enter' && runCheck()}
              />
            </div>
            {active === 'credit_report' && (
              <div>
                <label className="field-label">{lang === 'hi' ? 'Mobile Number' : 'Mobile Number'}</label>
                <input
                  value={input2}
                  onChange={e => setInput2(e.target.value)}
                  placeholder="9820021873"
                  className="field"
                  onKeyDown={e => e.key === 'Enter' && runCheck()}
                />
              </div>
            )}
          </div>

          <button
            onClick={runCheck}
            disabled={loading || !input.trim()}
            className="btn-primary px-8 py-3 mt-4 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
            {loading ? (lang === 'hi' ? 'Check ho raha...' : 'Checking...') : (lang === 'hi' ? 'Verify Karo' : 'Verify')}
          </button>

          {error && (
            <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <XCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {result && (
            <div className="mt-4 bg-emerald-50/60 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="font-extrabold text-emerald-800">{lang === 'hi' ? 'Verified' : 'Verified'}</span>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {Object.entries(result)
                  .filter(([k]) => !k.startsWith('_'))
                  .map(([k, v]) => (
                    <div key={k} className="flex flex-col">
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                        {k.replace(/([A-Z])/g, ' $1').trim()}
                      </dt>
                      <dd className="text-sm font-semibold text-stone-800">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6">
        <h2 className="font-extrabold text-stone-900 flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-stone-400" />
          {lang === 'hi' ? 'Recent Checks' : 'Recent Checks'}
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-stone-400">{lang === 'hi' ? 'Abhi koi check nahi kiya' : 'No checks yet'}</p>
        ) : (
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{CHECK_META[h.checkType as CheckType]?.icon ?? '🔍'}</span>
                  <div>
                    <p className="text-sm font-bold text-stone-800">{CHECK_META[h.checkType as CheckType]?.title ?? h.checkType}</p>
                    <p className="text-xs text-stone-400 font-mono">{h.input}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${h.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {h.status}
                  </span>
                  <p className="text-[11px] text-stone-400 mt-1">{new Date(h.createdAt).toLocaleDateString('en-IN')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compliance note */}
      <p className="text-[11px] text-stone-400 mt-4 leading-relaxed">
        {lang === 'hi'
          ? '⚠️ Customer ki consent ke bina sensitive checks mat karo. Credit report ke liye RBI compliance zaroori hai.'
          : '⚠️ Do not run sensitive checks without customer consent. Credit reports require RBI compliance.'}
      </p>
    </div>
  )
}
