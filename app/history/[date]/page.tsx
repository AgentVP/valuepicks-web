'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Game = {
  id: number
  away_team: string
  home_team: string
  start_time: string
  away_score: number | null
  home_score: number | null
  winner_team: string | null
}

type PickGame = { away_team: string; home_team: string; away_score: number | null; home_score: number | null }
type Pick = { game_id: number; picked_team: string; result: boolean | null; decimal_odds: number | null; games: PickGame[] }
type Entry = { entrant_name: string; picks: Pick[] }

function parlayMultiplier(picks: Pick[]): number | null {
  const withOdds = picks.filter((p) => p.decimal_odds != null && p.decimal_odds > 0)
  if (withOdds.length === 0) return null
  return Math.round(withOdds.reduce((acc, p) => acc * (p.decimal_odds ?? 1), 1) * 100) / 100
}

function formatParlay(m: number | null): string {
  if (m == null) return '–'
  return m >= 10 ? `${m.toFixed(1)}x` : `${m.toFixed(2)}x`
}

function logo(team: string) {
  return `https://assets.nhle.com/logos/nhl/svg/${team}_dark.svg`
}

export default function HistoryDatePage() {
  const params = useParams()
  const date = typeof params.date === 'string' ? params.date : ''
  const [games, setGames] = useState<Game[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!date) return
    load()
  }, [date])

  async function load() {
    setLoading(true)
    setNotFound(false)
    const { data: slate, error: slateError } = await supabase
      .from('slates')
      .select('id')
      .eq('slate_date', date)
      .maybeSingle()
    if (slateError || !slate) {
      setNotFound(true)
      setLoading(false)
      return
    }
    const { data: gameRows } = await supabase
      .from('games')
      .select('id, away_team, home_team, start_time, away_score, home_score, winner_team')
      .eq('slate_id', slate.id)
      .order('start_time')
    setGames(gameRows || [])
    const { data: entryRows } = await supabase
      .from('entries')
      .select(`
        entrant_name,
        picks (
          game_id,
          picked_team,
          result,
          decimal_odds,
          games ( away_team, home_team, away_score, home_score )
        )
      `)
      .eq('slate_id', slate.id)
    const list = (entryRows as Entry[]) || []
    const wins = (p: Pick[]) => p.filter((x) => x.result === true).length
    list.sort((a, b) => {
      const wa = wins(a.picks)
      const wb = wins(b.picks)
      if (wb !== wa) return wb - wa
      return (parlayMultiplier(b.picks) ?? 0) - (parlayMultiplier(a.picks) ?? 0)
    })
    setEntries(list)
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
      <p className="text-[var(--ice)]/70 text-sm mb-8">
        Results and leaderboard for this contest.
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
        <div className="space-y-4">
          {entries.map((entry, rank) => {
            const w = entry.picks.filter((p) => p.result === true).length
            const l = entry.picks.filter((p) => p.result === false).length
            return (
              <div
                key={entry.entrant_name}
                className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-white">
                    {rank + 1}. {entry.entrant_name}
                  </span>
                  <span className="font-mono text-[var(--accent)] font-semibold">
                    {w}-{l}
                  </span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {games.map((game) => {
                    const pick = entry.picks.find((p) => p.game_id === game.id)
                    if (!pick) return <div key={game.id} className="w-7 h-7 rounded bg-[var(--card-border)]" />
                    const cls =
                      pick.result === true
                        ? 'bg-[var(--win)]'
                        : pick.result === false
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
            )
          })}
        </div>
      </section>
    </div>
  )
}
