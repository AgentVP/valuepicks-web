import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mapOddsEventToAbbrevs } from '@/lib/nhlTeamNames'

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

export async function GET() {
  const apiKey = getOddsApiKey()
  const today = new Date().toISOString().split('T')[0]

  const supabase = getSupabase()
  if (supabase) {
    const { data: cached, error: cacheError } = await supabase
      .from('odds_cache')
      .select('data')
      .eq('cache_date', today)
      .maybeSingle()

    if (!cacheError && cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
      return Response.json({ odds: cached.data, source: 'The Odds API (cached)', hasKey: true })
    }
    // If cacheError (e.g. table missing), fall through to API
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
    const odds: GameOdds[] = []

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

      odds.push({
        away_team: abbrevs.away,
        home_team: abbrevs.home,
        away_american: awayOut.price,
        home_american: homeOut.price,
      })
    }

    if (supabase && odds.length > 0) {
      await supabase
        .from('odds_cache')
        .upsert(
          { cache_date: today, data: odds, updated_at: new Date().toISOString() },
          { onConflict: 'cache_date' }
        )
      // Ignore upsert error (e.g. table not created yet)
    }

    return Response.json({ odds, source: 'The Odds API', hasKey: true })
  } catch (err) {
    console.error(err)
    return Response.json({ odds: [], source: null, hasKey: true, error: 'Network or server error' })
  }
}
