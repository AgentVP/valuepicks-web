import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GOAL_TRACKING_SHEET_NAME, MONEYLINE_SHEET_NAME } from '@/lib/analyticsConfig'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function requireAuth(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return false
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: key,
    },
  })
  return res.ok
}

const ALLOWED_SHEETS = [GOAL_TRACKING_SHEET_NAME, MONEYLINE_SHEET_NAME] as const

/**
 * GET /api/analytics/data
 * Returns sheet data from Supabase. Default: Goal Tracking.
 * Query: ?sheet=Moneyline for moneyline data.
 */
export async function GET(request: Request) {
  const ok = await requireAuth(request)
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const supabase = getSupabase()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Analytics data not configured (Supabase)' },
        { status: 503 }
      )
    }
    const { searchParams } = new URL(request.url)
    const sheetParam = searchParams.get('sheet')?.trim() || GOAL_TRACKING_SHEET_NAME
    const sheetName = ALLOWED_SHEETS.includes(sheetParam as (typeof ALLOWED_SHEETS)[number])
      ? sheetParam
      : GOAL_TRACKING_SHEET_NAME

    const { data: row, error } = await supabase
      .from('analytics_sheet_uploads')
      .select('data, updated_at')
      .eq('sheet_name', sheetName)
      .maybeSingle()

    if (error) {
      console.error('Analytics data fetch:', error)
      return NextResponse.json({ error: 'Failed to load analytics data' }, { status: 500 })
    }

    const data = row?.data && Array.isArray(row.data) ? row.data : []
    return NextResponse.json({
      data,
      sheet: sheetName,
      updated_at: row?.updated_at ?? null,
    })
  } catch (e) {
    console.error('Analytics data error:', e)
    return NextResponse.json({ error: 'Failed to load analytics data' }, { status: 500 })
  }
}
