'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { getLeaderboardDisplayDate, getLocalDateString } from '@/lib/dateUtils'
import { teamToCanonicalAbbrev } from '@/lib/nhlTeamNames'

type Game = {
  id: number
  nhl_game_id?: number | null
  away_team: string
  home_team: string
  start_time: string
  away_score: number | null
  home_score: number | null
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
  result: boolean | null
  decimal_odds: number | null
  games: PickGame[]
  computed_result?: boolean | null
  live_status?: 'winning' | 'losing' | 'tied' | null
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
  const product = withOdds.reduce((acc, p) => acc * (p.decimal_odds ?? 1), 1)
  return Math.round(product * 100) / 100
}

function decimalParlayToAmerican(multiplier: number): number {
  // multiplier is decimal odds for full parlay, > 1
  if (multiplier >= 2) {
    return Math.round((multiplier - 1) * 100)
  }
  return Math.round(-100 / (multiplier - 1))
}

/** Always show parlay in American odds (e.g. +3500, +126,340). Never show decimal or "x" format. */
function formatParlay(m: number | null): string {
  if (m == null || typeof m !== 'number') return '–'
  const american = decimalParlayToAmerican(m)
  const str = String(Math.abs(american))
  const withCommas = str.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return american >= 0 ? `+${withCommas}` : `-${withCommas}`
}

/** Single source of truth for leaderboard parlay display: always American odds string. */
function parlayDisplay(picks: Pick[]): string {
  const m = parlayMultiplier(picks)
  return formatParlay(m)
}

function formatSinglePickAmerican(decimal: number | null | undefined): string {
  if (decimal == null) return ''
  const american = decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1))
  return american >= 0 ? `+${american}` : `${american}`
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [potInfo, setPotInfo] = useState<{ entryCount: number; pot: number; perWinner: number } | null>(null)
  const [slateDate, setSlateDate] = useState<string | null>(null)
  const [contestToday, setContestToday] = useState<string | null>(null)

  useEffect(() => {
    loadBoard()
    const interval = setInterval(loadBoard, 30000)
    return () => clearInterval(interval)
  }, [])

  function computedResult(p: Pick): boolean | null {
    if (typeof p.computed_result === 'boolean') return p.computed_result
    const g = p.games?.[0]
    const winner = g?.winner_team
    if (!winner) return null
    return teamToCanonicalAbbrev(p.picked_team) === teamToCanonicalAbbrev(winner)
  }

  async function loadBoard() {
    // Server clock matches /api/contest-date; leaderboard = yesterday until 2pm ET.
    let primaryDate: string
    let today: string
    try {
      const ctxRes = await fetch('/api/leaderboard-context', { cache: 'no-store' })
      const ctx = (await ctxRes.json()) as { contestDate?: string; leaderboardDate?: string }
      primaryDate = ctx.leaderboardDate ?? ''
      today = ctx.contestDate ?? ''
      if (!primaryDate || !today) throw new Error('leaderboard-context')
    } catch {
      primaryDate = getLeaderboardDisplayDate()
      today = getLocalDateString()
    }
    setContestToday(today)

    try {
      let res = await fetch(`/api/leaderboard?date=${encodeURIComponent(primaryDate)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Leaderboard API error ${res.status}`)
      let json = await res.json()
      let rawGames: Game[] = json.games || []
      let rawEntries: Entry[] = json.entries || []
      let rawPot = json.potInfo ?? null
      let effectiveDate = primaryDate

      if (rawEntries.length === 0 && rawGames.length === 0 && primaryDate !== today) {
        res = await fetch(`/api/leaderboard?date=${encodeURIComponent(today)}`, { cache: 'no-store' })
        if (res.ok) {
          json = await res.json()
          rawGames = json.games || []
          rawEntries = json.entries || []
          rawPot = json.potInfo ?? null
          effectiveDate = today
        }
      }

      const byCanonical = new Map<string, Game>()
      for (const g of rawGames) {
        const awayCanon = teamToCanonicalAbbrev(g.away_team)
        const homeCanon = teamToCanonicalAbbrev(g.home_team)
        const key = `${awayCanon}_${homeCanon}`
        const existing = byCanonical.get(key)
        const normalized = { ...g, away_team: awayCanon, home_team: homeCanon }
        if (!existing) {
          byCanonical.set(key, normalized)
        } else {
          const exIsCanonical = existing.away_team === teamToCanonicalAbbrev(existing.away_team) && existing.home_team === teamToCanonicalAbbrev(existing.home_team)
          if (g.away_team === awayCanon && g.home_team === homeCanon && !exIsCanonical) byCanonical.set(key, normalized)
          else if (!existing.nhl_game_id && g.nhl_game_id) byCanonical.set(key, normalized)
        }
      }
      const deduped = Array.from(byCanonical.values()).sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )

      setGames(deduped)
      setEntries(rawEntries)
      setPotInfo(rawPot)
      setSlateDate(effectiveDate)
    } catch (e) {
      console.error(e)
      setGames([])
      setEntries([])
      setPotInfo(null)
      setSlateDate(null)
    }
  }

  function record(picks: Pick[]) {
    const w = picks.filter((p) => computedResult(p) === true).length
    const l = picks.filter((p) => computedResult(p) === false).length
    return `${w}-${l}`
  }

  function logo(team: string) {
    const abbrev = teamToCanonicalAbbrev(team)
    return `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`
  }

  /**
   * Pick box color, same as the History page: solid green = won, solid red = lost.
   * While a game is live: light green = that team is leading, light red = trailing, ice = tied.
   * Colors are inline so they never depend on which utility classes a build keeps.
   */
  function boxStyle(p: Pick): CSSProperties {
    const r = computedResult(p)
    if (r === true) return { background: 'var(--win)' }
    if (r === false) return { background: 'var(--loss)' }
    const live = pickLiveStatus(p)
    if (live === 'winning') return { background: 'color-mix(in srgb, var(--win) 40%, transparent)', boxShadow: 'inset 0 0 0 1px var(--win)' }
    if (live === 'losing') return { background: 'color-mix(in srgb, var(--loss) 40%, transparent)', boxShadow: 'inset 0 0 0 1px var(--loss)' }
    if (live === 'tied') return { background: 'color-mix(in srgb, var(--ice) 25%, transparent)' }
    return { background: 'var(--card-border)' }
  }

  function pickForGame(entry: Entry, game: Game) {
    return entry.picks.find(
      (p) => p.game_id === game.id || game.alternateGameIds?.includes(p.game_id)
    )
  }

  function pickLiveStatus(p: Pick): 'winning' | 'losing' | 'tied' | null {
    if (computedResult(p) !== null) return null
    return p.live_status ?? null
  }

  const isToday = contestToday != null && slateDate === contestToday

  /** Eastern-time clock: is this slate past 10pm ET (or an earlier day)? */
  const etNow = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
    const get = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
  }
  /**
   * Fun badges (display only; scoring is unchanged):
   * - allFavorites: every pick was the favorite at the price entered (odds shorter than even money).
   * - hit: picked every game and won them all, every game final -> PARLAY HIT.
   * - watch: picked every game, no losses yet, at least one win, after 10pm ET -> PARLAY WATCH (ends with the first loss).
   */
  function badges(entry: Entry) {
    const picked = games.filter((g) => pickForGame(entry, g))
    const pickedAll = games.length > 0 && picked.length === games.length
    const results = entry.picks.map(computedResult)
    const wins = results.filter((r) => r === true).length
    const losses = results.filter((r) => r === false).length
    const withOdds = entry.picks.filter((p) => p.decimal_odds != null && p.decimal_odds > 0)
    const allFavorites = entry.picks.length > 0 && withOdds.length === entry.picks.length && withOdds.every((p) => (p.decimal_odds as number) < 2)
    const hit = pickedAll && losses === 0 && wins === games.length
    const now = etNow()
    const late = slateDate != null && (slateDate < now.date || (slateDate === now.date && now.hour >= 22))
    const watch = !hit && pickedAll && losses === 0 && wins > 0 && late
    return { allFavorites, hit, watch }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">Leaderboard</h1>
      {slateDate && !isToday && (
        <p className="text-[var(--accent)]/90 text-sm font-medium mb-2">
          Showing results for {slateDate}
        </p>
      )}
      <p className="text-[var(--ice)]/70 text-sm mb-2">
        Ties broken by parlay odds (higher = better). Add odds when you submit picks to use the tiebreaker.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ice)]/70 mb-3">
        <span className="font-medium">Legend:</span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[var(--win)] border border-white/10" />
          Win
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[var(--loss)] border border-white/10" />
          Loss
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm border border-white/10" style={{ background: 'color-mix(in srgb, var(--win) 40%, transparent)' }} />
          Currently winning
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm border border-white/10" style={{ background: 'color-mix(in srgb, var(--loss) 40%, transparent)' }} />
          Currently losing
        </span>
      </div>
      <p className="text-[var(--ice)]/90 text-sm font-medium mb-4">
        Entry fee: <span className="text-white font-semibold">${ENTRY_FEE.toFixed(2)}</span>
      </p>
      {potInfo && (
        <div className="mb-4 text-sm text-[var(--ice)]/80">
          <div>
            <span className="font-semibold text-white">${ENTRY_FEE.toFixed(2)}</span> entry fee ·{' '}
            <span className="font-semibold text-white">{potInfo.entryCount}</span> entries
          </div>
          <div>
            Pot: <span className="font-semibold text-[var(--accent)]">${potInfo.pot.toFixed(2)}</span>{' '}
            · Winner payout:{' '}
            <span className="font-semibold text-[var(--accent)]">
              ${potInfo.perWinner.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {entries.map((entry, rank) => { const bd = badges(entry); return (
          <div
            key={entry.entrant_name}
            className={`relative overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 card-hover${bd.hit ? ' vp-hit' : bd.allFavorites ? ' vp-rainbow' : ''}${bd.watch ? ' vp-watch' : ''}`}
            title={bd.allFavorites ? 'Picked every favorite' : undefined}
          >
            {bd.hit && (
              <div className="vp-fireworks" aria-hidden="true">
                {['🎆', '💵', '🎇', '💲', '🎆', '💰', '🎇', '💵', '💲', '🎆', '💰', '🎇'].map((e, i) => <span key={i} style={{ ['--i' as string]: i, left: `${4 + i * 8}%`, top: `${10 + ((i * 37) % 70)}%` }}>{e}</span>)}
              </div>
            )}
            {(bd.hit || bd.watch) && (
              <div className={`relative z-[1] mb-3 flex items-center justify-center gap-2 rounded-lg py-1.5 font-black tracking-[0.2em] text-sm ${bd.hit ? 'vp-hit-banner' : 'vp-watch-banner'}`}>
                {bd.hit ? <>💰 PARLAY HIT 💰</> : <><span className="vp-watch-eyes">👀</span> PARLAY WATCH <span className="vp-watch-eyes">🚨</span></>}
              </div>
            )}
            <div className="relative z-[1] flex flex-wrap items-center justify-between gap-3 mb-3">
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
                  title={`Place: ${rank + 1}`}
                >
                  {rank + 1}
                </span>
                <span className="font-bold text-lg text-white">
                  {entry.entrant_name}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className="font-mono font-bold text-[var(--accent)] text-lg"
                  title="Wins–Losses"
                >
                  {record(entry.picks)}
                </span>
                <span
                  className="text-sm text-[var(--ice)]/70"
                  title="Parlay tiebreaker in American odds (higher wins ties)"
                >
                  {parlayDisplay(entry.picks)} parlay
                </span>
              </div>
            </div>
            <div className="relative z-[1] flex flex-wrap gap-1.5">
              {games.map((game) => {
                const pick = pickForGame(entry, game)
                if (!pick) {
                  return (
                    <div
                      key={game.id}
                      className="w-8 h-8 rounded-lg bg-[var(--card-border)] shrink-0"
                      title={`No pick · ${game.away_team} @ ${game.home_team}`}
                    />
                  )
                }
                const liveStatus = pickLiveStatus(pick)
                const titleParts = [pick.picked_team]
                if (pick.decimal_odds != null) titleParts.push(`(${formatSinglePickAmerican(pick.decimal_odds)})`)
                const r = computedResult(pick)
                if (r === true) titleParts.push('· Won')
                if (r === false) titleParts.push('· Lost')
                if (liveStatus === 'winning') titleParts.push('· Currently winning')
                if (liveStatus === 'losing') titleParts.push('· Currently losing')
                if (liveStatus === 'tied') titleParts.push('· Tied')
                return (
                  <div
                    key={game.id}
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={boxStyle(pick)}
                    title={titleParts.join(' ')}
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
        ) })}
      </div>
    </div>
  )
}
