import { NextResponse } from 'next/server'
import { getUserEmail } from '@/lib/requireUser'

/**
 * GET /api/analytics — data for the owner's Analytics page.
 * Reads ONLY the NHL Shot Model Supabase project (read-only key, server-side). Never touches the pick'em database.
 * Access: signed-in users listed in ANALYTICS_OWNER_EMAILS (comma-separated). If that variable is unset, any signed-in member.
 */
export const dynamic = 'force-dynamic'

const HISTORY_COLS = 'season,source,game_date,game_key,team,opponent,home_away,shot_line,l10_delta,ha_delta,actual_shots,actual_goals,actual_saves,x_saves,x_goals,ml_odds,ml_ev,ml_won,x_game_total_goals,ou_goals_line,ou_goals_odds,logged_pick_side,logged_pick_result'
const LIVE_COLS = 'game_date,game_id,team,team_name,home_away,shots_line,shots_over_odds,shots_under_odds,shots_delta_l10,shots_delta_ha,actual_shots,ml_odds,ml_ev_l10,ml_ev_ha,won,game_total,game_total_over_odds,game_total_under_odds,x_game_total_l10,x_game_total_ha,actual_game_goals,saves_line,saves_over_odds,saves_under_odds,x_saves_l10,x_saves_ha,actual_saves'

async function fetchAll(path: string): Promise<Record<string, unknown>[]> {
  const url = process.env.HOCKEY_SUPABASE_URL, key = process.env.HOCKEY_SUPABASE_KEY
  if (!url || !key) throw new Error('not_configured')
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` }, cache: 'no-store',
    })
    if (!res.ok && res.status !== 206) throw new Error(`hockey_db_${res.status}`)
    const page = await res.json()
    out.push(...page)
    if (page.length < 1000) return out
  }
}

export async function GET(request: Request) {
  const email = await getUserEmail(request)
  if (email === null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const owners = (process.env.ANALYTICS_OWNER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (owners.length && !owners.includes(email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const [history, live] = await Promise.all([
      fetchAll(`team_games?select=${HISTORY_COLS}&order=game_date`),
      fetchAll(`model_vs_lines?select=${LIVE_COLS}&actual_shots=not.is.null&order=game_date`),
    ])
    return NextResponse.json({ history, live, loadedAt: new Date().toISOString() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return NextResponse.json({ error: msg === 'not_configured' ? 'Analytics data source is not configured.' : 'Could not reach the model database.' },
      { status: msg === 'not_configured' ? 503 : 502 })
  }
}
