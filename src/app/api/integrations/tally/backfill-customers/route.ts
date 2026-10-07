/**
 * POST /api/integrations/tally/backfill-customers — Repair: create missing
 * Customer records from existing Bills.
 *
 * Kabhi-kabhi bill sync ho jata hai par customer record miss ho jata hai
 * (purana upload, transient DB error). Ye endpoint bills ke partyName se
 * missing customers banata hai. Idempotent — dobara chalana safe hai.
 */
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function POST() {
  try {
    const session = await getSession()
    if (!session?.merchantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const merchantId = session.merchantId

    // Saare bills ke unique party names
    const bills = await prisma.bill.findMany({
      where: { merchantId },
      select: { partyName: true, partyPhone: true, billRef: true },
    })

    let created = 0
    let matched = 0
    let consentFixed = 0
    const seen = new Set<string>()

    // Pehle: Tally se aaye purane customers ka consent fix karo
    // (existing debtors — transactional reminders ke liye implied consent)
    const tallyCustomers = await prisma.customer.findMany({
      where: {
        merchantId,
        consent: false,
        OR: [
          { notes: { contains: 'Tally', mode: 'insensitive' } },
          { phone: { startsWith: 'tally-' } },
        ],
      },
      select: { id: true },
    })
    if (tallyCustomers.length > 0) {
      const upd = await prisma.customer.updateMany({
        where: { id: { in: tallyCustomers.map(c => c.id) } },
        data: { consent: true, consentAt: new Date() },
      })
      consentFixed = upd.count
    }

    for (const b of bills) {
      const partyName = (b.partyName ?? '').trim()
      if (!partyName || seen.has(partyName.toLowerCase())) continue
      seen.add(partyName.toLowerCase())

      // Pehle se customer hai?
      let customer = null
      const phone = (b.partyPhone ?? '').trim()
      if (phone) {
        customer = await prisma.customer.findUnique({
          where: { merchantId_phone: { merchantId, phone } },
        })
      }
      if (!customer) {
        customer = await prisma.customer.findFirst({
          where: { merchantId, name: { equals: partyName, mode: 'insensitive' } },
        })
      }
      if (customer) {
        matched++
        continue
      }

      // Missing — banao
      try {
        await prisma.customer.create({
          data: {
            merchantId,
            name: partyName,
            phone: phone || `tally-${b.billRef}-${Date.now().toString(36)}`,
            notes: 'Backfill: Tally bills se auto-created',
          },
        })
        created++
      } catch (err) {
        // Race / duplicate — dobara check karo
        const retry = await prisma.customer.findFirst({
          where: { merchantId, name: { equals: partyName, mode: 'insensitive' } },
        })
        if (retry) matched++
        else logger.error('Backfill customer create failed', { partyName, error: String(err) })
      }
    }

    return NextResponse.json({ ok: true, created, matched, consentFixed, totalParties: seen.size })
  } catch (err) {
    logger.error('Backfill customers error', { error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
