import { NextResponse } from 'next/server'
import { getUserEmail } from '@/lib/requireUser'

/**
 * /api/bets — the signed-in member's own logged bets (stored in the NHL Shot Model project, never the pick'em database).
 * GET: all of my bets, graded (my_bets_graded).  POST: log a bet.  DELETE ?id=: remove one of my bets.
 */
export const dynamic = 'force-dynamic'

const MARKETS = ['shots', 'moneyline', 'puck_line', 'team_goals', 'game_total', 'saves'] as const
const SIDES = ['over', 'under', 'team'] as const
const BASES = ['ha', 'l10', 'both', 'best', 'manual'] as const

function db(path: string, init: RequestInit = {}) {
  const url = process.env.HOCKEY_SUPABASE_URL, key = process.env.HOCKEY_SUPABASE_KEY
  if (!url || !key) throw new Error('not_configured')
  return fetch(`${url}/rest/v1/${path}`, {
    ...init, cache: 'no-store',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
}
const fail = (e: unknown) => NextResponse.json(
  { error: e instanceof Error && e.message === 'not_configured' ? 'Bet tracking is not configured.' : 'Could not reach the bets database.' },
  { status: e instanceof Error && e.message === 'not_configured' ? 503 : 502 })

export async function GET(request: Request) {
  const email = await getUserEmail(request)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const res = await db(`my_bets_graded?user_email=eq.${encodeURIComponent(email)}&order=game_date.desc,created_at.desc&limit=2000`)
    if (!res.ok) throw new Error('db')
    return NextResponse.json({ bets: await res.json() })
  } catch (e) { return fail(e) }
}

export async function POST(request: Request) {
  const email = await getUserEmail(request)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await request.json().catch(() => null)
  const num = (v: unknown) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))
  const odds = num(b?.odds), stake = num(b?.stake) ?? 1, line = num(b?.line)
  if (!b || !MARKETS.includes(b.market) || !SIDES.includes(b.side) || !b.team || !num(b.game_id) || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.game_date)))
    return NextResponse.json({ error: 'Missing bet details.' }, { status: 400 })
  if (odds === null || (odds > -100 && odds < 100)) return NextResponse.json({ error: 'Enter American odds, like -110 or +125.' }, { status: 400 })
  if (b.market !== 'moneyline' && line === null) return NextResponse.json({ error: 'Enter the line for this bet.' }, { status: 400 })
  if (stake <= 0 || stake > 1000) return NextResponse.json({ error: 'Stake must be between 0 and 1000 units.' }, { status: 400 })
  const row = {
    user_email: email, game_id: num(b.game_id), game_date: b.game_date, team: String(b.team).slice(0, 8), opponent: b.opponent ? String(b.opponent).slice(0, 8) : null,
    market: b.market, side: b.side, line: b.market === 'moneyline' ? null : line, odds: Math.round(odds), stake,
    model_basis: BASES.includes(b.model_basis) ? b.model_basis : 'manual',
    snapshot: b.snapshot && typeof b.snapshot === 'object' ? b.snapshot : null, notes: b.notes ? String(b.notes).slice(0, 300) : null,
  }
  try {
    const res = await db('my_bets', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) })
    if (!res.ok) throw new Error('db')
    return NextResponse.json({ bet: (await res.json())[0] })
  } catch (e) { return fail(e) }
}

export async function DELETE(request: Request) {
  const email = await getUserEmail(request)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Bad id' }, { status: 400 })
  try {
    const res = await db(`my_bets?id=eq.${id}&user_email=eq.${encodeURIComponent(email)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
    if (!res.ok) throw new Error('db')
    const gone = await res.json()
    return gone.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Bet not found' }, { status: 404 })
  } catch (e) { return fail(e) }
}
