'use client'

import { useEffect, useState } from 'react'
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
  winner_team?: string | null
}

type Pick = {
  game_id: number
  picked_team: string
  result: boolean | null
  decimal_odds: number | null
  games: PickGame[]
  computed_result?: boolean | null
}

type Entry = {
  entrant_name: string
  picks: Pick[]
  computed?: { wins: number; losses: number; parlay: number | null }
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

  function computedResult(p: Pick): boolean | null {
    if (typeof p.computed_result === 'boolean') return p.computed_result
    const g = p.games?.[0]
    const winner = g?.winner_team
    if (!winner) return null
    return teamToCanonicalAbbrev(p.picked_team) === teamToCanonicalAbbrev(winner)
  }

  async function loadBoard() {
    const today = getLocalDateString()

    try {
      const res = await fetch(`/api/leaderboard?date=${encodeURIComponent(today)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Leaderboard API error ${res.status}`)
      const json = await res.json()
      const rawGames: Game[] = json.games || []
      const rawEntries: Entry[] = json.entries || []
      const rawPot = json.potInfo ?? null

      // Keep the same dedupe behavior as the old client-side query.
      const byCanonical = new Map<string, Game>()
      for (const g of rawGames) {
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
      setEntries(rawEntries)
      setPotInfo(rawPot)
    } catch (e) {
      console.error(e)
      setGames([])
      setEntries([])
      setPotInfo(null)
    }
  }

  function record(picks: Pick[]) {
    const w = picks.filter((p) => computedResult(p) === true).length
    const l = picks.filter((p) => computedResult(p) === false).length
    return `${w}-${l}`
  }

  function logo(team: string) {
    const abbrev = teamToCanonicalAbbrev(team)
    return `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`
  }

  /** Thumbnail style: light green when pick is winning live, light red when losing; full green/red when game final. */
  function boxStyle(p: Pick): string {
    const g = p.games?.[0]
    // Use plain Tailwind color classes (not CSS-var arbitrary values) so production builds
    // always include these styles.
    const neutral = 'bg-[var(--card-border)] ring-1 ring-inset ring-white/10'
    const winFinal = 'bg-emerald-500/20 ring-2 ring-inset ring-emerald-400 ring-offset-2 ring-offset-[var(--card)] shadow-[0_0_14px_rgba(52,211,153,0.35)]'
    const lossFinal = 'bg-red-500/20 ring-2 ring-inset ring-red-400 ring-offset-2 ring-offset-[var(--card)] shadow-[0_0_14px_rgba(248,113,113,0.35)]'
    const winLive = 'bg-emerald-500/10 ring-2 ring-inset ring-emerald-400/70 ring-offset-2 ring-offset-[var(--card)] shadow-[0_0_12px_rgba(52,211,153,0.22)]'
    const lossLive = 'bg-red-500/10 ring-2 ring-inset ring-red-400/70 ring-offset-2 ring-offset-[var(--card)] shadow-[0_0_12px_rgba(248,113,113,0.22)]'

    if (!g) return neutral
    const r = computedResult(p)
    if (r === true) return winFinal
    if (r === false) return lossFinal
    if (g.away_score === null || g.home_score === null) return neutral
    if (g.away_score === g.home_score) return 'bg-[var(--ice)]/25 ring-1 ring-inset ring-white/10'
    const leading = g.away_score > g.home_score ? g.away_team : g.home_team
    return p.picked_team === leading
      ? winLive
      : lossLive
  }

  function pickForGame(entry: Entry, gameId: number) {
    return entry.picks.find((p) => p.game_id === gameId)
  }

  function pickLiveStatus(p: Pick): 'winning' | 'losing' | 'tied' | null {
    const g = p.games?.[0]
    if (!g || g.winner_team) return null
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
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ice)]/70 mb-3">
        <span className="font-medium">Legend:</span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[var(--win)] border border-white/10" />
          Win
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[var(--loss)] border border-white/10" />
          Loss
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[var(--win)]/50 border border-white/10" />
          Currently winning
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[var(--loss)]/50 border border-white/10" />
          Currently losing
        </span>
      </div>
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
                const r = computedResult(pick)
                if (r === true) titleParts.push('· Won')
                if (r === false) titleParts.push('· Lost')
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
