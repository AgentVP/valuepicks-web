'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { teamToCanonicalAbbrev } from '@/lib/nhlTeamNames'

type NhlGame = {
  id: number
  awayTeam: { abbrev: string; score?: number }
  homeTeam: { abbrev: string; score?: number }
  gameState: string
  periodDescriptor?: { number: number; periodType?: string }
  clock?: { timeRemaining: string }
  startTimeUTC?: string
}

type SlateGame = {
  id: number
  nhl_game_id: number | null
  away_team: string
  home_team: string
  start_time: string
}

function logo(team: string) {
  return `https://assets.nhle.com/logos/nhl/svg/${team}_dark.svg`
}

export default function ScoreboardTicker() {
  const [games, setGames] = useState<Array<{
    key: number
    away: string
    home: string
    awayScore: number | null
    homeScore: number | null
    timeStr: string
    isLive: boolean
    isFinal: boolean
  }>>([])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  async function load() {
    try {
      const dateRes = await fetch('/api/contest-date', { cache: 'no-store' })
      const { date: today } = (await dateRes.json()) as { date: string }
      const { data: slateRows } = await supabase
        .from('slates')
        .select('id')
        .eq('slate_date', today)
        .order('id', { ascending: false })
        .limit(1)
      const slate = slateRows?.[0]
      if (!slate) {
        setGames([])
        return
      }
      const { data: gameRows } = await supabase
        .from('games')
        .select('id, nhl_game_id, away_team, home_team, start_time')
        .eq('slate_id', slate.id)
        .order('start_time')
      const slateGames: SlateGame[] = gameRows || []
      const seen = new Set<string>()
      const deduped = slateGames.filter((g) => {
        const key = `${g.away_team}_${g.home_team}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (deduped.length === 0) {
        setGames([])
        return
      }
      const nhlRes = await fetch(`/api/schedule?date=${today}`, { cache: 'no-store' })
      let nhlGames: NhlGame[] = []
      if (nhlRes.ok) {
        const json = await nhlRes.json()
        nhlGames =
          json.gameWeek
            ?.filter((d: { date: string }) => d.date === today)
            ?.flatMap((d: { games?: NhlGame[] }) => d.games || []) || []
      }
      const nhlById = new Map(nhlGames.map((g) => [g.id, g]))
      const nhlByMatchup = new Map(
        nhlGames.map((g) => [`${g.awayTeam?.abbrev}_${g.homeTeam?.abbrev}`, g])
      )
      const items = deduped.map((g) => {
        const nhl =
          (g.nhl_game_id != null ? nhlById.get(g.nhl_game_id) : null) ??
          nhlByMatchup.get(`${g.away_team}_${g.home_team}`)
        const isLive = nhl?.gameState === 'LIVE'
        const isFinal = nhl?.gameState === 'FINAL' || nhl?.gameState === 'OFF'
        const showScore = isLive || isFinal
        const period = nhl?.periodDescriptor?.number
        const clock = nhl?.clock?.timeRemaining
        const timeStr = isLive && period
          ? ` ${period}P ${clock ?? ''}`
          : isFinal
            ? ' Final'
            : g.start_time
              ? ` ${new Date(g.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
              : ''
        return {
          key: g.id,
          away: teamToCanonicalAbbrev(g.away_team),
          home: teamToCanonicalAbbrev(g.home_team),
          awayScore: showScore && nhl?.awayTeam?.score != null ? nhl.awayTeam.score : null,
          homeScore: showScore && nhl?.homeTeam?.score != null ? nhl.homeTeam.score : null,
          timeStr,
          isLive: !!isLive,
          isFinal: !!isFinal,
        }
      })
      // Only show ticker when there is at least one live game.
      const liveOnly = items.filter((i) => i.isLive)
      setGames(liveOnly)
    } catch (_) {
      setGames([])
    }
  }

  if (games.length === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--card-border)] bg-[var(--card)] shadow-[0_-4px_12px_rgba(0,0,0,0.3)]">
      <div className="overflow-hidden py-3">
        <div className="flex animate-ticker gap-12 whitespace-nowrap">
          {[...games, ...games].map((item, i) => (
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
