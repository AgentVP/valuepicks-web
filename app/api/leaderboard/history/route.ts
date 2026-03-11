import { createClient } from '@supabase/supabase-js'
import { teamToCanonicalAbbrev } from '@/lib/nhlTeamNames'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ENTRY_FEE = 5

type GameRow = { id: number; nhl_game_id: number | null; away_team: string; home_team: string }
type PickRow = { game_id: number; picked_team: string; decimal_odds: number | null }
type EntryRow = { entrant_name: string; picks: PickRow[] }

export type Agg = {
  entrant_name: string
  contestsEntered: number
  wins: number
  losses: number
  winPct: number
  earnings: number
}

function parlayMultiplier(picks: PickRow[]): number | null {
  const withOdds = picks.filter((p) => p.decimal_odds != null && p.decimal_odds > 0)
  if (withOdds.length === 0) return null
  const product = withOdds.reduce((acc, p) => acc * (p.decimal_odds ?? 1), 1)
  return Math.round(product * 100) / 100
}

/** All-time leaderboard: compute wins/earnings from NHL results (same logic as daily leaderboard). */
export async function GET() {
  try {
    const { data: slates, error: slatesError } = await supabase
      .from('slates')
      .select('id, slate_date')
      .order('slate_date', { ascending: false })

    if (slatesError || !slates?.length) {
      return Response.json({ aggs: [] })
    }

    const byName = new Map<string, { contests: Set<number>; wins: number; losses: number; earnings: number }>()

    for (const slate of slates) {
      const date = slate.slate_date as string

      const { data: gameRows } = await supabase
        .from('games')
        .select('id, nhl_game_id, away_team, home_team')
        .eq('slate_id', slate.id)
      const games: GameRow[] = gameRows || []

      let nhlGames: Array<{ id: number; awayTeam: { abbrev: string; score?: number }; homeTeam: { abbrev: string; score?: number }; gameState: string }> = []
      try {
        const nhlRes = await fetch(`https://api-web.nhle.com/v1/schedule/${date}`, { cache: 'no-store' })
        if (nhlRes.ok) {
          const nhlJson = await nhlRes.json()
          nhlGames =
            nhlJson.gameWeek
              ?.filter((d: { date: string }) => d.date === date)
              ?.flatMap((d: { games?: typeof nhlGames }) => d.games || []) || []
        }
      } catch (_) {}
      const nhlById = new Map(nhlGames.map((g) => [g.id, g]))
      const nhlByMatchup = new Map(nhlGames.map((g) => [`${g.awayTeam?.abbrev}_${g.homeTeam?.abbrev}`, g] as const))

      const winnerByGameId = new Map<number, string | null>()
      for (const g of games) {
        const nhl =
          (g.nhl_game_id != null ? nhlById.get(g.nhl_game_id) : null) ??
          nhlByMatchup.get(`${teamToCanonicalAbbrev(g.away_team)}_${teamToCanonicalAbbrev(g.home_team)}`)
        if (!nhl) {
          winnerByGameId.set(g.id, null)
          continue
        }
        const isFinal = nhl.gameState === 'FINAL' || nhl.gameState === 'OFF'
        const awayScore = nhl.awayTeam?.score ?? null
        const homeScore = nhl.homeTeam?.score ?? null
        if (!isFinal || awayScore == null || homeScore == null) {
          winnerByGameId.set(g.id, null)
          continue
        }
        if (awayScore > homeScore) winnerByGameId.set(g.id, nhl.awayTeam.abbrev)
        else if (homeScore > awayScore) winnerByGameId.set(g.id, nhl.homeTeam.abbrev)
        else winnerByGameId.set(g.id, null)
      }

      const { data: entryRows, error: entriesError } = await supabase
        .from('entries')
        .select('entrant_name, picks(game_id, picked_team, decimal_odds)')
        .eq('slate_id', slate.id)
      if (entriesError || !entryRows?.length) continue

      const entries: EntryRow[] = entryRows as EntryRow[]
      const wins = (p: PickRow[]) => p.filter((pick) => {
        const winner = winnerByGameId.get(pick.game_id) ?? null
        return winner ? teamToCanonicalAbbrev(pick.picked_team) === teamToCanonicalAbbrev(winner) : false
      }).length
      const losses = (p: PickRow[]) => p.filter((pick) => {
        const winner = winnerByGameId.get(pick.game_id) ?? null
        return winner ? teamToCanonicalAbbrev(pick.picked_team) !== teamToCanonicalAbbrev(winner) : false
      }).length
      const parlay = (e: EntryRow) => parlayMultiplier(e.picks) ?? 0

      let maxWins = 0
      for (const r of entries) {
        const w = wins(r.picks)
        if (w > maxWins) maxWins = w
      }
      const topByWins = entries.filter((r) => wins(r.picks) === maxWins)
      let maxParlay = 0
      for (const r of topByWins) {
        const pm = parlay(r)
        if (pm > maxParlay) maxParlay = pm
      }
      const contestWinners = topByWins.filter((r) => parlay(r) === maxParlay)
      const pot = entries.length * ENTRY_FEE
      const perWinner = contestWinners.length > 0 ? pot / contestWinners.length : 0

      for (const row of entries) {
        let agg = byName.get(row.entrant_name)
        if (!agg) {
          agg = { contests: new Set(), wins: 0, losses: 0, earnings: 0 }
          byName.set(row.entrant_name, agg)
        }
        agg.contests.add(slate.id)
        agg.wins += wins(row.picks)
        agg.losses += losses(row.picks)
        if (contestWinners.some((w) => w.entrant_name === row.entrant_name)) {
          agg.earnings += perWinner
        }
      }
    }

    const aggs: Agg[] = Array.from(byName.entries()).map(([entrant_name, a]) => {
      const total = a.wins + a.losses
      const winPct = total > 0 ? Math.round((a.wins / total) * 1000) / 10 : 0
      return {
        entrant_name,
        contestsEntered: a.contests.size,
        wins: a.wins,
        losses: a.losses,
        winPct,
        earnings: Math.round(a.earnings * 100) / 100,
      }
    })
    aggs.sort((a, b) => b.earnings - a.earnings || b.wins - a.wins || b.winPct - a.winPct)

    return Response.json({ aggs })
  } catch (e) {
    console.error(e)
    return Response.json({ aggs: [] }, { status: 500 })
  }
}
