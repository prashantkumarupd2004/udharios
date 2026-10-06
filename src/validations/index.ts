/**
 * Zod validation schemas for Udhari OS
 * All API inputs are validated through these schemas
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const sendOtpSchema = z.object({
  // Accept: 9876543210 | +919876543210 | 919876543210
  phone: z
    .string()
    .regex(
      /^(\+91|91)?[6-9]\d{9}$/,
      'Valid Indian mobile number required (10 digits, starting 6-9)'
    ),
})

export const verifyOtpSchema = z.object({
  phone: z.string().regex(/^(\+91|91)?[6-9]\d{9}$/, 'Valid Indian mobile number required'),
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/),
})

export const retryVoiceSchema = z.object({
  phone: z.string().regex(/^(\+91|91)?[6-9]\d{9}$/, 'Valid Indian mobile number required'),
})

// ---------------------------------------------------------------------------
// Access requests (gated signup)
// ---------------------------------------------------------------------------

export const accessRequestSchema = z.object({
  name: z.string().min(2, 'Apna naam likhein').max(100),
  businessName: z.string().min(2, 'Business ka naam likhein').max(100),
  phone: z
    .string()
    .regex(/^(\+91|91)?[6-9]\d{9}$/, 'Valid Indian mobile number required'),
  email: z.string().email('Valid email likhein').optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  businessType: z
    .enum(['kirana', 'wholesale', 'distributor', 'pharmacy', 'hardware', 'textile', 'electronics', 'other'])
    .optional(),
  monthlyVolume: z
    .enum(['under_1L', '1L_5L', '5L_25L', 'above_25L'])
    .optional(),
  message: z.string().max(1000).optional().or(z.literal('')),
})

// ---------------------------------------------------------------------------
// Merchant onboarding
// ---------------------------------------------------------------------------

export const onboardingSchema = z.object({
  businessName: z.string().min(2, 'Business name required').max(100),
  category: z.enum(['kirana', 'wholesale', 'distributor', 'pharmacy', 'hardware', 'general']),
  upiVpa: z
    .string()
    .regex(/^[\w.\-+]+@[\w]+$/, 'Valid UPI VPA required (e.g. merchant@upi)')
    .optional(),
  quietStart: z.string().regex(/^\d{2}:\d{2}$/).default('21:00'),
  quietEnd: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
})

// ---------------------------------------------------------------------------
// Customers (M2)
// ---------------------------------------------------------------------------

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name required').max(100),
  phone: z
    .string()
    .regex(/^(\+91)?[6-9]\d{9}$/, 'Valid Indian mobile number required'),
  consent: z.boolean().refine(val => val === true, {
    message: 'Customer consent is required before adding',
  }),
  notes: z.string().max(500).optional(),
})

export const updateCustomerSchema = createCustomerSchema.partial().omit({ consent: true })

export const importCustomerRowSchema = z.object({
  name: z.string().min(1),
  phone: z.string().regex(/^(\+91)?[6-9]\d{9}$/),
  notes: z.string().optional(),
  consent: z.boolean().optional().default(false),
})

// ---------------------------------------------------------------------------
// Outstandings / Udhaari (M3)
// ---------------------------------------------------------------------------

export const createOutstandingSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  invoiceNo: z.string().max(50).optional(),
  amount: z
    .number()
    .positive('Amount must be positive')
    .max(10_000_000, 'Amount too large'),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')
    .refine(
      d => new Date(d) >= new Date(new Date().toDateString()),
      'Due date cannot be in the past'
    ),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        qty: z.number().positive().optional(),
        rate: z.number().positive().optional(),
        amount: z.number().positive().optional(),
      })
    )
    .optional(),
  notes: z.string().max(1000).optional(),
})

export const updateOutstandingSchema = z.object({
  invoiceNo: z.string().max(50).optional(),
  amount: z.number().positive().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z
    .enum(['upcoming', 'overdue', 'promised', 'disputed', 'paid', 'written_off'])
    .optional(),
  notes: z.string().max(1000).optional(),
})

// ---------------------------------------------------------------------------
// Reminder Rules (M4)
// ---------------------------------------------------------------------------

export const reminderStageSchema = z.object({
  dayOffset: z.number().int().min(0).max(90),
  channel: z.enum(['whatsapp', 'sms', 'voice', 'escalate']),
  templateName: z.string().nullable(),
})

export const createReminderRuleSchema = z.object({
  name: z.string().min(1).max(100),
  isDefault: z.boolean().default(false),
  stages: z
    .array(reminderStageSchema)
    .min(1, 'At least one stage required')
    .max(20, 'Maximum 20 stages')
    .refine(
      stages => {
        // Stages must be in ascending dayOffset order
        for (let i = 1; i < stages.length; i++) {
          if (stages[i].dayOffset <= stages[i - 1].dayOffset) return false
        }
        return true
      },
      { message: 'Stage day offsets must be in ascending order' }
    ),
})

export const updateReminderRuleSchema = createReminderRuleSchema.partial()

// ---------------------------------------------------------------------------
// Payment Links (M6)
// ---------------------------------------------------------------------------

export const createPaymentLinkSchema = z.object({
  outstandingId: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// Promises (M8)
// ---------------------------------------------------------------------------

export const createPromiseSchema = z.object({
  outstandingId: z.string().uuid(),
  promisedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .refine(
      d => new Date(d) >= new Date(new Date().toDateString()),
      'Promised date must be today or in the future'
    ),
  source: z.enum(['whatsapp', 'voice', 'manual']).default('manual'),
  notes: z.string().max(500).optional(),
})

// ---------------------------------------------------------------------------
// Disputes (M8)
// ---------------------------------------------------------------------------

export const createDisputeSchema = z.object({
  outstandingId: z.string().uuid(),
  reason: z.string().min(5, 'Please describe the dispute').max(1000),
})

export const resolveDisputeSchema = z.object({
  resolution: z.string().min(5, 'Please describe the resolution').max(1000),
})

// ---------------------------------------------------------------------------
// Calls (M7)
// ---------------------------------------------------------------------------

export const triggerCallSchema = z.object({
  outstandingId: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// Subscriptions (M14)
// ---------------------------------------------------------------------------

export const createSubscriptionSchema = z.object({
  plan: z.enum(['starter', 'pro']),
})

// ---------------------------------------------------------------------------
// Admin (M11)
// ---------------------------------------------------------------------------

export const killSwitchSchema = z.object({
  merchantId: z.string().uuid(),
  enabled: z.boolean(),
  reason: z.string().min(5).max(500).optional(),
})

// ---------------------------------------------------------------------------
// Pagination helpers
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type SendOtpInput = z.infer<typeof sendOtpSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
export type RetryVoiceInput = z.infer<typeof retryVoiceSchema>
export type OnboardingInput = z.infer<typeof onboardingSchema>
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>
export type CreateOutstandingInput = z.infer<typeof createOutstandingSchema>
export type CreateReminderRuleInput = z.infer<typeof createReminderRuleSchema>
export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>
export type CreatePromiseInput = z.infer<typeof createPromiseSchema>
export type CreateDisputeInput = z.infer<typeof createDisputeSchema>
export type TriggerCallInput = z.infer<typeof triggerCallSchema>
