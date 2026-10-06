'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, ScrollText } from 'lucide-react'

interface Log {
  id: string
  actor: string
  action: string
  entity: string
  entityId: string
  payload: unknown
  createdAt: string
  merchantName: string
  merchantPhone: string
}

const ACTION_LABELS: Record<string, string> = {
  'admin.access_request.approved': '✅ Request approved',
  'admin.kill_switch.activated': '🚫 Merchant suspended',
  'admin.kill_switch.deactivated': '✅ Merchant unsuspended',
  'admin.trial.extended': '⏰ Trial extended',
}

export default function AuditPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/audit?limit=100${filter ? `&action=${encodeURIComponent(filter)}` : ''}`)
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json()
      if (data.ok) setLogs(data.logs)
    } finally {
      setLoading(false)
    }
  }, [filter, router])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen bg-[#0c0a09] text-white">
      <header className="border-b border-stone-800 bg-stone-950/80 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link href="/admin" className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-extrabold text-lg flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-orange-400" /> Audit Log
            </h1>
            <p className="text-stone-500 text-xs">Kaunne kab kya kiya — sab record</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-2 mb-6 flex-wrap">
          {['', 'admin.access_request', 'admin.kill_switch', 'admin.trial'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-bold ${filter === f ? 'bg-orange-600' : 'bg-stone-800 hover:bg-stone-700'}`}>
              {f === '' ? 'Sab' : f.replace('admin.', '')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>
        ) : logs.length === 0 ? (
          <p className="text-center text-stone-500 py-12">Koi activity nahi hai abhi.</p>
        ) : (
          <div className="space-y-2">
            {logs.map(l => (
              <div key={l.id} className="bg-stone-900/70 border border-stone-800 rounded-xl px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{ACTION_LABELS[l.action] ?? l.action}</p>
                  <p className="text-stone-500 text-xs mt-0.5">
                    {l.merchantName} ({l.merchantPhone}) • by {l.actor}
                  </p>
                </div>
                <span className="text-stone-500 text-xs shrink-0">
                  {new Date(l.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
