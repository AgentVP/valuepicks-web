'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { teamToCanonicalAbbrev } from '@/lib/nhlTeamNames'
import { getCalendarDateInEastern } from '@/lib/dateUtils'

type DbGame = {
  id: number
  away_team: string
  home_team: string
  start_time: string
  status: string | null
}

type GameOdds = { away_american: number; home_american: number }

function americanToDecimal(american: number): number {
  if (american >= 0) return american / 100 + 1
  return 1 + 100 / Math.abs(american)
}

function formatAmerican(american: number): string {
  if (american >= 0) return `+${american}`
  return `${american}`
}

const ENTRY_FEE = 5

export default function ContestPage() {
  const [names, setNames] = useState<string[]>([])
  const [games, setGames] = useState<DbGame[]>([])
  const [selectedName, setSelectedName] = useState('')
  const [picks, setPicks] = useState<Record<number, string>>({})
  const [oddsByGame, setOddsByGame] = useState<Record<string, GameOdds>>({})
  const [oddsLoaded, setOddsLoaded] = useState(false)
  const [oddsError, setOddsError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadPage()
  }, [])

  async function loadPage() {
    await Promise.all([loadNames(), loadGames(), loadOdds()])
  }

  async function loadNames() {
    const { data } = await supabase
      .from('allowed_names')
      .select('name')
      .order('name')
    setNames((data || []).map((n: { name: string }) => n.name))
  }

  async function loadGames() {
    try {
      const dateRes = await fetch('/api/contest-date', { cache: 'no-store' })
      const { date: today } = (await dateRes.json()) as { date: string }
      await fetch(`/api/generate-slate?date=${today}`, { cache: 'no-store' })
      const { data: slateRows } = await supabase
        .from('slates')
        .select('id')
        .eq('slate_date', today)
        .order('id', { ascending: false })
        .limit(1)
      const slate = slateRows?.[0] ?? null
      if (!slate) {
        setGames([])
        return
      }
      const { data: raw } = await supabase
        .from('games')
        .select('id, away_team, home_team, start_time, status')
        .eq('slate_id', slate.id)
        .order('start_time')
      const byCanonical = new Map<string, DbGame>()
      for (const g of raw || []) {
        const awayCanon = teamToCanonicalAbbrev(g.away_team)
        const homeCanon = teamToCanonicalAbbrev(g.home_team)
        const key = `${awayCanon}_${homeCanon}`
        const existing = byCanonical.get(key)
        const gIsCanonical = g.away_team === awayCanon && g.home_team === homeCanon
        const normalized = { ...g, away_team: awayCanon, home_team: homeCanon }
        if (!existing) {
          byCanonical.set(key, normalized)
        } else {
          const exIsCanonical =
            existing.away_team === teamToCanonicalAbbrev(existing.away_team) &&
            existing.home_team === teamToCanonicalAbbrev(existing.home_team)
          if (gIsCanonical && !exIsCanonical) byCanonical.set(key, normalized)
        }
      }
      const all = Array.from(byCanonical.values()).sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
      // Only show games whose Eastern calendar date is the contest date (exclude yesterday or any other date)
      const data = all.filter((g) => getCalendarDateInEastern(new Date(g.start_time)) === today)
      setGames(data)
    } catch (_) {
      setGames([])
    }
  }

  async function loadOdds() {
    setOddsLoaded(false)
    setOddsError(null)
    try {
      const res = await fetch('/api/odds')
      const json = await res.json().catch(() => ({}))
      const odds: Record<string, GameOdds> = {}
      for (const o of json.odds ?? []) {
        const key = `${o.away_team}_${o.home_team}`
        odds[key] = { away_american: o.away_american, home_american: o.home_american }
      }
      setOddsByGame(odds)
      if (json.error) setOddsError(json.error)
      else if (json.hasKey === false && Object.keys(odds).length === 0)
        setOddsError('no_key')
    } catch (_) {
      setOddsByGame({})
      setOddsError('network')
    }
    setOddsLoaded(true)
  }

  function isLocked(start: string) {
    return new Date(start) <= new Date()
  }

  function setPick(gameId: number, team: string, locked: boolean) {
    if (locked) return
    setPicks((prev) => ({ ...prev, [gameId]: team }))
  }

  async function submitPicks() {
    if (!selectedName) {
      setMessage('Select your name first')
      return
    }
    const pickEntries = Object.entries(picks).map(([gameId, pickedTeam]) => {
      const game = games.find((g) => g.id === Number(gameId))
      const key = game ? `${game.away_team}_${game.home_team}` : ''
      const odds = oddsByGame[key]
      const american =
        odds && pickedTeam === game?.away_team
          ? odds.away_american
          : odds && pickedTeam === game?.home_team
            ? odds.home_american
            : undefined
      const decimalOdds =
        american !== undefined && !Number.isNaN(american)
          ? americanToDecimal(american)
          : undefined
      return {
        gameId: Number(gameId),
        pickedTeam,
        ...(decimalOdds != null && { decimalOdds }),
      }
    })
    if (!pickEntries.length) {
      setMessage('Make at least one pick')
      return
    }
    setIsSubmitting(true)
    setMessage('')
    try {
      const res = await fetch('/api/save-picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entrantName: selectedName, picks: pickEntries }),
      })
      const json = await res.json()
      if (json.success) {
        setMessage(`Saved ${json.savedCount} picks${json.lockedCount ? ` (${json.lockedCount} locked, skipped)` : ''}`)
      } else {
        setMessage(json.error || 'Error saving picks')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  function logo(team: string) {
    const abbrev = teamToCanonicalAbbrev(team)
    return `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">NHL Pick Contest</h1>
      <p className="text-[var(--ice)]/70 text-sm mb-2">
        Pick the winner of each game. Odds are for reference and used as the tiebreaker—higher parlay odds win ties.
      </p>
      <p className="text-[var(--ice)]/90 text-sm font-medium mb-8">
        Entry fee: <span className="text-white font-semibold">${ENTRY_FEE.toFixed(2)}</span>
      </p>

      <div className="mb-8 p-4 rounded-xl bg-[var(--card)] border border-[var(--card-border)]">
        <label className="block text-sm font-medium text-[var(--ice)]/80 mb-2">
          Who are you?
        </label>
        <select
          value={selectedName}
          onChange={(e) => setSelectedName(e.target.value)}
          className="w-full max-w-xs px-4 py-3 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <option value="">Select your name</option>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        {games.map((game) => {
          const locked = isLocked(game.start_time)
          const selected = picks[game.id]
          const oddsKey = `${game.away_team}_${game.home_team}`
          const odds = oddsByGame[oddsKey]

          return (
            <div
              key={game.id}
              className={`rounded-xl border overflow-hidden transition-all duration-200 card-hover ${
                locked
                  ? 'bg-[var(--card)]/50 border-[var(--card-border)] opacity-80'
                  : 'bg-[var(--card)] border-[var(--card-border)]'
              }`}
            >
              <div className="px-4 py-2.5 text-xs text-[var(--ice)]/60 border-b border-[var(--card-border)]">
                {new Date(game.start_time).toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {locked && (
                  <span className="ml-2 text-[var(--live)] font-medium">Locked</span>
                )}
              </div>
              <div className="p-4 flex gap-3 flex-wrap items-stretch sm:items-center">
                <div className="flex gap-3 flex-1 min-w-0">
                  {[
                    { team: game.away_team, american: odds?.away_american },
                    { team: game.home_team, american: odds?.home_american },
                  ].map(({ team, american }) => {
                    const isSelected = selected === team
                    return (
                      <button
                        key={team}
                        type="button"
                        disabled={locked}
                        onClick={() => setPick(game.id, team, locked)}
                        className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 py-3 px-4 rounded-lg font-semibold transition-all min-w-0 ${
                          locked
                            ? 'cursor-not-allowed opacity-60'
                            : 'cursor-pointer'
                        } ${
                          isSelected
                            ? 'bg-[var(--accent)] text-[var(--background)] ring-2 ring-[var(--accent)]'
                            : 'bg-white/5 text-[var(--ice)] border border-[var(--card-border)] hover:bg-white/10 hover:border-[var(--accent)]/50'
                        }`}
                      >
                        <img
                          src={logo(team)}
                          alt=""
                          width={32}
                          height={32}
                          className="shrink-0"
                        />
                        <span>{team}</span>
                        {american != null && (
                          <span className="text-xs font-medium opacity-90">
                            {formatAmerican(american)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {oddsLoaded && Object.keys(oddsByGame).length === 0 && games.length > 0 && (
        <p className="text-[var(--ice)]/70 text-sm mt-2">
          {oddsError === 'no_key' && (
            <>Add <code className="bg-white/10 px-1 rounded">ODDS_API_KEY</code> to <code className="bg-white/10 px-1 rounded">.env.local</code> and restart the dev server (<code>npm run dev</code>).</>
          )}
          {oddsError === 'network' && (
            <>Odds request failed. Check the console and try again.</>
          )}
          {oddsError && oddsError !== 'no_key' && oddsError !== 'network' && (
            <>Odds: {oddsError}. Check your key at theoddsapi.com.</>
          )}
          {!oddsError && (
            <>No odds returned for today. You can still submit picks; tiebreaker will use &quot;–&quot; if tied.</>
          )}
        </p>
      )}

      <div className="mt-8 flex flex-col sm:flex-row gap-4 items-start">
        <button
          type="button"
          onClick={submitPicks}
          disabled={isSubmitting}
          className="px-6 py-3 rounded-xl bg-[var(--accent)] text-[var(--background)] font-bold text-lg hover:bg-[var(--accent-dim)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Saving…' : 'Submit Picks'}
        </button>
        {message && (
          <p className="text-[var(--ice)] font-medium mt-1 sm:mt-0">{message}</p>
        )}
      </div>
    </div>
  )
}
