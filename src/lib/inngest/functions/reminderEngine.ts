/**
 * Inngest: Nightly Reminder Engine (M4)
 * Runs at 09:30 IST daily (quiet hours 21:00-09:00 ke baad, taaki WhatsApp turant bheja ja sake)
 * Scans all overdue/upcoming outstandings and schedules the next reminder stage
 */

import { inngest } from '@/lib/inngest/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { todayIST, overdueDays } from '@/lib/date-utils'

export const nightlyReminderScan = inngest.createFunction(
  {
    id: 'nightly-reminder-scan',
    name: 'Nightly Reminder Scan',
    triggers: [{ cron: '0 4 * * *' }], // 04:00 UTC = 09:30 IST (quiet hours 21:00-09:00 ke baad)
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    logger.info('Starting nightly reminder scan')

    // Fetch all non-terminal outstandings
    const outstandings = await step.run('fetch-outstandings', async () => {
      const today = new Date(todayIST())

      return prisma.outstanding.findMany({
        where: {
          status: { in: ['upcoming', 'overdue'] },
          dueDate: { lte: today },
          merchant: { isKillSwitched: false },
        },
        include: {
          merchant: {
            include: { reminderRules: true },
          },
        },
        take: 500,
      })
    })

    logger.info('Found outstandings to process', { count: outstandings.length })

    // For each outstanding, check reminder eligibility and enqueue
    const tasks = outstandings.map(async (os) => {
      // Check if there's a valid reminder rule
      const defaultRule = os.merchant.reminderRules.find(r => r.isDefault)
      if (!defaultRule) {
        logger.warn('No default reminder rule found', { merchantId: os.merchantId })
        return
      }

      const stages = defaultRule.stages as Array<{
        dayOffset: number
        channel: string
        templateName: string | null
      }>

      const nextStageIdx = os.currentStage
      if (nextStageIdx >= stages.length) {
        logger.info('Outstanding has exhausted all stages', { outstandingId: os.id })
        return
      }

      const nextStage = stages[nextStageIdx]
      const daysOver = overdueDays(os.dueDate)

      // Only trigger if we've passed the required dayOffset
      if (daysOver < nextStage.dayOffset) {
        return
      }

      // Escalation stage — notify merchant and stop
      if (nextStage.channel === 'escalate') {
        await step.invoke(`escalate-${os.id}`, {
          function: escalateToMerchant,
          data: {
            outstandingId: os.id,
            merchantId: os.merchantId,
            customerId: os.customerId,
            daysOverdue: daysOver,
          },
        })
        return
      }

      // Voice or WhatsApp stage
      await step.invoke(`send-reminder-${os.id}-stage-${nextStageIdx}`, {
        function: sendStagedReminder,
        data: {
          outstandingId: os.id,
          merchantId: os.merchantId,
          customerId: os.customerId,
          stageIndex: nextStageIdx,
          channel: nextStage.channel as 'whatsapp' | 'voice',
          templateName: nextStage.templateName,
        },
      })
    })

    await Promise.allSettled(tasks)

    logger.info('Nightly reminder scan complete')
    return { processed: outstandings.length }
  }
)

// Import at bottom to avoid circular refs
import { sendStagedReminder } from './reminderSend'
import { escalateToMerchant } from './escalate'
