/**
 * In-memory rate limiter for OTP operations.
 *
 * This is intentionally in-memory (not Redis) for simplicity in early
 * production. In a multi-instance deployment, replace with Redis.
 *
 * Limits:
 *   - Max 3 OTP sends per phone per hour
 *   - Min 45 seconds between sends
 *   - Max 5 verify attempts per phone per 15 minutes
 */

interface SendRecord {
  timestamps: number[]  // epoch ms of each send attempt
  lastSendAt: number    // epoch ms of last send
}

interface VerifyRecord {
  windowStart: number   // start of 15-min window
  attempts: number
}

// Keyed by normalized phone (91XXXXXXXXXX)
const sendMap = new Map<string, SendRecord>()
const verifyMap = new Map<string, VerifyRecord>()

const SEND_HOUR_MS    = 60 * 60 * 1000   // 1 hour
const SEND_COOLDOWN_MS = 45 * 1000        // 45 seconds
const MAX_SENDS_PER_HOUR = 3

const VERIFY_WINDOW_MS = 15 * 60 * 1000  // 15 minutes
const MAX_VERIFY_ATTEMPTS = 5

// Cleanup stale entries every 30 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now()
  for (const [phone, rec] of sendMap.entries()) {
    // Remove if last activity was > 2 hours ago
    if (now - rec.lastSendAt > 2 * SEND_HOUR_MS) sendMap.delete(phone)
  }
  for (const [phone, rec] of verifyMap.entries()) {
    if (now - rec.windowStart > 2 * VERIFY_WINDOW_MS) verifyMap.delete(phone)
  }
}, 30 * 60 * 1000)

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: 'cooldown'; retryAfterSec: number }
  | { allowed: false; reason: 'hourly_limit' }
  | { allowed: false; reason: 'too_many_attempts' }

/**
 * Check + record a send attempt.
 * Call BEFORE sending the OTP.
 */
export function checkAndRecordSend(phone: string): RateLimitResult {
  const now = Date.now()
  const rec = sendMap.get(phone) ?? { timestamps: [], lastSendAt: 0 }

  // Cooldown check
  if (rec.lastSendAt > 0) {
    const elapsed = now - rec.lastSendAt
    if (elapsed < SEND_COOLDOWN_MS) {
      return {
        allowed: false,
        reason: 'cooldown',
        retryAfterSec: Math.ceil((SEND_COOLDOWN_MS - elapsed) / 1000),
      }
    }
  }

  // Hourly limit — drop timestamps older than 1 hour
  const recent = rec.timestamps.filter(t => now - t < SEND_HOUR_MS)
  if (recent.length >= MAX_SENDS_PER_HOUR) {
    return { allowed: false, reason: 'hourly_limit' }
  }

  // Record this attempt
  recent.push(now)
  sendMap.set(phone, { timestamps: recent, lastSendAt: now })

  return { allowed: true }
}

/**
 * Check + record a verify attempt.
 * Call BEFORE verifying the OTP.
 * On success, call resetVerifyAttempts() to clear the counter.
 */
export function checkAndRecordVerify(phone: string): RateLimitResult {
  const now = Date.now()
  const rec = verifyMap.get(phone) ?? { windowStart: now, attempts: 0 }

  // Reset window if expired
  if (now - rec.windowStart > VERIFY_WINDOW_MS) {
    verifyMap.set(phone, { windowStart: now, attempts: 1 })
    return { allowed: true }
  }

  if (rec.attempts >= MAX_VERIFY_ATTEMPTS) {
    return { allowed: false, reason: 'too_many_attempts' }
  }

  verifyMap.set(phone, { windowStart: rec.windowStart, attempts: rec.attempts + 1 })
  return { allowed: true }
}

/**
 * Clear verify attempts after a successful login.
 */
export function resetVerifyAttempts(phone: string): void {
  verifyMap.delete(phone)
}

/**
 * Current send state for a phone (for UI feedback).
 */
export function getSendCooldown(phone: string): number {
  const rec = sendMap.get(phone)
  if (!rec) return 0
  const elapsed = Date.now() - rec.lastSendAt
  return elapsed < SEND_COOLDOWN_MS ? Math.ceil((SEND_COOLDOWN_MS - elapsed) / 1000) : 0
}
