/**
 * POST /api/customers/import — CSV/Excel import with column mapping
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { importCustomerRowSchema } from '@/validations'
import { appendAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { logger } from '@/lib/logger'

async function getMerchantId(request: NextRequest): Promise<string | null> {
  const session = await getSession()
    if (!session?.merchantId) return null
return session.merchantId ?? null
}

export async function POST(request: NextRequest) {
  try {
    const merchantId = await getMerchantId(request)
    if (!merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Expected body: { rows: Array<{name, phone, notes?, consent?}> }
    const { rows, columnMap } = body as {
      rows: Record<string, string>[]
      columnMap: { name: string; phone: string; notes?: string }
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
    }

    if (rows.length > 500) {
      return NextResponse.json(
        { error: 'Maximum 500 rows per import' },
        { status: 400 }
      )
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as Array<{ row: number; error: string }>,
    }

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i]

      try {
        const mapped = {
          name: raw[columnMap.name]?.toString().trim(),
          phone: raw[columnMap.phone]?.toString().trim(),
          notes: columnMap.notes ? raw[columnMap.notes]?.toString().trim() : undefined,
          consent: true, // Merchant confirmed consent for all imported rows
        }

        const validated = importCustomerRowSchema.parse(mapped)

        // Normalize phone
        const phone = validated.phone.startsWith('+91')
          ? validated.phone
          : `+91${validated.phone.replace(/^0/, '')}`

        // Upsert — skip if phone already exists under this merchant
        const existing = await prisma.customer.findFirst({
          where: { merchantId, phone },
        })

        if (existing) {
          results.skipped++
          continue
        }

        await prisma.customer.create({
          data: {
            merchantId,
            name: validated.name,
            phone,
            consent: true,
            consentAt: new Date(),
            notes: validated.notes,
          },
        })

        results.imported++
      } catch (rowErr) {
        results.errors.push({
          row: i + 1,
          error: String(rowErr),
        })
      }
    }

    await appendAuditLog({
      merchantId,
      actor: 'merchant',
      action: AUDIT_ACTIONS.CUSTOMER_CREATED,
      entity: 'customer',
      entityId: merchantId, // bulk import — use merchantId as entityId
      payload: { imported: results.imported, skipped: results.skipped, total: rows.length },
    })

    logger.info('Customer import complete', { merchantId, ...results })

    return NextResponse.json({ results })
  } catch (err) {
    logger.error('Customer import error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
