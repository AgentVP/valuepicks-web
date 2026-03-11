import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mapOddsEventToAbbrevs } from '@/lib/nhlTeamNames'
import { getLocalDateString } from '@/lib/dateUtils'

const __dirname = typeof fileURLToPath !== 'undefined' ? dirname(fileURLToPath(import.meta.url)) : ''

type OddsOutcome = { name: string; price: number }
type OddsMarket = { key: string; outcomes: OddsOutcome[] }
type Bookmaker = { key: string; markets: OddsMarket[] }
type OddsEvent = { away_team: string; home_team: string; bookmakers: Bookmaker[] }

export type GameOdds = {
  away_team: string
  home_team: string
  away_american: number
  home_american: number
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/** Fallback: read ODDS_API_KEY from .env.local if Next.js didn't load it (e.g. Turbopack quirk). */
function getOddsApiKey(): string | undefined {
  const fromEnv = process.env.ODDS_API_KEY
  if (fromEnv?.trim()) return fromEnv.trim()
  const candidates = [
    join(process.cwd(), '.env.local'),
    ...(__dirname ? [join(__dirname, '..', '..', '..', '.env.local')] : []),
    join(process.cwd(), 'valuepicks-web', '.env.local'),
  ]
  for (const envPath of candidates) {
    try {
      if (!existsSync(envPath)) continue
      const content = readFileSync(envPath, 'utf8')
      const line = content.split(/\r?\n/).find((l) => l.startsWith('ODDS_API_KEY='))
      if (!line) continue
      const value = line.slice('ODDS_API_KEY='.length).trim().replace(/^["']|["']$/g, '')
      if (value) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[odds] Key loaded from .env.local at', envPath)
        }
        return value
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[odds] Failed to read', envPath, String(e))
      }
      continue
    }
  }
  if (process.env.NODE_ENV === 'development') {
    console.log('[odds] No key found. Tried:', candidates.filter((p) => existsSync(p)))
  }
  return undefined
}

function oddsKey(o: GameOdds): string {
  return `${o.away_team}_${o.home_team}`
}

export async function GET() {
  const apiKey = getOddsApiKey()
  const today = getLocalDateString()

  const supabase = getSupabase()
  let odds: GameOdds[] = []
  let source = ''

  // 1) Prefer sportsbook_lines for today's slate; fill any missing games from cache/API.
  if (supabase) {
    try {
      const { data: slate, error: slateError } = await supabase
        .from('slates')
        .select('id')
        .eq('slate_date', today)
        .maybeSingle()

      if (!slateError && slate) {
        const { data: games, error: gamesError } = await supabase
          .from('games')
          .select('id, away_team, home_team')
          .eq('slate_id', slate.id)

        if (!gamesError && games && games.length > 0) {
          const gameIds = games.map((g) => String(g.id))
          const { data: lines, error: linesError } = await supabase
            .from('sportsbook_lines')
            .select('game_id, team, odds, captured_at, market')
            .in('game_id', gameIds)
            .eq('market', 'moneyline')
            .order('captured_at', { ascending: false })

          if (!linesError && lines && lines.length > 0) {
            const byGame: Record<string, { away?: number; home?: number }> = {}
            for (const l of lines) {
              const gid = String(Number((l as any).game_id))
              if (!byGame[gid]) byGame[gid] = {}
              const game = games.find((g) => String(Number(g.id)) === gid)
              if (!game) continue
              if (l.team === game.away_team && byGame[gid].away == null) byGame[gid].away = Number(l.odds)
              if (l.team === game.home_team && byGame[gid].home == null) byGame[gid].home = Number(l.odds)
            }
            for (const g of games) {
              const gid = String(Number(g.id))
              const got = byGame[gid]
              if (got?.away != null && got?.home != null) {
                odds.push({
                  away_team: g.away_team,
                  home_team: g.home_team,
                  away_american: got.away,
                  home_american: got.home,
                })
              }
            }
            source = 'Supabase sportsbook_lines'
          }
        }

        // 2) Fill missing games from odds_cache or live API so every slate game can show odds (e.g. TOR/MTL).
        if (games && games.length > 0) {
          const haveKeys = new Set(odds.map(oddsKey))
          const missingGames = games.filter((g) => !haveKeys.has(`${g.away_team}_${g.home_team}`))
          if (missingGames.length > 0) {
          let fallback: GameOdds[] = []
          const { data: cached } = await supabase
            .from('odds_cache')
            .select('data')
            .eq('cache_date', today)
            .maybeSingle()
          if (cached?.data && Array.isArray(cached.data)) fallback = cached.data as GameOdds[]
          if (fallback.length === 0 && apiKey) {
            try {
              const res = await fetch(
                `https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=${apiKey}`,
                { cache: 'no-store' }
              )
              if (res.ok) {
                const events: OddsEvent[] = await res.json()
                for (const ev of events) {
                  const abbrevs = mapOddsEventToAbbrevs(ev.away_team, ev.home_team)
                  if (!abbrevs) continue
                  const book = ev.bookmakers?.[0]
                  const market = book?.markets?.find((m) => m.key === 'h2h')
                  const outcomes = market?.outcomes ?? []
                  if (outcomes.length < 2) continue
                  const awayOut = outcomes.find((o) => o.name === ev.away_team)
                  const homeOut = outcomes.find((o) => o.name === ev.home_team)
                  if (awayOut != null && homeOut != null) {
                    fallback.push({
                      away_team: abbrevs.away,
                      home_team: abbrevs.home,
                      away_american: awayOut.price,
                      home_american: homeOut.price,
                    })
                  }
                }
                if (fallback.length > 0 && supabase) {
                  await supabase
                    .from('odds_cache')
                    .upsert(
                      { cache_date: today, data: fallback, updated_at: new Date().toISOString() },
                      { onConflict: 'cache_date' }
                    )
                }
              }
            } catch (_) {}
          }
          for (const o of fallback) {
            const key = oddsKey(o)
            if (haveKeys.has(key)) continue
            haveKeys.add(key)
            odds.push(o)
          }
          if (source && fallback.length > 0) source = source + ' + fallback'
          else if (fallback.length > 0) source = 'The Odds API (cached)'
          }
        }

        if (odds.length > 0) {
          return Response.json({ odds, source: source || 'Supabase sportsbook_lines', hasKey: true })
        }
      }
    } catch (e) {
      console.log('[odds] Failed to read sportsbook_lines', String(e))
    }
  }

  // 3) No slate or no games: use cache or live API only.
  if (supabase) {
    const { data: cached, error: cacheError } = await supabase
      .from('odds_cache')
      .select('data')
      .eq('cache_date', today)
      .maybeSingle()

    if (!cacheError && cached?.data && Array.isArray(cached.data) && (cached.data as GameOdds[]).length > 0) {
      return Response.json({ odds: cached.data, source: 'The Odds API (cached)', hasKey: true })
    }
  }

  if (!apiKey) {
    console.log('[odds] ODDS_API_KEY not set. Ensure .env.local has ODDS_API_KEY=... in the project root and restart dev server.')
    return Response.json({ odds: [], source: null, hasKey: false })
  }

  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=${apiKey}`,
      { cache: 'no-store' }
    )
    if (!res.ok) {
      const text = await res.text()
      console.error('Odds API error', res.status, text)
      const errorMessage = res.status === 401 ? 'Invalid API key' : res.status === 429 ? 'Rate limit (500/month on free tier)' : `Odds API error ${res.status}`
      return Response.json({ odds: [], source: null, hasKey: true, error: errorMessage })
    }

    const events: OddsEvent[] = await res.json()
    const out: GameOdds[] = []

    for (const ev of events) {
      const abbrevs = mapOddsEventToAbbrevs(ev.away_team, ev.home_team)
      if (!abbrevs) continue

      const book = ev.bookmakers?.[0]
      const market = book?.markets?.find((m) => m.key === 'h2h')
      const outcomes = market?.outcomes ?? []
      if (outcomes.length < 2) continue

      const awayOut = outcomes.find((o) => o.name === ev.away_team)
      const homeOut = outcomes.find((o) => o.name === ev.home_team)
      if (awayOut == null || homeOut == null) continue

      out.push({
        away_team: abbrevs.away,
        home_team: abbrevs.home,
        away_american: awayOut.price,
        home_american: homeOut.price,
      })
    }

    if (supabase && out.length > 0) {
      await supabase
        .from('odds_cache')
        .upsert(
          { cache_date: today, data: out, updated_at: new Date().toISOString() },
          { onConflict: 'cache_date' }
        )
    }

    return Response.json({ odds: out, source: 'The Odds API', hasKey: true })
  } catch (err) {
    console.error(err)
    return Response.json({ odds: [], source: null, hasKey: true, error: 'Network or server error' })
  }
}
