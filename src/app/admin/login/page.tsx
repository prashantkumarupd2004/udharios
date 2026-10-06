'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Lock, Mail, Loader2 } from 'lucide-react'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (data.ok) {
        router.push(data.redirectTo ?? '/admin')
        router.refresh()
        return
      }
      setError(
        data.error === 'too_many_attempts'
          ? 'Bahut koshish — 15 min baad try karo.'
          : data.error === 'not_configured'
            ? 'Admin login configure nahi hai. Env vars check karo.'
            : 'Galat email ya password.'
      )
    } catch {
      setError('Network error — dobara try karo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0c0a09] flex items-center justify-center px-4 relative overflow-hidden">
      {/* ambient glow */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-orange-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-amber-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 items-center justify-center shadow-xl shadow-orange-500/30 mb-4">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Ugaahi Admin</h1>
          <p className="text-stone-400 text-sm mt-1">Control panel — authorized only</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-stone-900/80 backdrop-blur border border-stone-800 rounded-3xl p-8 shadow-2xl"
        >
          <label className="block text-xs font-bold text-stone-400 mb-2 tracking-wide">
            ADMIN EMAIL
          </label>
          <div className="relative mb-5">
            <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@ugaahi.com"
              className="w-full bg-stone-800/80 border border-stone-700 rounded-xl pl-11 pr-4 py-3 text-white placeholder:text-stone-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
            />
          </div>

          <label className="block text-xs font-bold text-stone-400 mb-2 tracking-wide">
            PASSWORD
          </label>
          <div className="relative mb-6">
            <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-stone-800/80 border border-stone-700 rounded-xl pl-11 pr-4 py-3 text-white placeholder:text-stone-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center mb-4 bg-red-950/50 border border-red-900 rounded-xl px-3 py-2.5 font-medium">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white font-bold hover:from-orange-600 hover:to-amber-700 disabled:opacity-60 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-4 h-4" />}
            {loading ? 'Verifying…' : 'Login to Admin Panel'}
          </button>
        </form>

        <p className="text-center text-stone-600 text-xs mt-6">
          🔒 Ye page sirf Ugaahi team ke liye hai
        </p>
      </div>
    </div>
  )
}
