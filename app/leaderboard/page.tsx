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
  games: PickGame[]
}

type Entry = {
  entrant_name: string
  picks: Pick[]
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

    setEntries((entryRows as Entry[]) || [])
  }

  function record(picks: Pick[]) {
    const wins = picks.filter((p) => p.result === true).length
    const losses = picks.filter((p) => p.result === false).length
    return `${wins}-${losses}`
  }

  function logo(team: string) {
    return `https://assets.nhle.com/logos/nhl/svg/${team}_dark.svg`
  }

  function boxStyle(p: Pick) {
    const g = p.games?.[0]

    if (!g) return { background: '#e5e7eb' }

    if (p.result === true) return { background: '#16a34a' }
    if (p.result === false) return { background: '#dc2626' }

    if (g.away_score === null || g.home_score === null) {
      return { background: '#e5e7eb' }
    }

    if (g.away_score === g.home_score) {
      return { background: '#d1d5db' }
    }

    const leading = g.away_score > g.home_score ? g.away_team : g.home_team

    if (p.picked_team === leading) {
      return { background: 'rgba(22,163,74,0.14)' }
    }

    return { background: 'rgba(220,38,38,0.14)' }
  }

  function pickForGame(entry: Entry, gameId: number) {
    return entry.picks.find((p) => p.game_id === gameId)
  }

  return (
    <div style={{ padding: 40, maxWidth: 900, margin: 'auto' }}>
      <h1>Leaderboard</h1>

      {entries.map((entry) => (
        <div
          key={entry.entrant_name}
          style={{
            marginBottom: 20,
            borderBottom: '1px solid #eee',
            paddingBottom: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 700,
            }}
          >
            <span>{entry.entrant_name}</span>
            <span>{record(entry.picks)}</span>
          </div>

          <div
            style={{
              marginTop: 10,
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            {games.map((game) => {
              const pick = pickForGame(entry, game.id)

              if (!pick) {
                return (
                  <div
                    key={game.id}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      background: '#e5e7eb',
                    }}
                  />
                )
              }

              return (
                <div
                  key={game.id}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...boxStyle(pick),
                  }}
                >
                  <img
                    src={logo(pick.picked_team)}
                    width={18}
                    height={18}
                    alt={pick.picked_team}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}