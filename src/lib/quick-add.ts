/**
 * Quick Add parser — chhote dukaandaar ke liye ek-line entry.
 * Jaise WhatsApp pe likhte hain: "Ramesh 5000" ya "Ramesh ko 10000 udhaar 9876543210"
 *
 * Format samajhta hai:
 *   - "Ramesh 5000"                    → naam=Ramesh, amount=5000
 *   - "Ramesh 5000 9876543210"         → + phone
 *   - "Ramesh ko 10000 udhaar diya"    → natural Hindi
 *   - "Suresh 5,000"                   → comma wala amount
 */

export interface QuickAddParsed {
  name: string
  amount: number
  phone?: string
}

export function parseQuickAdd(input: string): QuickAddParsed | { error: string } {
  const text = input.trim()
  if (!text) return { error: 'Kuch likho — jaise "Ramesh 5000"' }

  // Phone nikalo (10 digit, 6-9 se shuru)
  let phone: string | undefined
  const phoneMatch = text.match(/(?:\+91[\s-]?)?([6-9]\d{9})/)
  let remaining = text
  if (phoneMatch) {
    phone = phoneMatch[1]
    remaining = text.replace(phoneMatch[0], ' ').trim()
  }

  // Amount nikalo (sabse bada number — amount hi hoga)
  // Comma wale amounts: 5,000 → 5000
  const cleanForNum = remaining.replace(/,/g, '')
  const numMatches = cleanForNum.match(/\d+(\.\d+)?/g)
  if (!numMatches || numMatches.length === 0) {
    return { error: 'Amount nahi mila — jaise "Ramesh 5000" likho' }
  }
  // Sabse bada number = amount (chhote numbers date ho sakte hain)
  const amount = Math.max(...numMatches.map(n => parseFloat(n)))
  if (amount <= 0) return { error: 'Amount 0 se zyada hona chahiye' }

  // Naam nikalo — amount hata ke jo bache
  let name = remaining
  // Amount ko hatao (pehle comma wale, phir saaf)
  name = remaining.replace(/,/g, '').replace(String(amount), ' ')
  // Agar amount decimal tha to bhi handle
  numMatches.forEach(n => { name = name.replace(n, ' ') })
  // Filler shabd hatao
  name = name
    .replace(/\b(ko|ka|ki|ke|ne|diya|diye|udhaar|udhar|dena|liya|bill|payment|rs|₹|rupees?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!name || name.length < 2) {
    return { error: 'Naam nahi mila — jaise "Ramesh 5000" likho' }
  }

  return { name, amount, phone }
}
