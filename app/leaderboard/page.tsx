'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

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

function parlayMultiplier(picks: Pick[]): number | null {
  const withOdds = picks.filter((p) => p.decimal_odds != null && p.decimal_odds > 0)
  if (withOdds.length === 0) return null
  const product = withOdds.reduce((acc, p) => acc * (p.decimal_odds ?? 1), 1)
  return Math.round(product * 100) / 100
}

function formatParlay(m: number | null): string {
  if (m == null) return '–'
  if (m >= 10) return `${m.toFixed(1)}x`
  return `${m.toFixed(2)}x`
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [games, setGames] = useState<Game[]>([])

  useEffect(() => {
    loadBoard()
  }, [])

  async function loadBoard() {
    const today = new Date().toISOString().split('T')[0]

    const { data: slate, error: slateError } = await supabase
      .from('slates')
      .select('id')
      .eq('slate_date', today)
      .single()

    if (slateError || !slate) return

    const { data: gameRows, error: gamesError } = await supabase
      .from('games')
      .select('id, away_team, home_team, start_time, away_score, home_score')
      .eq('slate_id', slate.id)
      .order('start_time', { ascending: true })

    if (gamesError) {
      console.error(gamesError)
      return
    }
    setGames(gameRows || [])

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
  }

  function record(picks: Pick[]) {
    const w = picks.filter((p) => p.result === true).length
    const l = picks.filter((p) => p.result === false).length
    return `${w}-${l}`
  }

  function logo(team: string) {
    return `https://assets.nhle.com/logos/nhl/svg/${team}_dark.svg`
  }

  function boxStyle(p: Pick): string {
    const g = p.games?.[0]
    if (!g) return 'bg-[var(--card-border)]'
    if (p.result === true) return 'bg-[var(--win)]'
    if (p.result === false) return 'bg-[var(--loss)]'
    if (g.away_score === null || g.home_score === null) return 'bg-[var(--card-border)]'
    if (g.away_score === g.home_score) return 'bg-[var(--ice)]/20'
    const leading = g.away_score > g.home_score ? g.away_team : g.home_team
    return p.picked_team === leading ? 'bg-[var(--win)]/30' : 'bg-[var(--loss)]/30'
  }

  function pickForGame(entry: Entry, gameId: number) {
    return entry.picks.find((p) => p.game_id === gameId)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">Leaderboard</h1>
      <p className="text-[var(--ice)]/70 text-sm mb-6">
        Ties broken by parlay odds (higher = better). Add odds when you submit picks to use the tiebreaker.
      </p>

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
                >
                  {rank + 1}
                </span>
                <span className="font-bold text-lg text-white">
                  {entry.entrant_name}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono font-bold text-[var(--accent)] text-lg">
                  {record(entry.picks)}
                </span>
                <span
                  className="text-sm text-[var(--ice)]/70"
                  title="Parlay tiebreaker (higher wins ties)"
                >
                  {formatParlay(parlayMultiplier(entry.picks))} parlay
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
                    />
                  )
                }
                return (
                  <div
                    key={game.id}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${boxStyle(pick)}`}
                    title={`${pick.picked_team}${pick.decimal_odds ? ` (${pick.decimal_odds}x)` : ''}`}
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
