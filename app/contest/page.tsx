'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type DbGame = {
  id: number
  away_team: string
  home_team: string
  start_time: string
  status: string | null
}

const TEAM_NAMES: Record<string, string> = {
  ANA: 'Anaheim Ducks',
  BOS: 'Boston Bruins',
  BUF: 'Buffalo Sabres',
  CAR: 'Carolina Hurricanes',
  CBJ: 'Columbus Blue Jackets',
  CGY: 'Calgary Flames',
  CHI: 'Chicago Blackhawks',
  COL: 'Colorado Avalanche',
  DAL: 'Dallas Stars',
  DET: 'Detroit Red Wings',
  EDM: 'Edmonton Oilers',
  FLA: 'Florida Panthers',
  LAK: 'Los Angeles Kings',
  MIN: 'Minnesota Wild',
  MTL: 'Montreal Canadiens',
  NJD: 'New Jersey Devils',
  NSH: 'Nashville Predators',
  NYI: 'New York Islanders',
  NYR: 'New York Rangers',
  OTT: 'Ottawa Senators',
  PHI: 'Philadelphia Flyers',
  PIT: 'Pittsburgh Penguins',
  SEA: 'Seattle Kraken',
  SJS: 'San Jose Sharks',
  STL: 'St. Louis Blues',
  TBL: 'Tampa Bay Lightning',
  TOR: 'Toronto Maple Leafs',
  UTA: 'Utah Hockey Club',
  VAN: 'Vancouver Canucks',
  VGK: 'Vegas Golden Knights',
  WPG: 'Winnipeg Jets',
  WSH: 'Washington Capitals',
}

function fullTeamName(abbrev: string) {
  return TEAM_NAMES[abbrev] || abbrev
}

export default function ContestPage() {
  const [names, setNames] = useState<string[]>([])
  const [games, setGames] = useState<DbGame[]>([])
  const [selectedName, setSelectedName] = useState('')
  const [picks, setPicks] = useState<Record<number, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadPage()
  }, [])

  async function loadPage() {
    await Promise.all([loadNames(), loadGames()])
  }

  async function loadNames() {
    const { data, error } = await supabase
      .from('allowed_names')
      .select('name')
      .order('name')

    if (error) {
      console.error('Error loading names:', error)
      return
    }

    setNames((data || []).map((row: { name: string }) => row.name))
  }

  async function loadGames() {
    try {
      await fetch('/api/generate-slate')

      const today = new Date().toISOString().split('T')[0]

      const { data: slate, error: slateError } = await supabase
        .from('slates')
        .select('id')
        .eq('slate_date', today)
        .single()

      if (slateError || !slate) {
        console.error('Slate load error:', slateError)
        setGames([])
        return
      }

      const { data: gameRows, error: gamesError } = await supabase
        .from('games')
        .select('id, away_team, home_team, start_time, status')
        .eq('slate_id', slate.id)
        .order('start_time', { ascending: true })

      if (gamesError) {
        console.error('Games load error:', gamesError)
        setGames([])
        return
      }

      setGames(gameRows || [])
    } catch (err) {
      console.error('Load games error:', err)
      setGames([])
    }
  }

  function isLocked(startTime: string) {
    return new Date(startTime) <= new Date()
  }

  function makePick(gameId: number, team: string, locked: boolean) {
    if (locked) return

    setPicks((prev) => ({
      ...prev,
      [gameId]: team,
    }))
  }

  async function submitPicks() {
    setMessage('')

    if (!selectedName) {
      setMessage('Please select your name first.')
      return
    }

    const pickEntries = Object.entries(picks).map(([gameId, pickedTeam]) => ({
      gameId: Number(gameId),
      pickedTeam,
    }))

    if (pickEntries.length === 0) {
      setMessage('Please make at least one pick.')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/save-picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entrantName: selectedName,
          picks: pickEntries,
        }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        setMessage(json.error || 'Unable to save picks.')
      } else {
        setMessage(`Picks saved. Saved: ${json.savedCount}, Locked skipped: ${json.lockedCount}`)
      }
    } catch (err) {
      console.error(err)
      setMessage('Something went wrong while saving picks.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', maxWidth: 900 }}>
      <h1>NHL Pick Contest</h1>

      <div style={{ marginBottom: 30 }}>
        <label htmlFor="name-select">Select Your Name</label>
        <br />
        <br />
        <select
          id="name-select"
          value={selectedName}
          onChange={(e) => setSelectedName(e.target.value)}
        >
          <option value="">Choose your name</option>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <h2>Today&apos;s Games</h2>

      {games.length === 0 ? (
        <p>No games found for today.</p>
      ) : (
        games.map((game) => {
          const locked = isLocked(game.start_time)

          return (
            <div
              key={game.id}
              style={{
                border: '1px solid #ccc',
                padding: 14,
                marginBottom: 14,
                borderRadius: 10,
              }}
            >
              <div style={{ marginBottom: 6, fontWeight: 700 }}>
                {fullTeamName(game.away_team)} @ {fullTeamName(game.home_team)}
              </div>

              <div style={{ marginBottom: 12, fontSize: 13, opacity: 0.8 }}>
                {new Date(game.start_time).toLocaleString()}
                {locked ? ' • Locked' : ' • Open'}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => makePick(game.id, game.away_team, locked)}
                  style={{
                    padding: '10px 14px',
                    cursor: locked ? 'not-allowed' : 'pointer',
                    background: picks[game.id] === game.away_team ? '#4CAF50' : '#eee',
                    opacity: locked ? 0.6 : 1,
                  }}
                >
                  {fullTeamName(game.away_team)}
                </button>

                <button
                  type="button"
                  disabled={locked}
                  onClick={() => makePick(game.id, game.home_team, locked)}
                  style={{
                    padding: '10px 14px',
                    cursor: locked ? 'not-allowed' : 'pointer',
                    background: picks[game.id] === game.home_team ? '#4CAF50' : '#eee',
                    opacity: locked ? 0.6 : 1,
                  }}
                >
                  {fullTeamName(game.home_team)}
                </button>
              </div>
            </div>
          )
        })
      )}

      <button
        type="button"
        onClick={submitPicks}
        disabled={isSubmitting}
        style={{
          marginTop: 20,
          padding: '12px 24px',
          fontSize: 16,
          cursor: isSubmitting ? 'not-allowed' : 'pointer',
        }}
      >
        {isSubmitting ? 'Saving...' : 'Submit Picks'}
      </button>

      {message && (
        <p style={{ marginTop: 16, fontWeight: 600 }}>
          {message}
        </p>
      )}
    </div>
  )
}