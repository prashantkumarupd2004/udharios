/**
 * POST /api/integrations/tally/connect — Connect Tally (generate sync-agent API key)
 * Auth: JWT session cookie
 * Body: { companyName: string }
 * Returns the API key ONCE — merchant pastes it into the sync agent.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { generateTallyApiKey } from '@/lib/tally'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  companyName: z.string().min(2).max(120),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = schema.parse(await request.json())
    const { key, hash } = generateTallyApiKey()

    const conn = await prisma.tallyConnection.upsert({
      where: { merchantId: session.merchantId },
      update: { companyName: data.companyName, apiKeyHash: hash, status: 'active' },
      create: {
        merchantId: session.merchantId,
        companyName: data.companyName,
        apiKeyHash: hash,
        status: 'active',
      },
    })

    logger.info('Tally connected', { merchantId: session.merchantId, company: data.companyName })

    return NextResponse.json({
      apiKey: key,
      companyName: conn.companyName,
      warning: 'Ye key sirf ek baar dikhegi — sync agent me turant paste kar lein',
    })
  } catch (err) {
    logger.error('POST /api/integrations/tally/connect error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
