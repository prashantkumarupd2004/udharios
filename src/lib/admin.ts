/**
 * src/lib/admin.ts — Admin gate for /api/admin/* and /admin/* pages.
 *
 * The admin is identified by phone number via the ADMIN_PHONE_NUMBERS env var
 * (comma-separated E.164 numbers, e.g. +919820021873,+919876543210).
 * The caller must have a valid session; we resolve their merchant phone
 * and check it against the allowlist.
 */

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { normalizePhone, toE164 } from '@/lib/msg91'

export interface AdminContext {
  merchantId: string
  userId: string
  phone: string
}

function adminPhones(): string[] {
  return (process.env.ADMIN_PHONE_NUMBERS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(p => {
      const n = normalizePhone(p)
      return n ? toE164(n) : p
    })
}

/**
 * Returns admin context if the session belongs to an allowlisted admin phone,
 * otherwise null. Use at the top of every /api/admin/* route.
 */
export async function requireAdmin(): Promise<AdminContext | null> {
  const session = await getSession()
  if (!session) return null

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { merchant: { select: { id: true, phone: true } } },
  })
  if (!user?.merchant) return null

  const allowed = adminPhones()
  if (allowed.length === 0) return null
  if (!allowed.includes(user.merchant.phone)) return null

  return { merchantId: user.merchant.id, userId: user.id, phone: user.merchant.phone }
}
