/**
 * GET /api/integrations/tally/template — Download CSV template for bill upload
 */

import { NextResponse } from 'next/server'
import { CSV_TEMPLATE } from '@/lib/tally-parse'

export async function GET() {
  return new NextResponse(CSV_TEMPLATE, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="tally-bills-template.csv"',
    },
  })
}
