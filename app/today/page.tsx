'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getLocalDateString } from '@/lib/dateUtils'
import { teamToCanonicalAbbrev } from '@/lib/nhlTeamNames'

type Game = {
  id: number
  nhl_game_id?: number | null
  away_team: string
  home_team: string
  away_score: number | null
  home_score: number | null
  winner_team: string | null
  start_time: string
  period: string | null
  clock: string | null
  status: string | null
}

type Pick = {
  game_id: number
  picked_team: string
  entrant_name: string
}

type NhlGame = {
  id: number
  awayTeam: { abbrev: string; score?: number }
  homeTeam: { abbrev: string; score?: number }
  gameState: string
  periodDescriptor?: { number: number; periodType?: string }
  clock?: { timeRemaining: string }
}

type GameOdds = { away_american: number; home_american: number }

function formatAmerican(american: number): string {
  if (american >= 0) return `+${american}`
  return `${american}`
}

export default function TodayPage() {
  const [games, setGames] = useState<Game[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [oddsByGame, setOddsByGame] = useState<Record<string, GameOdds>>({})
  const [lastUpdate, setLastUpdate] = useState('')

  useEffect(() => {
    loadPage()
    const interval = setInterval(loadPage, 15000)
    return () => clearInterval(interval)
  }, [])

  async function loadPage() {
    const today = getLocalDateString()

    const { data: slateRows } = await supabase
      .from('slates')
      .select('id')
      .eq('slate_date', today)
      .order('id', { ascending: false })
      .limit(1)

    const slate = slateRows?.[0] ?? null
    if (!slate) return

    const { data: gameRows } = await supabase
      .from('games')
      .select(`
        id,
        nhl_game_id,
        away_team,
        home_team,
        away_score,
        home_score,
        winner_team,
        start_time,
        period,
        clock,
        status
      `)
      .eq('slate_id', slate.id)
      .order('start_time')

    const rawList: Game[] = gameRows || []
    const byCanonical = new Map<string, Game>()
    for (const g of rawList) {
      const gAwayCanon = teamToCanonicalAbbrev(g.away_team)
      const gHomeCanon = teamToCanonicalAbbrev(g.home_team)
      const key = `${gAwayCanon}_${gHomeCanon}`
      const existing = byCanonical.get(key)
      const gIsCanonical = g.away_team === gAwayCanon && g.home_team === gHomeCanon
      const normalized = { ...g, away_team: gAwayCanon, home_team: gHomeCanon }
      if (!existing) {
        byCanonical.set(key, normalized)
      } else {
        const exIsCanonical = existing.away_team === teamToCanonicalAbbrev(existing.away_team) && existing.home_team === teamToCanonicalAbbrev(existing.home_team)
        if (gIsCanonical && !exIsCanonical) byCanonical.set(key, normalized)
        else if (!existing.nhl_game_id && g.nhl_game_id) byCanonical.set(key, normalized)
      }
    }
    let gamesList = Array.from(byCanonical.values()).sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )

    try {
      const [nhlRes, oddsRes] = await Promise.all([
        fetch(`/api/schedule?date=${today}`, { cache: 'no-store' }),
        fetch('/api/odds'),
      ])

      let nhlGames: NhlGame[] = []
      if (nhlRes.ok) {
        const nhlJson = await nhlRes.json()
        nhlGames =
          nhlJson.gameWeek
            ?.filter((d: { date: string }) => d.date === today)
            ?.flatMap((d: { games?: NhlGame[] }) => d.games || []) || []
      }

      const nhlById = new Map(nhlGames.map((g) => [g.id, g]))
      const nhlByMatchup = new Map(
        nhlGames.map((g) => [
          `${g.awayTeam?.abbrev}_${g.homeTeam?.abbrev}`,
          g,
        ])
      )

      gamesList = gamesList.map((g) => {
        const nhl =
          (g.nhl_game_id != null ? nhlById.get(g.nhl_game_id) : null) ??
          nhlByMatchup.get(`${g.away_team}_${g.home_team}`)
        if (!nhl) return g
        const awayScore = nhl.awayTeam?.score ?? null
        const homeScore = nhl.homeTeam?.score ?? null
        let winner: string | null = g.winner_team
        const isFinal =
          nhl.gameState === 'FINAL' || nhl.gameState === 'OFF'
        if (
          isFinal &&
          awayScore !== null &&
          homeScore !== null
        ) {
          if (awayScore > homeScore) winner = nhl.awayTeam.abbrev
          else if (homeScore > awayScore) winner = nhl.homeTeam.abbrev
        }
        const periodNum = nhl.periodDescriptor?.number
        const periodStr = periodNum
          ? `${periodNum}${nhl.periodDescriptor?.periodType === 'REG' ? '' : ' OT'}`
          : null
        return {
          ...g,
          away_score: awayScore,
          home_score: homeScore,
          winner_team: winner,
          status: nhl.gameState || g.status,
          period: periodStr,
          clock: nhl.clock?.timeRemaining ?? g.clock,
        }
      })

      if (oddsRes.ok) {
        const oddsJson = await oddsRes.json()
        const odds: Record<string, GameOdds> = {}
        for (const o of oddsJson.odds ?? []) {
          odds[`${o.away_team}_${o.home_team}`] = {
            away_american: o.away_american,
            home_american: o.home_american,
          }
        }
        setOddsByGame(odds)
      }
    } catch (_) {
      // keep DB data if APIs fail
    }

    setGames(gamesList)

    const { data: pickRows } = await supabase
      .from('picks')
      .select(`
        game_id,
        picked_team,
        entries (
          entrant_name
        )
      `)

    const formatted = (pickRows || []).map((p: { game_id: number; picked_team: string; entries: { entrant_name: string } | { entrant_name: string }[] | null }) => {
      const ent = Array.isArray(p.entries) ? p.entries[0] : p.entries
      return {
        game_id: p.game_id,
        picked_team: p.picked_team,
        entrant_name: ent?.entrant_name ?? '',
      }
    })
    setPicks(formatted)
    setLastUpdate(new Date().toLocaleTimeString())
  }

  function logo(team: string) {
    const abbrev = teamToCanonicalAbbrev(team)
    return `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">Today&apos;s Picks</h1>
      <p className="text-[var(--ice)]/60 text-sm mb-6">
        Live scores from NHL — updates every 15s · Last refresh {lastUpdate}
      </p>

      <div className="space-y-5">
        {games.map((g) => {
          const gamePicks = picks.filter((p) => p.game_id === g.id)
          const awayPicks = gamePicks.filter((p) => p.picked_team === g.away_team)
          const homePicks = gamePicks.filter((p) => p.picked_team === g.home_team)
          const total = gamePicks.length || 1
          const awayPct = Math.round((awayPicks.length / total) * 100)
          const homePct = Math.round((homePicks.length / total) * 100)
          const isLive = g.status === 'LIVE'
          const isFinal = g.status === 'FINAL' || g.status === 'OFF'
          const notStarted = !isLive && !isFinal
          const oddsKey = `${g.away_team}_${g.home_team}`
          const odds = oddsByGame[oddsKey]

          return (
            <div
              key={g.id}
              className={`rounded-xl border overflow-hidden card-hover ${
                isLive
                  ? 'bg-[var(--card)] border-[var(--live)]/40'
                  : 'bg-[var(--card)] border-[var(--card-border)]'
              }`}
            >
              <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--card-border)] flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <img src={logo(g.away_team)} alt="" width={28} height={28} />
                  <span className="font-bold text-white">{g.away_team}</span>
                  {notStarted && odds && (
                    <span className="text-xs text-[var(--ice)]/80 font-medium">
                      {formatAmerican(odds.away_american)}
                    </span>
                  )}
                  <span className="text-[var(--ice)]/50">@</span>
                  <img src={logo(g.home_team)} alt="" width={28} height={28} />
                  <span className="font-bold text-white">{g.home_team}</span>
                  {notStarted && odds && (
                    <span className="text-xs text-[var(--ice)]/80 font-medium">
                      {formatAmerican(odds.home_american)}
                    </span>
                  )}
                </div>
                {isLive && (
                  <span className="text-xs font-semibold text-[var(--live)] live-pulse uppercase tracking-wider">
                    Live
                  </span>
                )}
                {isFinal && (
                  <span className="text-xs text-[var(--ice)]/60">Final</span>
                )}
              </div>

              <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
                <div className="text-2xl font-bold tabular-nums text-white">
                  {g.away_score !== null && g.home_score !== null
                    ? `${g.away_score} – ${g.home_score}`
                    : '– –'}
                </div>
                {isLive && g.period && (
                  <span className="text-sm text-[var(--ice)]/70">
                    {g.period}{g.clock != null ? ` · ${g.clock}` : ''}
                  </span>
                )}
              </div>

              <div className="px-4 py-2 flex gap-4 text-sm font-semibold text-[var(--ice)]/80">
                <span>{g.away_team}: {awayPicks.length} ({awayPct}%)</span>
                <span>{g.home_team}: {homePicks.length} ({homePct}%)</span>
              </div>

              <div className="px-4 py-3 pt-0 space-y-1">
                {gamePicks.length === 0 ? (
                  <p className="text-[var(--ice)]/50 text-sm">No picks yet</p>
                ) : (
                  gamePicks.map((p, i) => {
                    let result = ''
                    if (g.winner_team) {
                      result = p.picked_team === g.winner_team ? ' ✅' : ' ❌'
                    }
                    return (
                      <div
                        key={`${p.entrant_name}-${i}`}
                        className={`text-sm ${p.picked_team === g.winner_team ? 'correct-pop text-[var(--win)]' : g.winner_team ? 'text-[var(--loss)]' : 'text-[var(--ice)]/90'}`}
                      >
                        {p.entrant_name} → {p.picked_team}{result}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
