/**
 * Resolves a VoiceAgentContext from a short reference.
 *
 * Exotel truncates the connect-API CustomField (~400 chars), so the full
 * context (with pre-synthesized greetingUrl) is stored in the
 * voice_call_sessions table and only the callId travels over the wire.
 * For backwards compatibility, a full base64url-encoded ctx is also accepted.
 */
import { prisma } from '@/lib/prisma'
import type { VoiceAgentContext } from '@/lib/voice-agent'
import { logger } from '@/lib/logger'

export function decodeCtx(raw: string | null): VoiceAgentContext | null {
  if (!raw) return null
  try {
    const json = Buffer.from(
      raw.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8')
    const ctx = JSON.parse(json) as VoiceAgentContext
    if (ctx && typeof ctx.callId === 'string') return ctx
    return null
  } catch {
    return null
  }
}

export function encodeCtx(ctx: VoiceAgentContext): string {
  return Buffer.from(JSON.stringify(ctx), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Persist ctx for a call; returns nothing (throws on DB failure). */
export async function saveVoiceCtx(callId: string, ctx: VoiceAgentContext): Promise<void> {
  await prisma.voiceCallSession.upsert({
    where: { id: callId },
    update: { ctxJson: JSON.stringify(ctx) },
    create: { id: callId, ctxJson: JSON.stringify(ctx) },
  })
}

/**
 * Resolve ctx from either a full base64url payload or a callId
 * that references voice_call_sessions.
 */
export async function resolveVoiceCtx(raw: string | null): Promise<VoiceAgentContext | null> {
  const direct = decodeCtx(raw)
  if (direct) return direct
  if (!raw) return null

  // Treat as callId -> DB lookup
  try {
    const session = await prisma.voiceCallSession.findUnique({ where: { id: raw } })
    if (!session) {
      logger.error('Voice ctx not found for callId', { callId: raw })
      return null
    }
    const ctx = JSON.parse(session.ctxJson) as VoiceAgentContext
    if (ctx && typeof ctx.callId === 'string') return ctx
    return null
  } catch (err) {
    logger.error('Voice ctx DB lookup failed', { callId: raw, error: String(err) })
    return null
  }
}
