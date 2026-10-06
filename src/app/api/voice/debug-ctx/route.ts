/**
 * TEMPORARY debug endpoint — resolves a ctx ref and reports each step.
 * DELETE before production.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decodeCtx } from '@/lib/voice-ctx'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ref = new URL(req.url).searchParams.get('ref') ?? ''
  const out: Record<string, unknown> = { ref }

  try {
    out.decodeDirect = !!decodeCtx(ref)
  } catch (e) {
    out.decodeError = String(e)
  }

  try {
    const session = await prisma.voiceCallSession.findUnique({ where: { id: ref } })
    out.dbFound = !!session
    out.dbCtxJsonLength = session?.ctxJson?.length ?? 0
    out.dbCtxHasGreeting = session ? session.ctxJson.includes('greetingUrl') : false
  } catch (e) {
    out.dbError = String(e).slice(0, 500)
  }

  try {
    const count = await prisma.voiceCallSession.count()
    out.totalSessions = count
  } catch (e) {
    out.countError = String(e).slice(0, 200)
  }

  return NextResponse.json(out)
}
