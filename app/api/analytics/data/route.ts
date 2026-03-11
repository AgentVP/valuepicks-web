import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import type { RawShotBet } from '@/lib/analyticsAggregate'
import { aggregateShotBetsByModelAndBetType } from '@/lib/analyticsAggregate'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export type Model = 'L10' | 'HA'
export type BetType = 'over' | 'under'

export interface BucketRow {
  label: string
  bets: number
  wins: number
  losses: number
  winPct: number
  confidence95: number
}

export interface AnalyticsTable {
  model: Model
  betType: BetType
  title: string
  rows: BucketRow[]
}

function isValidShotBet(r: unknown): r is RawShotBet {
  if (typeof r !== 'object' || r === null) return false
  const o = r as Record<string, unknown>
  return (
    typeof o.shot_line === 'number' &&
    typeof o.l10_delta === 'number' &&
    typeof o.ha_delta === 'number' &&
    typeof o.l10_bucket === 'number' &&
    typeof o.ha_bucket === 'number' &&
    (o.bet_type === 'over' || o.bet_type === 'under') &&
    (o.result === 'win' || o.result === 'loss')
  )
}

const GOAL_TRACKING_SHEET = 'Goal Tracking'

async function loadRawBets(): Promise<RawShotBet[]> {
  const supabase = getSupabase()
  if (supabase) {
    const { data: row, error } = await supabase
      .from('analytics_sheet_uploads')
      .select('data')
      .eq('sheet_name', GOAL_TRACKING_SHEET)
      .maybeSingle()
    if (!error && row?.data && Array.isArray(row.data)) {
      const filtered = (row.data as unknown[]).filter(isValidShotBet)
      if (filtered.length > 0) return filtered
    }
  }
  const path = join(process.cwd(), 'data', 'shot-bet-analytics.json')
  try {
    const text = await readFile(path, 'utf-8')
    const data = JSON.parse(text) as unknown
    if (!Array.isArray(data)) return []
    return data.filter(isValidShotBet)
  } catch {
    return []
  }
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

export async function GET(request: Request) {
  const ok = await requireAuth(request)
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const raw = await loadRawBets()
    const tables: AnalyticsTable[] = [
      {
        model: 'L10',
        betType: 'under',
        title: 'Unders L10',
        rows: aggregateShotBetsByModelAndBetType(raw, 'L10', 'under'),
      },
      {
        model: 'HA',
        betType: 'under',
        title: 'Unders H/A',
        rows: aggregateShotBetsByModelAndBetType(raw, 'HA', 'under'),
      },
      {
        model: 'L10',
        betType: 'over',
        title: 'Overs L10',
        rows: aggregateShotBetsByModelAndBetType(raw, 'L10', 'over'),
      },
      {
        model: 'HA',
        betType: 'over',
        title: 'Overs H/A',
        rows: aggregateShotBetsByModelAndBetType(raw, 'HA', 'over'),
      },
    ]
    return NextResponse.json({ tables })
  } catch (e) {
    console.error('Analytics data error:', e)
    return NextResponse.json(
      { error: 'Failed to load analytics data' },
      { status: 500 }
    )
  }
}
