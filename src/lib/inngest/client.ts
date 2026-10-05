import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'udhari-os',
  name: 'Udhari OS',
  // Event key is used to send events to Inngest
  eventKey: process.env.INNGEST_EVENT_KEY,
})

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type UdhariEvents = {
  // Nightly reminder scan
  'reminders/scan.nightly': { data: { triggeredAt: string } }

  // Send a single reminder
  'reminders/send.staged': {
    data: {
      outstandingId: string
      merchantId: string
      customerId: string
      stageIndex: number
    }
  }

  // Payment received — cancel pending reminders
  'payments/received': {
    data: {
      outstandingId: string
      merchantId: string
      razorpayPaymentId: string
    }
  }

  // Promise created — pause reminders until promise date
  'promises/created': {
    data: {
      outstandingId: string
      merchantId: string
      promisedDate: string   // ISO date string
      promiseId: string
    }
  }

  // Promise date arrived — check if still unpaid
  'promises/follow-up': {
    data: {
      outstandingId: string
      merchantId: string
      promiseId: string
    }
  }

  // Trigger AI voice call
  'calls/trigger': {
    data: {
      outstandingId: string
      merchantId: string
      customerId: string
      retryCount?: number
    }
  }

  // Escalate to merchant
  'escalations/trigger': {
    data: {
      outstandingId: string
      merchantId: string
      customerId: string
      reason: string
    }
  }
}
