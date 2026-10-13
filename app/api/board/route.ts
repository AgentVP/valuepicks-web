import { NextResponse } from 'next/server'
import { getUserEmail } from '@/lib/requireUser'
import { bandOf, type BucketStats } from '@/lib/shotBuckets'

/**
 * GET /api/board?date=YYYY-MM-DD
 * Puck Line Board data for any signed-in member. Reads ONLY from the separate NHL Shot Model
 * Supabase project (HOCKEY_SUPABASE_URL / HOCKEY_SUPABASE_KEY, server-side only, read-only access).
 * Never touches the pick'em database.
 */
export const dynamic = 'force-dynamic'

const SLATE_COLS = [
  'game_date', 'game_id', 'team', 'team_name', 'opponent', 'home_away', 'b2b', 'opp_b2b',
  'shots_line', 'shots_over_odds', 'shots_under_odds', 'x_shots_ha', 'x_shots_l10', 'shots_delta_ha', 'shots_delta_l10', 'shots_delta_ha_excel', 'shots_delta_l10_excel',
  'team_goals_line', 'team_goals_over_odds', 'team_goals_under_odds', 'x_goals_ha', 'x_goals_l10',
  'game_total', 'game_total_over_odds', 'game_total_under_odds', 'x_game_total_ha', 'x_game_total_l10',
  'ml_odds', 'ml_implied_ha', 'ml_implied_l10', 'ml_ev_ha', 'ml_ev_l10',
  'actual_shots', 'actual_goals', 'actual_game_goals', 'won',
].join(',')
const MOVE_COLS = 'game_id,team,shots_first,shots_move,ml_open,ml_prob_move,total_open,total_move,last_snapshot'
const HIST_COLS = [
  'game_date', 'game_id', 'team', 'shots_line', 'shots_over_odds', 'shots_under_odds', 'shots_delta_ha', 'shots_delta_l10', 'shots_delta_ha_excel', 'shots_delta_l10_excel', 'actual_shots',
  'team_goals_line', 'team_goals_over_odds', 'team_goals_under_odds', 'x_goals_ha', 'x_goals_l10', 'actual_goals',
  'game_total', 'game_total_over_odds', 'game_total_under_odds', 'x_game_total_ha', 'x_game_total_l10', 'actual_game_goals',
  'ml_odds', 'ml_ev_ha', 'ml_ev_l10', 'won',
].join(',')

async function hockey(path: string) {
  const url = process.env.HOCKEY_SUPABASE_URL
  const key = process.env.HOCKEY_SUPABASE_KEY
  if (!url || !key) throw new Error('not_configured')
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' })
  if (!res.ok) throw new Error(`hockey_db_${res.status}`)
  return res.json()
}

async function hockeyAll(path: string): Promise<Record<string, unknown>[]> {
  const url = process.env.HOCKEY_SUPABASE_URL, key = process.env.HOCKEY_SUPABASE_KEY
  if (!url || !key) throw new Error('not_configured')
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` }, cache: 'no-store' })
    if (!res.ok && res.status !== 206) throw new Error(`hockey_db_${res.status}`)
    const page = await res.json(); out.push(...page)
    if (page.length < 1000) return out
  }
}

/** Shot-bucket history: for each model and side, wins/losses per half-shot band of |delta| (band 12 = 6+). */
function bucketStats(rows: { l10: number | null; ha: number | null; line: number | null; actual: number | null }[]): BucketStats {
  const out: BucketStats = {}
  for (const r of rows) {
    if (r.line === null || r.actual === null || r.actual === r.line) continue
    for (const model of ['l10', 'ha'] as const) {
      const d = r[model]
      if (d === null || d === 0) continue
      const side = d < 0 ? 'under' : 'over'
      const win = side === 'under' ? r.actual < r.line : r.actual > r.line
      const k = `${model}|${side}|${bandOf(d)}`
      const b = out[k] || (out[k] = { w: 0, l: 0 })
      if (win) b.w++; else b.l++
    }
  }
  return out
}
const toNum = (v: unknown) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))

export async function GET(request: Request) {
  const email = await getUserEmail(request)
  if (email === null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = new URL(request.url).searchParams.get('date') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 })

  try {
    const [slate, starts, moves, history, past] = await Promise.all([
      hockey(`model_vs_lines?select=${SLATE_COLS}&game_date=eq.${date}`),
      hockey(`daily_projections?select=game_id,team,start_time_utc&game_date=eq.${date}`),
      hockey(`line_movement?select=${MOVE_COLS}&game_date=eq.${date}`),
      hockey(`model_vs_lines?select=${HIST_COLS}&actual_shots=not.is.null&order=game_date`),
      hockeyAll('team_games?select=l10_delta,ha_delta,shot_line,actual_shots&actual_shots=not.is.null&shot_line=not.is.null'),
    ])
    // Bucket win rates: every graded game before this date. History was graded on the workbook's original shot formula,
    // so live games are bucketed on the same original-formula deltas (*_excel) to compare like with like.
    const buckets = bucketStats([
      ...past.map((r) => ({ l10: toNum(r.l10_delta), ha: toNum(r.ha_delta), line: toNum(r.shot_line), actual: toNum(r.actual_shots) })),
      ...(history as Record<string, unknown>[]).filter((r) => String(r.game_date) < date)
        .map((r) => ({ l10: toNum(r.shots_delta_l10_excel), ha: toNum(r.shots_delta_ha_excel), line: toNum(r.shots_line), actual: toNum(r.actual_shots) })),
    ])
    const key = (r: { game_id: number; team: string }) => `${r.game_id}|${r.team}`
    const startMap = new Map(starts.map((r: { game_id: number; team: string; start_time_utc: string }) => [key(r), r.start_time_utc]))
    const moveMap = new Map(moves.map((r: { game_id: number; team: string }) => [key(r), r]))
    const rows = slate
      .map((r: { game_id: number; team: string }) => ({ ...r, ...(moveMap.get(key(r)) || {}), start_time_utc: startMap.get(key(r)) || null }))
      .sort((a: { start_time_utc: string | null; game_id: number; home_away: string }, b: { start_time_utc: string | null; game_id: number; home_away: string }) =>
        String(a.start_time_utc).localeCompare(String(b.start_time_utc)) || a.game_id - b.game_id || (a.home_away === 'away' ? -1 : 1))
    return NextResponse.json({ rows, history, buckets, loadedAt: new Date().toISOString() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    const status = msg === 'not_configured' ? 503 : 502
    return NextResponse.json({ error: msg === 'not_configured' ? 'Board data source is not configured yet.' : 'Could not reach the model database.' }, { status })
  }
}
