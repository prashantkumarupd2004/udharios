'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Check, Loader2, Eye, EyeOff, FlaskConical } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'

interface GatewayField {
  key: string
  label: string
  placeholder: string
  secret: boolean
  helpText?: string
}

interface GatewayInfo {
  id: string
  name: string
  description: string
  ready: boolean
  fields: GatewayField[]
}

export default function PaymentGatewaySettings() {
  const { lang } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [gateways, setGateways] = useState<GatewayInfo[]>([])
  const [selected, setSelected] = useState('upi_vpa')
  const [testMode, setTestMode] = useState(true)
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/merchant/payment-gateway')
      .then((r) => r.json())
      .then((d) => {
        setGateways(d.gateways ?? [])
        setSelected(d.current?.gateway ?? 'upi_vpa')
        setTestMode(d.current?.testMode ?? true)
        setCreds(d.current?.credentials ?? {})
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const activeGateway = gateways.find((g) => g.id === selected)

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/merchant/payment-gateway', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: selected, credentials: creds, testMode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setMessage({ type: 'ok', text: data.message })
      // Refresh masked credentials
      const r2 = await fetch('/api/merchant/payment-gateway').then((r) => r.json())
      setCreds(r2.current?.credentials ?? {})
    } catch (e) {
      setMessage({ type: 'err', text: (e as Error).message })
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="glass-card p-5 flex items-center gap-2 text-stone-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading...
      </div>
    )
  }

  return (
    <div className="glass-card p-5 space-y-4">
      <h2 className="font-bold text-stone-900 flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-emerald-600" />
        {lang === 'hi' ? 'Payment Gateway' : 'Payment Gateway'}
        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
          {lang === 'hi' ? 'apna gateway lagao' : 'use your own gateway'}
        </span>
      </h2>
      <p className="text-xs text-stone-500">
        {lang === 'hi'
          ? 'Jiske paas jo payment gateway hai, wo lagao — payment links usi se banenge!'
          : 'Connect your own payment gateway — payment links will be generated through it!'}
      </p>

      {/* Gateway selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {gateways.map((g) => (
          <button
            key={g.id}
            onClick={() => {
              setSelected(g.id)
              setCreds({})
              setMessage(null)
            }}
            className={`p-3 rounded-xl border-2 text-left transition-all ${
              selected === g.id
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-stone-200 hover:border-stone-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-stone-900">{g.name}</span>
              {selected === g.id && <Check className="w-4 h-4 text-emerald-600" />}
            </div>
            <p className="text-[11px] text-stone-500 mt-1">{g.description}</p>
          </button>
        ))}
      </div>

      {/* Credential fields */}
      {activeGateway && activeGateway.fields.length > 0 && (
        <div className="space-y-3 pt-2">
          {activeGateway.fields.map((f) => (
            <div key={f.key}>
              <label className="field-label">{f.label}</label>
              <div className="relative">
                <input
                  type={f.secret && !showSecrets[f.key] ? 'password' : 'text'}
                  value={creds[f.key] ?? ''}
                  onChange={(e) => setCreds((p) => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="field pr-10"
                />
                {f.secret && (
                  <button
                    type="button"
                    onClick={() => setShowSecrets((p) => ({ ...p, [f.key]: !p[f.key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400"
                  >
                    {showSecrets[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
              {f.helpText && <p className="text-xs text-stone-400 mt-1">{f.helpText}</p>}
            </div>
          ))}

          {/* Test mode toggle */}
          {selected !== 'upi_vpa' && (
            <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={testMode}
                onChange={(e) => setTestMode(e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              <FlaskConical className="w-4 h-4 text-amber-500" />
              {lang === 'hi' ? 'Test mode (pehle test karo)' : 'Test mode (try first)'}
            </label>
          )}
        </div>
      )}

      {message && (
        <p
          className={`text-sm font-medium ${
            message.type === 'ok' ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {lang === 'hi' ? 'Gateway Save Karo' : 'Save Gateway'}
      </button>
    </div>
  )
}
