'use client'

import { useEffect, useState } from 'react'
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
  'payment.received': 'text-green-400 border-green-500/30 bg-green-500/10',
  'promise.broken': 'text-red-400 border-red-500/30 bg-red-500/10',
  'dispute.opened': 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  'escalation.triggered': 'text-red-400 border-red-500/30 bg-red-500/10',
  default: 'text-gray-400 border-white/10 bg-white/5',
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
        <h1 className="text-2xl font-bold text-white">
          📜 {lang === 'hi' ? 'Activity Timeline' : 'Activity Timeline'}
        </h1>
        <button
          onClick={() => fetchLogs(1)}
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {lang === 'hi' ? '↻ Refresh' : '↻ Refresh'}
        </button>
      </div>

      {loading && logs.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-gray-500">
            {lang === 'hi' ? 'Abhi koi activity nahi hai' : 'No activity yet'}
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-white/10" />

          <div className="space-y-3">
            {logs.map((log) => {
              const icon = ACTION_ICONS[log.action] ?? ACTION_ICONS.default
              const colorClass = ACTION_COLORS[log.action] ?? ACTION_COLORS.default

              return (
                <div key={log.id} className="flex gap-4 relative">
                  {/* Timeline dot */}
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm flex-shrink-0 z-10 ${colorClass}`}>
                    {icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 glass-card p-3 ml-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {getLabel(log.action, lang)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {log.actor}
                          {log.entity && log.entityId && ` • ${log.entity}:${log.entityId.slice(0, 8)}`}
                        </p>
                        {/* Key payload details */}
                        {log.payload && Object.keys(log.payload).length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {Object.entries(log.payload)
                              .filter(([k]) => !['merchantId', 'customerId', 'outstandingId'].includes(k))
                              .slice(0, 3)
                              .map(([k, v]) => (
                                <span key={k} className="text-xs bg-white/5 text-gray-400 px-2 py-0.5 rounded-full">
                                  {k}: {String(v).slice(0, 30)}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                      <time className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">
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
                className="bg-white/10 hover:bg-white/15 text-white px-6 py-2.5 rounded-xl text-sm transition-all"
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
