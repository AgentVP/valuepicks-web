'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { teamToCanonicalAbbrev } from '@/lib/nhlTeamNames'

type Game = {
  id: number
  nhl_game_id?: number | null
  away_team: string
  home_team: string
  start_time: string
  away_score: number | null
  home_score: number | null
  winner_team?: string | null
  alternateGameIds?: number[]
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
  return Math.round(withOdds.reduce((acc, p) => acc * (p.decimal_odds ?? 1), 1) * 100) / 100
}

function decimalParlayToAmerican(multiplier: number): number {
  if (multiplier >= 2) return Math.round((multiplier - 1) * 100)
  return Math.round(-100 / (multiplier - 1))
}

function formatParlay(m: number | null): string {
  if (m == null || typeof m !== 'number') return '–'
  const american = decimalParlayToAmerican(m)
  const str = String(Math.abs(american))
  const withCommas = str.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return american >= 0 ? `+${withCommas}` : `-${withCommas}`
}

function logo(team: string) {
  const abbrev = teamToCanonicalAbbrev(team)
  return `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`
}

function computedResult(p: Pick): boolean | null {
  if (typeof p.computed_result === 'boolean') return p.computed_result
  const g = p.games?.[0]
  const winner = g?.winner_team
  if (!winner) return null
  return teamToCanonicalAbbrev(p.picked_team) === teamToCanonicalAbbrev(winner)
}

function pickForGame(entry: Entry, game: Game): Pick | undefined {
  return entry.picks.find(
    (p) => p.game_id === game.id || game.alternateGameIds?.includes(p.game_id),
  )
}

function record(picks: Pick[]): string {
  const w = picks.filter((p) => computedResult(p) === true).length
  const l = picks.filter((p) => computedResult(p) === false).length
  return `${w}-${l}`
}

export default function HistoryDatePage() {
  const params = useParams()
  const date = typeof params.date === 'string' ? params.date : ''
  const [games, setGames] = useState<Game[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [potInfo, setPotInfo] = useState<{ entryCount: number; pot: number; perWinner: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!date) return
    load()
  }, [date])

  async function load() {
    setLoading(true)
    setNotFound(false)
    try {
      const res = await fetch(`/api/leaderboard?date=${encodeURIComponent(date)}`, { cache: 'no-store' })
      if (!res.ok) {
        setNotFound(true)
        setLoading(false)
        return
      }
      const json = await res.json()
      const g: Game[] = json.games || []
      const e: Entry[] = json.entries || []
      if (g.length === 0 && e.length === 0) {
        setNotFound(true)
        setGames([])
        setEntries([])
        setPotInfo(null)
        setLoading(false)
        return
      }
      setGames(g)
      setEntries(e)
      setPotInfo(json.potInfo ?? null)
    } catch {
      setNotFound(true)
      setGames([])
      setEntries([])
      setPotInfo(null)
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-8 text-[var(--ice)]/70">
        Loading…
      </div>
    )
  }
  if (notFound || !date) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <p className="text-[var(--ice)]/70 mb-4">Contest not found for this date.</p>
        <Link href="/history" className="text-[var(--accent)] font-medium hover:underline">
          ← Back to past contests
        </Link>
      </div>
    )
  }

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/history" className="text-[var(--accent)] font-medium hover:underline">
          ← Past contests
        </Link>
      </div>
      <h1 className="text-3xl font-bold text-white mb-2">{dateLabel}</h1>
      <p className="text-[var(--ice)]/70 text-sm mb-2">
        Same scoring as the main leaderboard: final results from the NHL schedule (and DB fallback when
        available).
      </p>
      <p className="text-[var(--ice)]/70 text-xs mb-6">
        Ties broken by parlay odds (higher = better).
      </p>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-white mb-3">Games</h2>
        <div className="space-y-3">
          {games.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-[var(--card)] border border-[var(--card-border)]"
            >
              <img src={logo(g.away_team)} alt="" width={24} height={24} />
              <span className="font-semibold text-white">{g.away_team}</span>
              <span className="text-[var(--ice)]/60 text-sm">
                {g.away_score != null && g.home_score != null
                  ? `${g.away_score} – ${g.home_score}`
                  : '–'}
              </span>
              <span className="font-semibold text-white">{g.home_team}</span>
              <img src={logo(g.home_team)} alt="" width={24} height={24} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-3">Leaderboard</h2>
        {potInfo && (
          <div className="mb-4 text-sm text-[var(--ice)]/80">
            <span className="font-semibold text-white">${ENTRY_FEE.toFixed(2)}</span> entry fee ·{' '}
            <span className="font-semibold text-white">{potInfo.entryCount}</span> entries · Pot{' '}
            <span className="font-semibold text-[var(--accent)]">${potInfo.pot.toFixed(2)}</span>
            {potInfo.perWinner > 0 && (
              <>
                {' '}
                · Winner payout ~{' '}
                <span className="font-semibold text-[var(--accent)]">${potInfo.perWinner.toFixed(2)}</span>
              </>
            )}
          </div>
        )}
        <div className="space-y-4">
          {entries.map((entry, rank) => (
            <div
              key={entry.entrant_name}
              className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-white">
                  {rank + 1}. {entry.entrant_name}
                </span>
                <span className="font-mono text-[var(--accent)] font-semibold">{record(entry.picks)}</span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {games.map((game) => {
                  const pick = pickForGame(entry, game)
                  if (!pick) {
                    return (
                      <div
                        key={game.id}
                        className="w-7 h-7 rounded bg-[var(--card-border)]"
                        title="No pick"
                      />
                    )
                  }
                  const r = computedResult(pick)
                  const cls =
                    r === true
                      ? 'bg-[var(--win)]'
                      : r === false
                        ? 'bg-[var(--loss)]'
                        : 'bg-[var(--card-border)]'
                  return (
                    <div
                      key={game.id}
                      className={`w-7 h-7 rounded flex items-center justify-center ${cls}`}
                      title={pick.picked_team}
                    >
                      <img src={logo(pick.picked_team)} width={18} height={18} alt="" />
                    </div>
                  )
                })}
              </div>
              <div className="text-xs text-[var(--ice)]/60 mt-1">
                Parlay: {formatParlay(parlayMultiplier(entry.picks))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
