'use client'

import { useEffect, useState } from 'react'
import { getLocalDateString } from '@/lib/dateUtils'

type Game = {
  id: number
  awayTeam: { abbrev: string; score?: number }
  homeTeam: { abbrev: string; score?: number }
  gameState: string
  periodDescriptor?: { number: number; periodType?: string }
  clock?: { timeRemaining: string }
}

function logo(team: string) {
  return `https://assets.nhle.com/logos/nhl/svg/${team}_dark.svg`
}

export default function Scoreboard() {
  const [games, setGames] = useState<Game[]>([])

  useEffect(() => {
    loadGames()
    const interval = setInterval(loadGames, 20000)
    return () => clearInterval(interval)
  }, [])

  async function loadGames() {
    const today = getLocalDateString()
    try {
      const res = await fetch(`/api/schedule?date=${today}`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      const list =
        json.gameWeek
          ?.filter((d: { date: string }) => d.date === today)
          ?.flatMap((d: { games?: Game[] }) => d.games || []) || []
      setGames(list)
    } catch (_) {
      setGames([])
    }
  }

  if (games.length === 0) return null

  return (
    <div className="border-t border-[var(--card-border)] bg-black/30 overflow-x-auto">
      <div className="flex items-center gap-8 px-4 py-3 min-w-max">
        <span className="text-sm font-semibold text-[var(--ice)]/90 uppercase tracking-wider shrink-0">
          Live
        </span>
        {games.map((g) => {
          const isLive = g.gameState === 'LIVE'
          const isFinal = g.gameState === 'FINAL' || g.gameState === 'OFF'
          const showScore = isLive || isFinal
          const period = g.periodDescriptor?.number
          const clock = g.clock?.timeRemaining
          return (
            <div
              key={g.id}
              className="flex items-center gap-1.5 shrink-0"
            >
              <img
                src={logo(g.awayTeam.abbrev)}
                alt=""
                width={26}
                height={26}
                className="opacity-90 shrink-0"
              />
              {showScore && g.awayTeam.score != null ? (
                <span className="text-base font-semibold text-white w-6 text-right tabular-nums">{g.awayTeam.score}</span>
              ) : null}
              <span className="text-[var(--ice)]/50 text-sm shrink-0">@</span>
              <img
                src={logo(g.homeTeam.abbrev)}
                alt=""
                width={26}
                height={26}
                className="opacity-90 shrink-0"
              />
              {showScore && g.homeTeam.score != null ? (
                <span className="text-base font-semibold text-white w-6 tabular-nums">{g.homeTeam.score}</span>
              ) : null}
              {isLive && period && (
                <span className="text-sm text-[var(--live)] font-medium live-pulse min-w-[3rem]">
                  {period}P {clock ?? ''}
                </span>
              )}
              {isFinal && (
                <span className="text-sm text-[var(--ice)]/60">Final</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
