/**
 * src/lib/merchant.ts — Merchant provisioning (used by admin approval flow).
 *
 * A merchant is ONLY created here — never implicitly at OTP login.
 * Access flow: client submits AccessRequest → admin approves → provisionMerchant()
 * → client can log in via OTP.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { addDays } from '@/lib/date-utils'

export interface ProvisionMerchantInput {
  phone: string // E.164, e.g. +919820021873
  businessName: string
  ownerName?: string
}

/**
 * Create an approved merchant with owner user + default reminder rule.
 * Idempotent on phone: returns existing merchant if already present.
 */
export async function provisionMerchant(input: ProvisionMerchantInput) {
  const existing = await prisma.merchant.findFirst({
    where: { phone: input.phone },
    include: { users: { where: { role: 'owner' } } },
  })
  if (existing) {
    // Ensure it's marked approved (e.g. approving a request for an old record)
    if (!existing.isApproved) {
      const updated = await prisma.merchant.update({
        where: { id: existing.id },
        data: { isApproved: true },
        include: { users: { where: { role: 'owner' } } },
      })
      return updated
    }
    return existing
  }

  const merchant = await prisma.merchant.create({
    data: {
      phone: input.phone,
      businessName: input.businessName,
      plan: 'trial',
      trialEndsAt: addDays(new Date(), 14),
      isApproved: true,
      users: { create: { role: 'owner', name: input.ownerName ?? '' } },
    },
    include: { users: { where: { role: 'owner' } } },
  })

  await prisma.reminderRule.create({
    data: {
      merchantId: merchant.id,
      name: 'Default',
      isDefault: true,
      stages: [
        { dayOffset: 1, channel: 'whatsapp', templateName: 'T1_polite' },
        { dayOffset: 3, channel: 'whatsapp', templateName: 'T2_with_link' },
        { dayOffset: 5, channel: 'whatsapp', templateName: 'T3_firm' },
        { dayOffset: 7, channel: 'voice', templateName: null },
        { dayOffset: 10, channel: 'voice', templateName: null },
        { dayOffset: 14, channel: 'whatsapp', templateName: 'T4_final' },
        { dayOffset: 15, channel: 'escalate', templateName: null },
      ],
    },
  })

  logger.info('Merchant provisioned via approval', { merchantId: merchant.id, phone: input.phone })
  return merchant
}
