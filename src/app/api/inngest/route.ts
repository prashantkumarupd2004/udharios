/**
 * Inngest route handler — serves all Inngest functions
 */

import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { nightlyReminderScan } from '@/lib/inngest/functions/reminderEngine'
import { sendStagedReminder } from '@/lib/inngest/functions/reminderSend'
import { promiseFollowUp } from '@/lib/inngest/functions/promiseFollowUp'
import { escalateToMerchant } from '@/lib/inngest/functions/escalate'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    nightlyReminderScan,
    sendStagedReminder,
    promiseFollowUp,
    escalateToMerchant,
  ],
})
