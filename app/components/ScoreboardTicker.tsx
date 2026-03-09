'use client'

import { useEffect, useState } from 'react'

type Game = {
  id: number
  awayTeam: { abbrev: string; score?: number }
  homeTeam: { abbrev: string; score?: number }
  gameState: string
  periodDescriptor?: { number: number; periodType?: string }
  clock?: { timeRemaining: string }
  startTimeUTC?: string
}

function logo(team: string) {
  return `https://assets.nhle.com/logos/nhl/svg/${team}_dark.svg`
}

export default function ScoreboardTicker() {
  const [games, setGames] = useState<Game[]>([])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  async function load() {
    const today = new Date().toISOString().split('T')[0]
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

  const items = games.map((g) => {
    const isLive = g.gameState === 'LIVE'
    const isFinal = g.gameState === 'FINAL' || g.gameState === 'OFF'
    const showScore = isLive || isFinal
    const period = g.periodDescriptor?.number
    const clock = g.clock?.timeRemaining
    const timeStr = isLive && period
      ? ` ${period}P ${clock ?? ''}`
      : isFinal
        ? ' Final'
        : g.startTimeUTC
          ? ` ${new Date(g.startTimeUTC).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
          : ''
    return {
      key: g.id,
      away: g.awayTeam.abbrev,
      home: g.homeTeam.abbrev,
      awayScore: showScore && g.awayTeam?.score != null ? g.awayTeam.score : null,
      homeScore: showScore && g.homeTeam?.score != null ? g.homeTeam.score : null,
      timeStr,
      isLive,
      isFinal,
    }
  })

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--card-border)] bg-[var(--card)] shadow-[0_-4px_12px_rgba(0,0,0,0.3)]">
      <div className="overflow-hidden py-3">
        <div className="flex animate-ticker gap-12 whitespace-nowrap">
          {[...items, ...items].map((item, i) => (
            <div
              key={`${item.key}-${i}`}
              className="flex items-center gap-1.5 shrink-0 text-base"
            >
              <img src={logo(item.away)} alt="" width={24} height={24} className="opacity-90 shrink-0" />
              {item.awayScore != null ? (
                <span className="font-semibold text-white w-6 text-right tabular-nums">{item.awayScore}</span>
              ) : null}
              <span className="text-[var(--ice)]/50 shrink-0">@</span>
              <img src={logo(item.home)} alt="" width={24} height={24} className="opacity-90 shrink-0" />
              {item.homeScore != null ? (
                <span className="font-semibold text-white w-6 tabular-nums">{item.homeScore}</span>
              ) : null}
              <span className={`text-sm min-w-[3.5rem] ${item.isLive ? 'text-[var(--live)] font-medium' : 'text-[var(--ice)]/70'}`}>
                {item.timeStr}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
