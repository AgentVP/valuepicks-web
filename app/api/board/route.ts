import { NextResponse } from 'next/server'
import { getUserEmail } from '@/lib/requireUser'

/**
 * GET /api/board?date=YYYY-MM-DD
 * Puck Line Board data for any signed-in member. Reads ONLY from the separate NHL Shot Model
 * Supabase project (HOCKEY_SUPABASE_URL / HOCKEY_SUPABASE_KEY, server-side only, read-only access).
 * Never touches the pick'em database.
 */
export const dynamic = 'force-dynamic'

const SLATE_COLS = [
  'game_date', 'game_id', 'team', 'team_name', 'opponent', 'home_away', 'b2b', 'opp_b2b',
  'shots_line', 'shots_over_odds', 'shots_under_odds', 'x_shots_ha', 'x_shots_l10', 'shots_delta_ha', 'shots_delta_l10',
  'team_goals_line', 'team_goals_over_odds', 'team_goals_under_odds', 'x_goals_ha', 'x_goals_l10',
  'game_total', 'game_total_over_odds', 'game_total_under_odds', 'x_game_total_ha', 'x_game_total_l10',
  'ml_odds', 'ml_implied_ha', 'ml_implied_l10', 'ml_ev_ha', 'ml_ev_l10',
  'actual_shots', 'actual_goals', 'actual_game_goals', 'won',
].join(',')
const MOVE_COLS = 'game_id,team,shots_first,shots_move,ml_open,ml_prob_move,total_open,total_move,last_snapshot'
const HIST_COLS = [
  'game_date', 'game_id', 'team', 'shots_line', 'shots_over_odds', 'shots_under_odds', 'shots_delta_ha', 'shots_delta_l10', 'actual_shots',
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

export async function GET(request: Request) {
  const email = await getUserEmail(request)
  if (email === null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = new URL(request.url).searchParams.get('date') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 })

  try {
    const [slate, starts, moves, history] = await Promise.all([
      hockey(`model_vs_lines?select=${SLATE_COLS}&game_date=eq.${date}`),
      hockey(`daily_projections?select=game_id,team,start_time_utc&game_date=eq.${date}`),
      hockey(`line_movement?select=${MOVE_COLS}&game_date=eq.${date}`),
      hockey(`model_vs_lines?select=${HIST_COLS}&actual_shots=not.is.null&order=game_date`),
    ])
    const key = (r: { game_id: number; team: string }) => `${r.game_id}|${r.team}`
    const startMap = new Map(starts.map((r: { game_id: number; team: string; start_time_utc: string }) => [key(r), r.start_time_utc]))
    const moveMap = new Map(moves.map((r: { game_id: number; team: string }) => [key(r), r]))
    const rows = slate
      .map((r: { game_id: number; team: string }) => ({ ...r, ...(moveMap.get(key(r)) || {}), start_time_utc: startMap.get(key(r)) || null }))
      .sort((a: { start_time_utc: string | null; game_id: number; home_away: string }, b: { start_time_utc: string | null; game_id: number; home_away: string }) =>
        String(a.start_time_utc).localeCompare(String(b.start_time_utc)) || a.game_id - b.game_id || (a.home_away === 'away' ? -1 : 1))
    return NextResponse.json({ rows, history, loadedAt: new Date().toISOString() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    const status = msg === 'not_configured' ? 503 : 502
    return NextResponse.json({ error: msg === 'not_configured' ? 'Board data source is not configured yet.' : 'Could not reach the model database.' }, { status })
  }
}
