import { createClient } from '@supabase/supabase-js'
import { teamToCanonicalAbbrev } from '@/lib/nhlTeamNames'
import { getLocalDateString } from '@/lib/dateUtils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Game = {
  id: number
  nhl_game_id?: number | null
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
  computed_result?: boolean | null
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
  // Prefer server-computed result (derived from live NHL schedule) to avoid relying on DB-side grading.
  if (typeof p.computed_result === 'boolean') return p.computed_result
  return null
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const date = url.searchParams.get('date')?.trim() || getLocalDateString()

    // Do not use .maybeSingle(): duplicate slates for the same slate_date would error (PGRST116)
    // and return no data. Today page uses limit(1) + first row — match that here.
    const { data: slateRows, error: slateError } = await supabase
      .from('slates')
      .select('id')
      .eq('slate_date', date)
      .order('id', { ascending: false })
      .limit(1)

    const slate = !slateError && slateRows?.[0] ? slateRows[0] : null

    if (!slate) {
      return Response.json({ games: [], entries: [], potInfo: null })
    }

    const { data: gameRows, error: gamesError } = await supabase
      .from('games')
      .select('id, nhl_game_id, away_team, home_team, start_time, away_score, home_score, winner_team')
      .eq('slate_id', slate.id)
      .order('start_time', { ascending: true })

    if (gamesError) {
      return Response.json({ games: [], entries: [], potInfo: null }, { status: 500 })
    }

    const rawGames: Game[] = (gameRows as Game[]) || []
    const byCanonical = new Map<string, { game: Game; alternateIds: number[] }>()
    for (const g of rawGames) {
      const awayCanon = teamToCanonicalAbbrev(g.away_team)
      const homeCanon = teamToCanonicalAbbrev(g.home_team)
      const key = `${awayCanon}_${homeCanon}`
      const normalized = { ...g, away_team: awayCanon, home_team: homeCanon }
      const existing = byCanonical.get(key)
      if (!existing) {
        byCanonical.set(key, { game: normalized, alternateIds: [] })
      } else {
        const replace =
          (g.nhl_game_id != null && existing.game.nhl_game_id == null) ||
          (g.away_team === awayCanon && g.home_team === homeCanon && teamToCanonicalAbbrev(existing.game.away_team) !== existing.game.away_team)
        if (replace) {
          byCanonical.set(key, {
            game: normalized,
            alternateIds: [existing.game.id, ...existing.alternateIds],
          })
        } else {
          existing.alternateIds.push(g.id)
        }
      }
    }
    const games: (Game & { alternateGameIds?: number[] })[] = Array.from(byCanonical.values())
      .map(({ game, alternateIds }) => ({ ...game, alternateGameIds: alternateIds }))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

    // Pull live/final results from NHL schedule (same source as Today page).
    type NhlGame = {
      id: number
      awayTeam: { abbrev: string; score?: number }
      homeTeam: { abbrev: string; score?: number }
      gameState: string
    }

    let nhlGames: NhlGame[] = []
    try {
      const nhlRes = await fetch(`https://api-web.nhle.com/v1/schedule/${date}`, { cache: 'no-store' })
      if (nhlRes.ok) {
        const nhlJson = await nhlRes.json()
        nhlGames =
          nhlJson.gameWeek
            ?.filter((d: { date: string }) => d.date === date)
            ?.flatMap((d: { games?: NhlGame[] }) => d.games || []) || []
      }
    } catch (_) {
      nhlGames = []
    }

    const nhlById = new Map(nhlGames.map((g) => [g.id, g]))
    const nhlByMatchup = new Map(
      nhlGames.map((g) => [`${g.awayTeam?.abbrev}_${g.homeTeam?.abbrev}`, g] as const)
    )

    const computedWinnerByDbGameId = new Map<number, string | null>()
    for (const g of games) {
      const nhl =
        (g.nhl_game_id != null ? nhlById.get(g.nhl_game_id) : null) ??
        nhlByMatchup.get(`${teamToCanonicalAbbrev(g.away_team)}_${teamToCanonicalAbbrev(g.home_team)}`)
      if (!nhl) {
        computedWinnerByDbGameId.set(g.id, null)
        continue
      }
      const isFinal = nhl.gameState === 'FINAL' || nhl.gameState === 'OFF'
      const awayScore = nhl.awayTeam?.score ?? null
      const homeScore = nhl.homeTeam?.score ?? null
      if (!isFinal || awayScore == null || homeScore == null) {
        computedWinnerByDbGameId.set(g.id, null)
        continue
      }
      if (awayScore > homeScore) computedWinnerByDbGameId.set(g.id, nhl.awayTeam.abbrev)
      else if (homeScore > awayScore) computedWinnerByDbGameId.set(g.id, nhl.homeTeam.abbrev)
      else computedWinnerByDbGameId.set(g.id, null)
    }

    // Picks may reference merged duplicate game rows; copy winner onto alternate ids.
    for (const g of games) {
      const w = computedWinnerByDbGameId.get(g.id) ?? null
      for (const altId of g.alternateGameIds ?? []) {
        computedWinnerByDbGameId.set(altId, w)
      }
    }

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

    // Attach computed results per pick.
    for (const e of entries) {
      for (const p of e.picks ?? []) {
        const winner = computedWinnerByDbGameId.get(p.game_id) ?? null
        p.computed_result = winner ? teamToCanonicalAbbrev(p.picked_team) === teamToCanonicalAbbrev(winner) : null
      }
    }

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

