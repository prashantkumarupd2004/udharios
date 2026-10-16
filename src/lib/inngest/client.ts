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
  // NOTE: dead event — koi listener nahi hai (koi function is event ko
  // subscribe nahi karta). Cancellation sirf DB status guards se hoti hai.
  // Ye sends webhooks/payment/[gateway] aur webhooks/razorpay se aate hain;
  // safai ke liye wahan se bhej na band karo ya listener jodo.
  'payments/received': {
    data: {
      outstandingId: string
      merchantId: string
      razorpayPaymentId: string
    }
  }

  // NOTE: 'payment.received' (singular, typo) — dead event, koi listener nahi.
  // Upar wala comment yahan bhi lagu hota hai.
  'payment.received': {
    data: {
      outstandingId: string
      merchantId: string
      gateway: string
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
      // reminderSend voice stage se true aata hai — voiceCall tabhi stage
      // advance karta hai jab Exotel call place confirm kare (emission ≠ placement)
      advanceStage?: boolean
    }
  }

  // Escalate to merchant (escalate.ts listens for 'outstandings/escalate')
  'outstandings/escalate': {
    data: {
      outstandingId: string
      merchantId: string
      customerId: string
      daysOverdue: number
      reason: string
    }
  }
}
