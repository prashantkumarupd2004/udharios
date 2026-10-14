import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    sarvam_key_present: !!process.env.SARVAM_API_KEY,
    sarvam_key_length: process.env.SARVAM_API_KEY?.length ?? 0,
    supabase_url_present: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    service_key_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
}
