/**
 * MSG91 Standard OTP API — server-side only (no captcha needed)
 *
 * Send:   GET https://control.msg91.com/api/v5/otp
 *         Headers: { authkey }
 *         Params:  mobile=91XXXXXXXXXX, otp_length=6, otp_expiry=5
 *
 * Verify: GET https://control.msg91.com/api/v5/otp/verify
 *         Headers: { authkey }
 *         Params:  mobile=91XXXXXXXXXX, otp=XXXXXX
 *
 * Retry:  GET https://control.msg91.com/api/v5/otp/retry
 *         Headers: { authkey }
 *         Params:  mobile=91XXXXXXXXXX, retrytype=voice
 *
 * Auth key stays server-side — never logged, never in response.
 */

import { logger } from '@/lib/logger'

const BASE = 'https://control.msg91.com/api/v5/otp'

function getAuthKey(): string {
  return process.env.MSG91_AUTH_KEY ?? ''
}

/** 9876543210 / +919876543210 / 919876543210 → "919876543210" */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '')
  if (d.length === 10 && /^[6-9]/.test(d)) return `91${d}`
  if (d.length === 12 && d.startsWith('91') && /^[6-9]/.test(d[2])) return d
  return null
}

/** "919876543210" → "+919876543210" for DB */
export function toE164(n: string): string {
  return `+${n.replace(/\D/g, '')}`
}

type SendResult   = { ok: true } | { ok: false; error: 'send_failed' }
type VerifyResult = { ok: true } | { ok: false; error: 'wrong_otp' | 'expired' | 'failed' }

async function msg91Get(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const authKey = getAuthKey()
  const qs = new URLSearchParams(params).toString()
  const url = `${BASE}${path}?${qs}`

  const res = await fetch(url, {
    method: 'GET',
    headers: { authkey: authKey, accept: 'application/json' },
  })

  let data: Record<string, unknown> = {}
  try { data = await res.json() } catch { /* ignore non-JSON */ }
  return data
}

export async function msg91SendOtp(mobile91: string): Promise<SendResult> {
  if (!getAuthKey()) { logger.error('MSG91_AUTH_KEY not set'); return { ok: false, error: 'send_failed' } }

  try {
    const data = await msg91Get('', {
      mobile: mobile91,
      otp_length: '6',
      otp_expiry: '5',
      ...(process.env.MSG91_OTP_TEMPLATE_ID ? { template_id: process.env.MSG91_OTP_TEMPLATE_ID } : {}),
    })

    logger.info('MSG91 send response', { type: data.type, message: data.message })

    if (data.type === 'success') return { ok: true }

    logger.error('MSG91 send failed', { type: data.type, message: data.message })
    return { ok: false, error: 'send_failed' }
  } catch (err) {
    logger.error('MSG91 send error', { error: String(err) })
    return { ok: false, error: 'send_failed' }
  }
}

export async function msg91VerifyOtp(mobile91: string, otp: string): Promise<VerifyResult> {
  if (!getAuthKey()) { logger.error('MSG91_AUTH_KEY not set'); return { ok: false, error: 'failed' } }

  try {
    const data = await msg91Get('/verify', { mobile: mobile91, otp })

    logger.info('MSG91 verify response', { type: data.type, message: data.message })

    if (data.type === 'success') return { ok: true }

    const msg = String(data.message ?? '').toLowerCase()
    if (msg.includes('expir')) return { ok: false, error: 'expired' }

    return { ok: false, error: 'wrong_otp' }
  } catch (err) {
    logger.error('MSG91 verify error', { error: String(err) })
    return { ok: false, error: 'failed' }
  }
}

export async function msg91RetryVoice(mobile91: string): Promise<SendResult> {
  if (!getAuthKey()) { logger.error('MSG91_AUTH_KEY not set'); return { ok: false, error: 'send_failed' } }

  try {
    const data = await msg91Get('/retry', { mobile: mobile91, retrytype: 'voice' })
    if (data.type === 'success') return { ok: true }
    logger.warn('MSG91 voice retry failed', { type: data.type, message: data.message })
    return { ok: false, error: 'send_failed' }
  } catch (err) {
    logger.error('MSG91 voice retry error', { error: String(err) })
    return { ok: false, error: 'send_failed' }
  }
}
