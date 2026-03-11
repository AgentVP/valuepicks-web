'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getLocalDateString } from '@/lib/dateUtils'
import { teamToCanonicalAbbrev } from '@/lib/nhlTeamNames'

type Game = {
  id: number
  away_team: string
  home_team: string
  start_time: string
  away_score: number | null
  home_score: number | null
}

type PickGame = {
  away_team: string
  home_team: string
  away_score: number | null
  home_score: number | null
}

type Pick = {
  game_id: number
  picked_team: string
  result: boolean | null
  decimal_odds: number | null
  games: PickGame[]
}

type Entry = {
  entrant_name: string
  picks: Pick[]
}

const ENTRY_FEE = 5

function parlayMultiplier(picks: Pick[]): number | null {
  const withOdds = picks.filter((p) => p.decimal_odds != null && p.decimal_odds > 0)
  if (withOdds.length === 0) return null
  const product = withOdds.reduce((acc, p) => acc * (p.decimal_odds ?? 1), 1)
  return Math.round(product * 100) / 100
}

function decimalParlayToAmerican(multiplier: number): number {
  // multiplier is decimal odds for full parlay, > 1
  if (multiplier >= 2) {
    return Math.round((multiplier - 1) * 100)
  }
  return Math.round(-100 / (multiplier - 1))
}

/** Always show parlay in American odds (e.g. +3500, +126,340). Never show decimal or "x" format. */
function formatParlay(m: number | null): string {
  if (m == null || typeof m !== 'number') return '–'
  const american = decimalParlayToAmerican(m)
  const str = String(Math.abs(american))
  const withCommas = str.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return american >= 0 ? `+${withCommas}` : `-${withCommas}`
}

/** Single source of truth for leaderboard parlay display: always American odds string. */
function parlayDisplay(picks: Pick[]): string {
  const m = parlayMultiplier(picks)
  return formatParlay(m)
}

function formatSinglePickAmerican(decimal: number | null | undefined): string {
  if (decimal == null) return ''
  const american = decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1))
  return american >= 0 ? `+${american}` : `${american}`
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [potInfo, setPotInfo] = useState<{ entryCount: number; pot: number; perWinner: number } | null>(null)

  useEffect(() => {
    loadBoard()
    const interval = setInterval(loadBoard, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadBoard() {
    // Keep Supabase in sync by grading the slate periodically (updates games + pick results).
    // Without this, production can appear "stuck" because the leaderboard only reads DB state.
    try {
      await fetch('/api/grade-slate', { cache: 'no-store' })
    } catch (_) {
      // If grading fails (network, etc.), still show whatever DB data we have.
    }

    const today = getLocalDateString()

    const { data: slateRows, error: slateError } = await supabase
      .from('slates')
      .select('id')
      .eq('slate_date', today)
      .order('id', { ascending: false })
      .limit(1)

    const slate = slateError ? null : slateRows?.[0] ?? null
    if (!slate) {
      setGames([])
      setEntries([])
      setPotInfo(null)
      return
    }

    const { data: gameRows, error: gamesError } = await supabase
      .from('games')
      .select('id, away_team, home_team, start_time, away_score, home_score')
      .eq('slate_id', slate.id)
      .order('start_time', { ascending: true })

    if (gamesError) {
      console.error(gamesError)
      setGames([])
      return
    }
    const raw = gameRows || []
    const byCanonical = new Map<string, Game>()
    for (const g of raw) {
      const key = `${teamToCanonicalAbbrev(g.away_team)}_${teamToCanonicalAbbrev(g.home_team)}`
      const existing = byCanonical.get(key)
      const gIsCanonical =
        g.away_team === teamToCanonicalAbbrev(g.away_team) &&
        g.home_team === teamToCanonicalAbbrev(g.home_team)
      if (!existing) {
        byCanonical.set(key, g)
      } else {
        const exIsCanonical =
          existing.away_team === teamToCanonicalAbbrev(existing.away_team) &&
          existing.home_team === teamToCanonicalAbbrev(existing.home_team)
        if (gIsCanonical && !exIsCanonical) byCanonical.set(key, g)
      }
    }
    const deduped = Array.from(byCanonical.values()).sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    setGames(deduped)

    const { data: entryRows, error: entriesError } = await supabase
      .from('entries')
      .select(`
        entrant_name,
        picks (
          game_id,
          picked_team,
          result,
          decimal_odds,
          games (
            away_team,
            home_team,
            away_score,
            home_score
          )
        )
      `)
      .eq('slate_id', slate.id)

    if (entriesError) {
      console.error(entriesError)
      return
    }

    const list = (entryRows as Entry[]) || []
    const wins = (p: Pick[]) => p.filter((x) => x.result === true).length
    const parlay = (e: Entry) => parlayMultiplier(e.picks) ?? 0
    list.sort((a, b) => {
      const wa = wins(a.picks)
      const wb = wins(b.picks)
      if (wb !== wa) return wb - wa
      return parlay(b) - parlay(a)
    })
    setEntries(list)

    // Compute today's pot and winner payout assuming fixed entry fee
    const entryCount = list.length
    if (entryCount === 0) {
      setPotInfo(null)
    } else {
      const maxWins = Math.max(...list.map((e) => wins(e.picks)))
      const top = list.filter((e) => wins(e.picks) === maxWins)
      const maxParlay = Math.max(...top.map((e) => parlayMultiplier(e.picks) ?? 0))
      const winners = list.filter(
        (e) => wins(e.picks) === maxWins && (parlayMultiplier(e.picks) ?? 0) === maxParlay,
      )
      const pot = entryCount * ENTRY_FEE
      const perWinner = winners.length > 0 ? pot / winners.length : 0
      setPotInfo({ entryCount, pot, perWinner })
    }
  }

  function record(picks: Pick[]) {
    const w = picks.filter((p) => p.result === true).length
    const l = picks.filter((p) => p.result === false).length
    return `${w}-${l}`
  }

  function logo(team: string) {
    const abbrev = teamToCanonicalAbbrev(team)
    return `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`
  }

  /** Thumbnail style: light green when pick is winning live, light red when losing; full green/red when game final. */
  function boxStyle(p: Pick): string {
    const g = p.games?.[0]
    if (!g) return 'bg-[var(--card-border)]'
    if (p.result === true) return 'bg-[var(--win)]'
    if (p.result === false) return 'bg-[var(--loss)]'
    if (g.away_score === null || g.home_score === null) return 'bg-[var(--card-border)]'
    if (g.away_score === g.home_score) return 'bg-[var(--ice)]/25'
    const leading = g.away_score > g.home_score ? g.away_team : g.home_team
    return p.picked_team === leading
      ? 'bg-[var(--win)]/50'
      : 'bg-[var(--loss)]/50'
  }

  function pickForGame(entry: Entry, gameId: number) {
    return entry.picks.find((p) => p.game_id === gameId)
  }

  function pickLiveStatus(p: Pick): 'winning' | 'losing' | 'tied' | null {
    const g = p.games?.[0]
    if (!g || p.result !== null) return null
    if (g.away_score == null || g.home_score == null) return null
    if (g.away_score === g.home_score) return 'tied'
    const leading = g.away_score > g.home_score ? g.away_team : g.home_team
    return p.picked_team === leading ? 'winning' : 'losing'
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">Leaderboard</h1>
      <p className="text-[var(--ice)]/70 text-sm mb-2">
        Ties broken by parlay odds (higher = better). Add odds when you submit picks to use the tiebreaker.
      </p>
      <p className="text-[var(--ice)]/90 text-sm font-medium mb-4">
        Entry fee: <span className="text-white font-semibold">${ENTRY_FEE.toFixed(2)}</span>
      </p>
      {potInfo && (
        <div className="mb-4 text-sm text-[var(--ice)]/80">
          <div>
            <span className="font-semibold text-white">${ENTRY_FEE.toFixed(2)}</span> entry fee ·{' '}
            <span className="font-semibold text-white">{potInfo.entryCount}</span> entries
          </div>
          <div>
            Pot: <span className="font-semibold text-[var(--accent)]">${potInfo.pot.toFixed(2)}</span>{' '}
            · Winner payout:{' '}
            <span className="font-semibold text-[var(--accent)]">
              ${potInfo.perWinner.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {entries.map((entry, rank) => (
          <div
            key={entry.entrant_name}
            className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 card-hover"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm ${
                    rank === 0
                      ? 'bg-[var(--live)] text-[var(--background)]'
                      : rank === 1
                        ? 'bg-[var(--ice)]/30 text-[var(--ice)]'
                        : rank === 2
                          ? 'bg-amber-700/50 text-amber-200'
                          : 'bg-white/10 text-[var(--ice)]'
                  }`}
                  title={`Place: ${rank + 1}`}
                >
                  {rank + 1}
                </span>
                <span className="font-bold text-lg text-white">
                  {entry.entrant_name}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className="font-mono font-bold text-[var(--accent)] text-lg"
                  title="Wins–Losses"
                >
                  {record(entry.picks)}
                </span>
                <span
                  className="text-sm text-[var(--ice)]/70"
                  title="Parlay tiebreaker in American odds (higher wins ties)"
                >
                  {parlayDisplay(entry.picks)} parlay
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {games.map((game) => {
                const pick = pickForGame(entry, game.id)
                if (!pick) {
                  return (
                    <div
                      key={game.id}
                      className="w-8 h-8 rounded-lg bg-[var(--card-border)] shrink-0"
                      title={`No pick · ${game.away_team} @ ${game.home_team}`}
                    />
                  )
                }
                const liveStatus = pickLiveStatus(pick)
                const titleParts = [pick.picked_team]
                if (pick.decimal_odds != null) titleParts.push(`(${formatSinglePickAmerican(pick.decimal_odds)})`)
                if (pick.result === true) titleParts.push('· Won')
                if (pick.result === false) titleParts.push('· Lost')
                if (liveStatus === 'winning') titleParts.push('· Currently winning')
                if (liveStatus === 'losing') titleParts.push('· Currently losing')
                if (liveStatus === 'tied') titleParts.push('· Tied')
                return (
                  <div
                    key={game.id}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${boxStyle(pick)}`}
                    title={titleParts.join(' ')}
                  >
                    <img
                      src={logo(pick.picked_team)}
                      width={20}
                      height={20}
                      alt={pick.picked_team}
                      className="opacity-90"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
