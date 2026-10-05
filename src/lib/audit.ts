import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Append an immutable audit log entry.
 * This function ONLY inserts — never updates or deletes.
 * The payload hash is SHA-256 of the JSON-serialized payload.
 */
export async function appendAuditLog({
  merchantId,
  actor,
  action,
  entity,
  entityId,
  payload,
}: {
  merchantId: string
  actor: string       // "system" | supabase_uid | "webhook:razorpay" | "webhook:whatsapp"
  action: string      // "reminder.sent" | "payment.received" | "call.placed" | etc.
  entity: string      // "outstanding" | "customer" | "call" | "payment"
  entityId: string
  payload: Record<string, unknown>
}) {
  try {
    const payloadJson = JSON.stringify(payload)
    const payloadHash = crypto
      .createHash('sha256')
      .update(payloadJson)
      .digest('hex')

    await prisma.auditLog.create({
      data: {
        merchantId,
        actor,
        action,
        entity,
        entityId,
        payload: JSON.parse(JSON.stringify(payload)),
        payloadHash,
      },
    })

    logger.debug('Audit log appended', { action, entity, entityId })
  } catch (err) {
    // Audit log failure should never crash the main flow
    logger.error('Failed to append audit log', {
      error: String(err),
      action,
      entity,
      entityId,
    })
  }
}

/**
 * Common audit actions — use these constants to avoid typos
 */
export const AUDIT_ACTIONS = {
  // Reminders
  REMINDER_SENT: 'reminder.sent',
  REMINDER_FAILED: 'reminder.failed',
  REMINDER_DELIVERED: 'reminder.delivered',
  REMINDER_READ: 'reminder.read',

  // Payments
  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_LINK_CREATED: 'payment_link.created',
  PAYMENT_MISMATCH: 'payment.amount_mismatch',

  // Calls
  CALL_PLACED: 'call.placed',
  CALL_COMPLETED: 'call.completed',
  CALL_FAILED: 'call.failed',

  // Promises
  PROMISE_CREATED: 'promise.created',
  PROMISE_BROKEN: 'promise.broken',
  PROMISE_KEPT: 'promise.kept',

  // Disputes
  DISPUTE_OPENED: 'dispute.opened',
  DISPUTE_RESOLVED: 'dispute.resolved',

  // Escalations
  ESCALATION_TRIGGERED: 'escalation.triggered',

  // Customer
  CUSTOMER_OPTED_OUT: 'customer.opted_out',
  CUSTOMER_CREATED: 'customer.created',

  // Outstanding
  OUTSTANDING_CREATED: 'outstanding.created',
  OUTSTANDING_PAID: 'outstanding.paid',
  OUTSTANDING_WRITTEN_OFF: 'outstanding.written_off',

  // Subscriptions
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_ACTIVATED: 'subscription.activated',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',

  // Merchant
  MERCHANT_UPDATED: 'merchant.updated',
  MERCHANT_CREATED: 'merchant.created',

  // Admin
  KILL_SWITCH_ACTIVATED: 'admin.kill_switch.activated',
  KILL_SWITCH_DEACTIVATED: 'admin.kill_switch.deactivated',
} as const
