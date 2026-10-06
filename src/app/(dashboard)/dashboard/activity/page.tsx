'use client'

import { useEffect, useState } from 'react'
import { ScrollText, RefreshCw } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { formatIndianDate } from '@/lib/date-utils'

interface AuditLog {
  id: string
  actor: string
  action: string
  entity: string
  entityId: string
  createdAt: string
  payload: Record<string, unknown>
}

const ACTION_ICONS: Record<string, string> = {
  'reminder.sent': '💬',
  'payment.received': '✅',
  'call.placed': '📞',
  'call.completed': '📞',
  'promise.created': '🤝',
  'promise.kept': '🤝',
  'promise.broken': '💔',
  'dispute.opened': '⚡',
  'escalation.triggered': '🚨',
  'customer.created': '👤',
  'outstanding.created': '📋',
  'payment.link.created': '💳',
  default: '📌',
}

const ACTION_COLORS: Record<string, string> = {
  'payment.received': 'text-green-700 border-green-200 bg-green-50',
  'promise.broken': 'text-red-700 border-red-200 bg-red-50',
  'dispute.opened': 'text-orange-700 border-orange-200 bg-orange-50',
  'escalation.triggered': 'text-red-700 border-red-200 bg-red-50',
  default: 'text-stone-500 border-stone-200 bg-white',
}

function getLabel(action: string, lang: string): string {
  const labels: Record<string, { hi: string; en: string }> = {
    'reminder.sent': { hi: 'Reminder bheja gaya', en: 'Reminder sent' },
    'payment.received': { hi: 'Payment mili', en: 'Payment received' },
    'call.placed': { hi: 'Call ki gayi', en: 'Call placed' },
    'call.completed': { hi: 'Call complete', en: 'Call completed' },
    'promise.created': { hi: 'Promise liya', en: 'Promise recorded' },
    'promise.kept': { hi: 'Promise rakha', en: 'Promise kept' },
    'promise.broken': { hi: 'Promise toot gaya', en: 'Promise broken' },
    'dispute.opened': { hi: 'Dispute khola', en: 'Dispute opened' },
    'escalation.triggered': { hi: 'Escalation ki gayi', en: 'Escalated' },
    'customer.created': { hi: 'Customer add kiya', en: 'Customer added' },
    'outstanding.created': { hi: 'Udhaar add kiya', en: 'Outstanding added' },
    'payment.link.created': { hi: 'Payment link banaya', en: 'Payment link created' },
  }
  const match = labels[action]
  if (!match) return action
  return lang === 'hi' ? match.hi : match.en
}

export default function ActivityPage() {
  const { lang } = useLanguage()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const fetchLogs = async (p = 1) => {
    setLoading(true)
    const res = await fetch(`/api/activity?page=${p}&limit=30`)
    const data = await res.json()
    const newLogs = data.logs ?? []
    if (p === 1) {
      setLogs(newLogs)
    } else {
      setLogs(prev => [...prev, ...newLogs])
    }
    setHasMore(p < data.pagination?.pages)
    setLoading(false)
  }

  useEffect(() => { fetchLogs(1) }, [])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900 flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-orange-600" />
            {lang === 'hi' ? 'Activity Timeline' : 'Activity Timeline'}
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {lang === 'hi' ? 'System ne kya-kya kiya, sab hisaab' : 'Everything the system did, accounted'}
          </p>
        </div>
        <button
          onClick={() => fetchLogs(1)}
          className="text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" /> {lang === 'hi' ? 'Refresh' : 'Refresh'}
        </button>
      </div>

      {loading && logs.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-20" />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 glass-card">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-stone-500 font-medium">
            {lang === 'hi' ? 'Abhi koi activity nahi hai' : 'No activity yet'}
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-orange-200 via-amber-100 to-transparent rounded" />

          <div className="space-y-3">
            {logs.map((log) => {
              const icon = ACTION_ICONS[log.action] ?? ACTION_ICONS.default
              const colorClass = ACTION_COLORS[log.action] ?? ACTION_COLORS.default

              return (
                <div key={log.id} className="flex gap-4 relative">
                  <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm flex-shrink-0 z-10 shadow-sm ${colorClass}`}>
                    {icon}
                  </div>

                  <div className="flex-1 glass-card p-3.5 ml-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-900">
                          {getLabel(log.action, lang)}
                        </p>
                        <p className="text-xs text-stone-500 mt-0.5 font-medium">
                          {log.actor}
                          {log.entity && log.entityId && ` • ${log.entity}:${log.entityId.slice(0, 8)}`}
                        </p>
                        {log.payload && Object.keys(log.payload).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {Object.entries(log.payload)
                              .filter(([k]) => !['merchantId', 'customerId', 'outstandingId'].includes(k))
                              .slice(0, 3)
                              .map(([k, v]) => (
                                <span key={k} className="text-[11px] font-medium bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full border border-stone-200">
                                  {k}: {String(v).slice(0, 30)}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                      <time className="text-xs text-stone-400 whitespace-nowrap flex-shrink-0 font-medium">
                        {formatIndianDate(log.createdAt)}
                      </time>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {hasMore && (
            <div className="mt-4 text-center">
              <button
                onClick={() => { const p = page + 1; setPage(p); fetchLogs(p) }}
                disabled={loading}
                className="btn-ghost px-6 py-2.5 text-sm"
              >
                {loading ? '...' : (lang === 'hi' ? 'Aur load karein' : 'Load more')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
