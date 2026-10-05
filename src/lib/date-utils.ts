/**
 * Date utilities for Udhari OS
 * All times are computed in IST (Asia/Kolkata, UTC+5:30)
 * Using date-fns with explicit timezone handling
 */

import { format, parseISO, differenceInDays, addDays, isBefore, isAfter, startOfDay } from 'date-fns'

export const IST_OFFSET_MINUTES = 330 // UTC+5:30

/**
 * Get current IST time as a Date object
 */
export function nowIST(): Date {
  const now = new Date()
  return now
}

/**
 * Format a date in IST for display
 */
export function formatIST(date: Date | string, fmt = 'dd MMM yyyy, hh:mm a'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  // Format in IST by converting offset
  const istDate = new Date(d.getTime() + IST_OFFSET_MINUTES * 60 * 1000)
  return format(istDate, fmt)
}

/**
 * Format a date as Indian short date
 */
export function formatIndianDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatIST(d, 'dd MMM yyyy')
}

/**
 * Get today's date in IST as a plain YYYY-MM-DD string
 */
export function todayIST(): string {
  const now = nowIST()
  const istDate = new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000)
  return format(istDate, 'yyyy-MM-dd')
}

/**
 * Get the current hour in IST (0-23)
 */
export function currentHourIST(): number {
  const now = nowIST()
  const istDate = new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000)
  return istDate.getUTCHours()
}

/**
 * Check if current IST time is within the allowed sending window
 * quietStart and quietEnd are "HH:MM" strings (e.g. "21:00", "09:00")
 */
export function isWithinSendingWindow(quietStart: string, quietEnd: string): boolean {
  const [qStartH, qStartM] = quietStart.split(':').map(Number)
  const [qEndH, qEndM] = quietEnd.split(':').map(Number)

  const now = nowIST()
  const istDate = new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000)
  const currentMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes()

  const startMinutes = qStartH * 60 + qStartM // quiet period starts (e.g. 21:00 = 1260)
  const endMinutes = qEndH * 60 + qEndM       // quiet period ends   (e.g. 09:00 = 540)

  // Quiet period crosses midnight (e.g. 21:00 to 09:00)
  if (startMinutes > endMinutes) {
    // Current time is in quiet period if >= start OR < end
    const inQuiet = currentMinutes >= startMinutes || currentMinutes < endMinutes
    return !inQuiet
  } else {
    // Quiet period within same day
    const inQuiet = currentMinutes >= startMinutes && currentMinutes < endMinutes
    return !inQuiet
  }
}

/**
 * Calculate overdue days (how many days past due date)
 */
export function overdueDays(dueDate: Date | string): number {
  const due = typeof dueDate === 'string' ? parseISO(dueDate) : dueDate
  const today = startOfDay(nowIST())
  const days = differenceInDays(today, startOfDay(due))
  return Math.max(0, days)
}

/**
 * Parse natural-language Hindi date expressions to a Date object
 * Examples: "kal", "shukravaar", "5 tarikh", "agli somvaar"
 */
export function parseHindiDateExpression(expr: string, referenceDate?: Date): Date | null {
  const ref = referenceDate ?? nowIST()
  const normalized = expr.trim().toLowerCase()

  // "kal" = tomorrow
  if (normalized === 'kal' || normalized === 'tomorrow') {
    return addDays(ref, 1)
  }

  // "parso" = day after tomorrow
  if (normalized === 'parso') {
    return addDays(ref, 2)
  }

  // Day of week mapping (Hindi)
  const dayMap: Record<string, number> = {
    somvaar: 1, monday: 1,
    mangalvaar: 2, tuesday: 2,
    budhvaar: 3, wednesday: 3,
    guruvaar: 4, thursday: 4, brihaspativaar: 4,
    shukravaar: 5, friday: 5,
    shanivaar: 6, saturday: 6,
    ravivaar: 0, sunday: 0, itvaar: 0,
  }

  for (const [dayName, dayOfWeek] of Object.entries(dayMap)) {
    if (normalized.includes(dayName)) {
      const today = ref.getDay()
      let daysUntil = dayOfWeek - today
      if (daysUntil <= 0) daysUntil += 7
      return addDays(ref, daysUntil)
    }
  }

  // "5 tarikh" or "5th" — day of current/next month
  const tarikhMatch = normalized.match(/(\d{1,2})\s*(tarikh|taarikh|th|st|nd|rd)?/)
  if (tarikhMatch) {
    const day = parseInt(tarikhMatch[1])
    if (day >= 1 && day <= 31) {
      const candidate = new Date(ref.getFullYear(), ref.getMonth(), day)
      if (isBefore(candidate, ref)) {
        // Try next month
        return new Date(ref.getFullYear(), ref.getMonth() + 1, day)
      }
      return candidate
    }
  }

  return null
}

/**
 * Get the start of the current week (Monday) in IST
 */
export function startOfWeekIST(): Date {
  const now = nowIST()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  return startOfDay(new Date(now.setDate(diff)))
}

/**
 * Format currency in Indian format (₹1,23,456.78)
 */
export function formatINR(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num)
}

export { addDays, isBefore, isAfter, differenceInDays, format, parseISO, startOfDay }
