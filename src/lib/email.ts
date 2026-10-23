/**
 * Email reminders — company customers ke liye professional payment
 * reminder emails (Resend API, plain fetch — koi SDK dependency nahi).
 *
 * Env:
 *   RESEND_API_KEY — Resend dashboard se
 *   EMAIL_FROM     — verified domain ka from address
 *                    (default: reminders@ugaahi.in)
 *
 * Template user-approved design (Oct 2026): navy header + business name,
 * invoice details box, green Pay Now button, "already paid? disregard"
 * line. Tone ladder: mail 1 = Gentle, mail 2–3 = Firm (Second Reminder),
 * mail 4–5 = Final Reminder.
 */

const RESEND_API_URL = 'https://api.resend.com/emails'

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

export async function sendEmail({
  to,
  subject,
  html,
  fromName,
}: {
  to: string
  subject: string
  html: string
  fromName: string
}): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY configured nahi hai')
  const fromAddress = process.env.EMAIL_FROM ?? 'reminders@ugaahi.in'

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromAddress}>`,
      to: [to],
      subject,
      html,
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${await res.text()}`)
  }
  const data = (await res.json()) as { id?: string }
  return { id: data.id ?? '' }
}

const COMPANY_HINT =
  /(pvt|private|ltd|limited|company|enterprises|industries|traders|stores|solutions|technologies|group|llp|inc)/i

function inr(amount: number): string {
  return amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function longDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function buildPaymentReminderEmail({
  businessName,
  merchantPhone,
  customerName,
  invoiceNo,
  amount,
  dueDate,
  daysOverdue,
  paymentLink,
  reminderNumber,
}: {
  businessName: string
  merchantPhone: string
  customerName: string
  invoiceNo: string
  amount: number
  dueDate: Date
  daysOverdue: number
  paymentLink: string | null
  /** 1-based: ab tak bheji gayi mails + 1 */
  reminderNumber: number
}): { subject: string; html: string } {
  const amountStr = inr(amount)
  const tier =
    reminderNumber <= 1 ? 'gentle' : reminderNumber <= 3 ? 'firm' : 'final'

  const subject =
    tier === 'gentle'
      ? `Payment Reminder: Invoice ${invoiceNo} — ₹${amountStr} due`
      : tier === 'firm'
        ? `Second Reminder: Invoice ${invoiceNo} — ₹${amountStr} pending`
        : `Final Reminder: Invoice ${invoiceNo} — ₹${amountStr} pending`

  const statusText =
    daysOverdue <= 0
      ? 'due for payment today'
      : `now overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`

  const intro =
    tier === 'gentle'
      ? `This is a gentle reminder that the following invoice is ${statusText}. We would appreciate it if the payment could be processed at the earliest.`
      : tier === 'firm'
        ? `This is a follow-up to our earlier reminder. The following invoice is ${statusText} and is still awaiting payment. Request you to please process it on priority.`
        : `Despite our earlier reminders, the following invoice is ${statusText} and remains unpaid. Request you to treat this as urgent and process the payment immediately, or contact us to discuss.`

  const greeting = COMPANY_HINT.test(customerName)
    ? 'Dear Accounts Team,'
    : `Dear ${customerName},`

  const payBlock = paymentLink
    ? `
          <tr>
            <td align="center" style="padding:24px 36px 6px 36px;">
              <a href="${paymentLink}" style="display:inline-block;background-color:#00B33F;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;padding:14px 42px;border-radius:10px;">
                Pay Now — ₹${amountStr}
              </a>
              <p style="margin:12px 0 0 0;font-size:12px;color:#94A3B8;">
                Button not working? Open this link: ${paymentLink}
              </p>
            </td>
          </tr>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#E8EDF2;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#E8EDF2;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background-color:#00203D;padding:26px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#ffffff;font-size:20px;font-weight:bold;">${businessName}</td>
                  <td align="right">
                    <span style="background-color:#00B33F;color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:1px;padding:6px 10px;border-radius:6px;">PAYMENT REMINDER</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px 8px 36px;color:#1E293B;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 14px 0;">${greeting}</p>
              <p style="margin:0 0 14px 0;">I hope you are well. ${intro}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 36px 4px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
                <tr>
                  <td style="padding:14px 18px;color:#64748B;font-size:13px;">Invoice Number</td>
                  <td align="right" style="padding:14px 18px;color:#0F172A;font-size:14px;font-weight:bold;">${invoiceNo}</td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;color:#64748B;font-size:13px;border-top:1px solid #E2E8F0;">Amount Due</td>
                  <td align="right" style="padding:14px 18px;color:#0F172A;font-size:16px;font-weight:bold;border-top:1px solid #E2E8F0;">₹${amountStr}</td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;color:#64748B;font-size:13px;border-top:1px solid #E2E8F0;">Due Date</td>
                  <td align="right" style="padding:14px 18px;color:#0F172A;font-size:14px;font-weight:bold;border-top:1px solid #E2E8F0;">${longDate(dueDate)}</td>
                </tr>
              </table>
            </td>
          </tr>
          ${payBlock}
          <tr>
            <td style="padding:18px 36px 6px 36px;color:#475569;font-size:13.5px;line-height:1.6;">
              <p style="margin:0 0 12px 0;">
                If the payment has already been made, please disregard this email.
                For any queries regarding this invoice, feel free to contact us at ${merchantPhone}.
              </p>
              <p style="margin:0;">
                Warm regards,<br />
                <strong style="color:#0F172A;">Accounts Team, ${businessName}</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 24px 36px;">
              <div style="border-top:1px solid #E2E8F0;padding-top:14px;text-align:center;color:#94A3B8;font-size:11px;">
                This is an automated payment reminder sent via Ugaahi on behalf of ${businessName}.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html }
}
