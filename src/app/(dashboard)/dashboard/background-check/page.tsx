'use client'

import { useEffect, useState } from 'react'
import {
  ShieldCheck, Search, History, Loader2, CheckCircle2, XCircle,
  FlaskConical, ArrowRight, BadgeCheck, Building2, Fingerprint,
} from 'lucide-react'
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

// Professional icon mapping (Lucide instead of emoji)
const CHECK_ICONS: Record<CheckType, typeof Fingerprint> = {
  pan_check: Fingerprint,
  company_check: Building2,
  mobile_to_pan: BadgeCheck,
  mobile_to_address: ShieldCheck,
  profile_360: Search,
  pan_to_contact: BadgeCheck,
  credit_report: ShieldCheck,
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
    <div className="pb-8">
      {/* ── Professional Hero Header ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-800 to-orange-950 p-8 mb-8 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-orange-500 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-amber-500 rounded-full blur-3xl" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/40">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">
                Business Background Check
              </h1>
              <p className="text-orange-200/80 text-sm mt-1 font-medium">
                {lang === 'hi'
                  ? 'Enterprise-grade verification — PAN, company, address, credit'
                  : 'Enterprise-grade verification — PAN, company, address, credit'}
              </p>
            </div>
          </div>
          <div className="flex gap-6 mt-6 text-white/90">
            <div>
              <p className="text-2xl font-extrabold">7</p>
              <p className="text-xs text-orange-200/70 font-medium uppercase tracking-wide">Check Types</p>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <p className="text-2xl font-extrabold">{history.length}</p>
              <p className="text-xs text-orange-200/70 font-medium uppercase tracking-wide">Checks Done</p>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <p className="text-2xl font-extrabold text-emerald-400">Live</p>
              <p className="text-xs text-orange-200/70 font-medium uppercase tracking-wide">Status</p>
            </div>
          </div>
        </div>
      </div>

      {isMock && result && (
        <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 text-sm text-amber-800 shadow-sm">
          <FlaskConical className="w-5 h-5 shrink-0 text-amber-600" />
          <p className="font-medium">
            {lang === 'hi'
              ? 'Test mode — sample data dikh raha hai. Live results ke liye Karza API key lagao.'
              : 'Test mode — showing sample data. Add Karza API key for live results.'}
          </p>
        </div>
      )}

      {/* ── Verification Services Grid ── */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-stone-900 tracking-tight">
          {lang === 'hi' ? 'Verification Services' : 'Verification Services'}
        </h2>
        <p className="text-xs text-stone-400 font-medium">Powered by Karza</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        {CHECK_TYPES.map(t => {
          const m = CHECK_META[t]
          const Icon = CHECK_ICONS[t]
          const isActive = active === t
          return (
            <button
              key={t}
              onClick={() => openCard(t)}
              className={`group text-left bg-white rounded-2xl border p-5 transition-all duration-200 hover:shadow-lg hover:shadow-orange-100 hover:-translate-y-1 ${
                isActive
                  ? 'border-orange-400 ring-2 ring-orange-100 shadow-lg shadow-orange-100'
                  : 'border-stone-200/70 shadow-sm hover:border-orange-200'
              }`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                isActive
                  ? 'bg-gradient-to-br from-orange-500 to-amber-500 shadow-md shadow-orange-500/30'
                  : 'bg-orange-50 group-hover:bg-orange-100'
              }`}>
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-orange-600'}`} />
              </div>
              <h3 className="font-bold text-stone-900 text-[15px]">{lang === 'hi' ? m.titleHi : m.title}</h3>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed line-clamp-2">{lang === 'hi' ? m.descHi : m.desc}</p>
              <span className={`inline-flex items-center gap-1 mt-3 text-xs font-bold transition-colors ${
                isActive ? 'text-orange-600' : 'text-stone-400 group-hover:text-orange-500'
              }`}>
                {lang === 'hi' ? 'Check karo' : 'Run check'}
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Active Check Panel ── */}
      {active && (
        <div className="bg-white rounded-3xl border border-stone-200/70 shadow-xl shadow-stone-200/50 p-7 mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md shadow-orange-500/25">
              {(() => { const I = CHECK_ICONS[active]; return <I className="w-5 h-5 text-white" /> })()}
            </div>
            <div>
              <h2 className="font-extrabold text-stone-900 text-lg tracking-tight">
                {lang === 'hi' ? CHECK_META[active].titleHi : CHECK_META[active].title}
              </h2>
              <p className="text-xs text-stone-500">{lang === 'hi' ? CHECK_META[active].descHi : CHECK_META[active].desc}</p>
            </div>
          </div>

          <div className={`grid gap-4 mt-5 ${active === 'credit_report' ? 'sm:grid-cols-2' : 'grid-cols-1 max-w-md'}`}>
            <div>
              <label className="block text-xs font-bold text-stone-600 uppercase tracking-wide mb-1.5">
                {CHECK_META[active].inputLabel}
              </label>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={CHECK_META[active].inputPlaceholder}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-semibold text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
                onKeyDown={e => e.key === 'Enter' && runCheck()}
              />
            </div>
            {active === 'credit_report' && (
              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase tracking-wide mb-1.5">
                  {lang === 'hi' ? 'Mobile Number' : 'Mobile Number'}
                </label>
                <input
                  value={input2}
                  onChange={e => setInput2(e.target.value)}
                  placeholder="9820021873"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-semibold text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
                  onKeyDown={e => e.key === 'Enter' && runCheck()}
                />
              </div>
            )}
          </div>

          <button
            onClick={runCheck}
            disabled={loading || !input.trim()}
            className="mt-5 inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm px-8 py-3.5 rounded-xl shadow-lg shadow-orange-500/25 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? (lang === 'hi' ? 'Verify ho raha...' : 'Verifying...') : (lang === 'hi' ? 'Verify Karo' : 'Verify Now')}
          </button>

          {error && (
            <div className="mt-5 flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700 font-medium">
              <XCircle className="w-5 h-5 shrink-0 text-red-500" /> {error}
            </div>
          )}

          {result && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-6">
              <div className="flex items-center gap-2.5 mb-4 pb-4 border-b border-emerald-100">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/30">
                  <CheckCircle2 className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <p className="font-extrabold text-emerald-800 text-sm">Verification Successful</p>
                  <p className="text-xs text-emerald-600/70">Verified just now</p>
                </div>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                {Object.entries(result)
                  .filter(([k]) => !k.startsWith('_'))
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-0.5">
                        {k.replace(/([A-Z])/g, ' $1').trim()}
                      </dt>
                      <dd className="text-sm font-bold text-stone-900">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {/* ── History ── */}
      <div className="bg-white rounded-3xl border border-stone-200/70 shadow-sm p-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-extrabold text-stone-900 tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
              <History className="w-4 h-4 text-stone-500" />
            </div>
            {lang === 'hi' ? 'Verification History' : 'Verification History'}
          </h2>
          <span className="text-xs font-bold bg-stone-100 text-stone-500 px-2.5 py-1 rounded-full">
            {history.length} total
          </span>
        </div>
        {history.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6 text-stone-300" />
            </div>
            <p className="text-sm font-semibold text-stone-500">{lang === 'hi' ? 'Abhi koi verification nahi ki' : 'No verifications yet'}</p>
            <p className="text-xs text-stone-400 mt-1">{lang === 'hi' ? 'Upar se koi service chuno' : 'Select a service above to get started'}</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {history.map(h => {
              const Icon = CHECK_ICONS[h.checkType as CheckType] ?? Search
              return (
                <div key={h.id} className="flex items-center justify-between py-3.5">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                      <Icon className="w-4.5 h-4.5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-stone-900">{CHECK_META[h.checkType as CheckType]?.title ?? h.checkType}</p>
                      <p className="text-xs text-stone-400 font-mono mt-0.5">{h.input}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                      h.status === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {h.status === 'success' && <CheckCircle2 className="w-3 h-3" />}
                      {h.status}
                    </span>
                    <p className="text-[11px] text-stone-400 mt-1">{new Date(h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Compliance note */}
      <div className="mt-6 flex gap-3 bg-stone-50 border border-stone-200/60 rounded-2xl p-4">
        <ShieldCheck className="w-5 h-5 text-stone-400 shrink-0 mt-0.5" />
        <p className="text-xs text-stone-500 leading-relaxed">
          {lang === 'hi'
            ? 'Customer ki consent ke bina sensitive checks na karein. Credit report ke liye RBI compliance avashyak hai. Sabhi verifications audit trail me record hoti hain.'
            : 'Do not run sensitive checks without customer consent. Credit reports require RBI compliance. All verifications are recorded in the audit trail.'}
        </p>
      </div>
    </div>
  )
}
