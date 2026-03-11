import { createClient } from '@supabase/supabase-js'
import { teamToCanonicalAbbrev } from '@/lib/nhlTeamNames'
import { getLocalDateString } from '@/lib/dateUtils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Game = {
  id: number
  away_team: string
  home_team: string
  start_time: string
  away_score: number | null
  home_score: number | null
  winner_team: string | null
}

type Pick = {
  game_id: number
  picked_team: string
  decimal_odds: number | null
  games: Array<{ winner_team: string | null }>
}

type Entry = {
  entrant_name: string
  picks: Pick[]
}

function parlayMultiplier(picks: Pick[]): number | null {
  const withOdds = picks.filter((p) => p.decimal_odds != null && p.decimal_odds > 0)
  if (withOdds.length === 0) return null
  const product = withOdds.reduce((acc, p) => acc * (p.decimal_odds ?? 1), 1)
  return Math.round(product * 100) / 100
}

function pickResult(p: Pick): boolean | null {
  const winner = p.games?.[0]?.winner_team
  if (!winner) return null
  return teamToCanonicalAbbrev(p.picked_team) === teamToCanonicalAbbrev(winner)
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const date = url.searchParams.get('date')?.trim() || getLocalDateString()

    const { data: slate, error: slateError } = await supabase
      .from('slates')
      .select('id')
      .eq('slate_date', date)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (slateError || !slate) {
      return Response.json({ games: [], entries: [], potInfo: null })
    }

    const { data: gameRows, error: gamesError } = await supabase
      .from('games')
      .select('id, away_team, home_team, start_time, away_score, home_score, winner_team')
      .eq('slate_id', slate.id)
      .order('start_time', { ascending: true })

    if (gamesError) {
      return Response.json({ games: [], entries: [], potInfo: null }, { status: 500 })
    }

    const games: Game[] = (gameRows as Game[]) || []

    const { data: entryRows, error: entriesError } = await supabase
      .from('entries')
      .select(
        `
        entrant_name,
        picks (
          game_id,
          picked_team,
          decimal_odds,
          games ( winner_team )
        )
      `
      )
      .eq('slate_id', slate.id)

    if (entriesError) {
      return Response.json({ games, entries: [], potInfo: null }, { status: 500 })
    }

    const entries: Entry[] = (entryRows as Entry[]) || []

    const wins = (picks: Pick[]) => picks.filter((p) => pickResult(p) === true).length
    const losses = (picks: Pick[]) => picks.filter((p) => pickResult(p) === false).length
    const parlay = (e: Entry) => parlayMultiplier(e.picks) ?? 0

    entries.sort((a, b) => {
      const wa = wins(a.picks)
      const wb = wins(b.picks)
      if (wb !== wa) return wb - wa
      return parlay(b) - parlay(a)
    })

    const ENTRY_FEE = 5
    const entryCount = entries.length
    let potInfo: { entryCount: number; pot: number; perWinner: number } | null = null
    if (entryCount > 0) {
      const maxWins = Math.max(...entries.map((e) => wins(e.picks)))
      const top = entries.filter((e) => wins(e.picks) === maxWins)
      const maxParlay = Math.max(...top.map((e) => parlayMultiplier(e.picks) ?? 0))
      const winners = entries.filter(
        (e) => wins(e.picks) === maxWins && (parlayMultiplier(e.picks) ?? 0) === maxParlay,
      )
      const pot = entryCount * ENTRY_FEE
      const perWinner = winners.length > 0 ? pot / winners.length : 0
      potInfo = { entryCount, pot, perWinner }
    }

    return Response.json({
      games,
      entries: entries.map((e) => ({
        ...e,
        computed: { wins: wins(e.picks), losses: losses(e.picks), parlay: parlayMultiplier(e.picks) },
      })),
      potInfo,
    })
  } catch (e) {
    console.error(e)
    return Response.json({ games: [], entries: [], potInfo: null }, { status: 500 })
  }
}

