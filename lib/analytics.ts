/**
 * Analytics math for the members' Analytics page (mirrors the HockeyStats Power BI report):
 * cumulative threshold tables (unders: delta <= -X, overs: delta >= +X; moneyline: EV >= X),
 * kept separately for the L10 and H/A models. Never blends the two.
 */

export type Model = 'l10' | 'ha'
export const MODELS: { key: Model; label: string }[] = [{ key: 'l10', label: 'L10' }, { key: 'ha', label: 'H/A' }]

/** One team-game, normalized from history (team_games) or the live season (model_vs_lines). */
export interface Game {
  date: string
  season: string
  source: 'history-all' | 'history-picks' | 'live'
  gameKey: string
  team: string
  homeAway: 'home' | 'away' | null
  shots: { line: number | null; actual: number | null; over: number | null; under: number | null; delta: Record<Model, number | null> }
  ml: { odds: number | null; won: boolean | null; ev: Record<Model, number | null> }
  total: { line: number | null; actual: number | null; over: number | null; under: number | null; x: Record<Model, number | null> }
  saves: { line: number | null; actual: number | null; over: number | null; under: number | null; x: Record<Model, number | null>; standIn: number | null }
  loggedSide: 'over' | 'under' | null
  loggedResult: 'win' | 'loss' | null
}

export interface ThresholdRow {
  label: string
  threshold: number
  bets: number
  wins: number
  losses: number
  pushes: number
  winPct: number | null
  confidence: number | null // Wilson 95% lower bound on win %
  units: number
  roi: number | null
  breakeven: number // average break-even win % at the prices bet (52.4% at -110)
}

export const profit = (odds: number) => (odds < 0 ? 100 / -odds : odds / 100)
export const breakeven = (odds = -110) => (odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100))

/** Wilson score lower bound (95%), as a fraction. */
export function wilsonLower(wins: number, n: number): number | null {
  if (!n) return null
  const z = 1.96, p = wins / n
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / (1 + (z * z) / n)
}

type Pick = { win: boolean | null; odds: number }

function summarize(label: string, threshold: number, picks: Pick[]): ThresholdRow {
  let wins = 0, losses = 0, pushes = 0, units = 0, be = 0
  for (const p of picks) {
    if (p.win === null) { pushes++; continue }
    be += breakeven(p.odds)
    if (p.win) { wins++; units += profit(p.odds) } else { losses++; units -= 1 }
  }
  const n = wins + losses
  return { label, threshold, bets: n, wins, losses, pushes, winPct: n ? wins / n : null, confidence: wilsonLower(wins, n), units, roi: n ? units / n : null, breakeven: n ? be / n : breakeven(-110) }
}

/** Over/under grading of one number against a line. */
export function gradeOU(actual: number | null, line: number | null, side: 'over' | 'under'): boolean | null | undefined {
  if (actual === null || line === null) return undefined
  if (actual === line) return null
  return side === 'under' ? actual < line : actual > line
}

/**
 * Cumulative thresholds for an over/under market.
 * side 'under': rows for delta <= -t (t = start..max); side 'over': delta >= +t.
 * delta(g) = model number - line. Odds default to -110 when the line has none recorded.
 */
export function ouThresholds(
  games: Game[], side: 'over' | 'under', delta: (g: Game) => number | null,
  actualLine: (g: Game) => { actual: number | null; line: number | null; odds: number | null },
  steps: number[], mode: 'cumulative' | 'bucket' = 'cumulative',
): ThresholdRow[] {
  return steps.map((t, i) => {
    const next = steps[i + 1] ?? Infinity
    const picks: Pick[] = []
    for (const g of games) {
      const d = delta(g)
      if (d === null) continue
      const mag = side === 'under' ? -d : d
      if (mag <= 0 || mag < t || (mode === 'bucket' && mag >= next)) continue
      const { actual, line, odds } = actualLine(g)
      const win = gradeOU(actual, line, side)
      if (win === undefined) continue
      picks.push({ win, odds: odds ?? -110 })
    }
    const sign = side === 'under' ? '−' : '+'
    const label = mode === 'bucket'
      ? (next === Infinity ? `${sign}${t}+` : `${sign}${t} to ${sign}${next}`)
      : (t === 0 ? (side === 'under' ? 'All unders' : 'All overs') : side === 'under' ? `≤ −${t}` : `≥ +${t}`)
    return summarize(label, t, picks)
  })
}

/** Moneyline: bet the team when model EV >= threshold. Optional favorite/underdog filter by posted odds. */
export function mlThresholds(games: Game[], model: Model, steps: number[], side: 'all' | 'favorite' | 'underdog'): ThresholdRow[] {
  return steps.map((t) => {
    const picks: Pick[] = []
    for (const g of games) {
      const ev = g.ml.ev[model], o = g.ml.odds
      if (ev === null || o === null || g.ml.won === null || ev < t / 100) continue
      if (side === 'favorite' && o >= 0) continue
      if (side === 'underdog' && o < 0) continue
      picks.push({ win: g.ml.won, odds: o })
    }
    return summarize(`EV ≥ ${t}%`, t, picks)
  })
}

/** Power BI "Goals" page: games whose projected total is >= t above (or below) the league average, and how they actually went. */
export interface GoalsRow { label: string; games: number; avgActual: number | null; pctAboveAvg: number | null; avgDelta: number | null }
export function goalsVsLeague(games: Game[], model: Model, steps: number[], side: 'high' | 'low'): { leagueAvg: number | null; rows: GoalsRow[] } {
  const seen = new Set<string>(), uniq: Game[] = []
  for (const g of games) { if (g.total.actual === null || g.total.x[model] === null || seen.has(g.gameKey)) continue; seen.add(g.gameKey); uniq.push(g) }
  if (!uniq.length) return { leagueAvg: null, rows: steps.map((t) => ({ label: label(t), games: 0, avgActual: null, pctAboveAvg: null, avgDelta: null })) }
  const leagueAvg = uniq.reduce((s, g) => s + (g.total.actual as number), 0) / uniq.length
  function label(t: number) { return side === 'high' ? `+${t} or more` : `−${t} or more` }
  return {
    leagueAvg,
    rows: steps.map((t) => {
      const sel = uniq.filter((g) => { const d = (g.total.x[model] as number) - leagueAvg; return side === 'high' ? d >= t : d <= -t })
      const n = sel.length
      return {
        label: label(t), games: n,
        avgActual: n ? sel.reduce((s, g) => s + (g.total.actual as number), 0) / n : null,
        pctAboveAvg: n ? sel.filter((g) => (g.total.actual as number) > leagueAvg).length / n : null,
        avgDelta: n ? sel.reduce((s, g) => s + ((g.total.x[model] as number) - leagueAvg), 0) / n : null,
      }
    }),
  }
}

/** Saves model accuracy (no line needed). */
export function savesAccuracy(games: Game[], model: Model) {
  const xs = games.filter((g) => g.saves.actual !== null && g.saves.x[model] !== null)
  const n = xs.length
  if (!n) return { n: 0, mae: null as number | null, bias: null as number | null }
  const errs = xs.map((g) => (g.saves.x[model] as number) - (g.saves.actual as number))
  return { n, mae: errs.reduce((s, e) => s + Math.abs(e), 0) / n, bias: errs.reduce((s, e) => s + e, 0) / n }
}

// ---------------- normalization ----------------
type Raw = Record<string, unknown>
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))
const bool = (v: unknown): boolean | null => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null)
const seasonOf = (date: string) => { const [y, m] = date.split('-').map(Number); const s = m >= 7 ? y : y - 1; return `${s}-${String(s + 1).slice(2)}` }

/** History rows (team_games): the old Excel model. ML / totals / saves came from the workbook's xG, filed under H/A. */
export function fromHistory(rows: Raw[]): Game[] {
  const byGame = new Map<string, Raw[]>()
  for (const r of rows) { const k = String(r.game_key ?? ''); if (k) { if (!byGame.has(k)) byGame.set(k, []); byGame.get(k)!.push(r) } }
  return rows.filter((r) => r.game_date).map((r) => {
    const key = String(r.game_key ?? `${r.game_date}_${r.team}`)
    const opp = (byGame.get(String(r.game_key ?? '')) || []).find((o) => o !== r)
    const oppLine = opp ? num(opp.shot_line) : null
    const xTotal = num(r.x_game_total_goals)
    return {
      date: String(r.game_date), season: String(r.season ?? seasonOf(String(r.game_date))),
      source: r.source === 'Goal Tracking' ? 'history-all' : 'history-picks',
      gameKey: key, team: String(r.team ?? ''),
      homeAway: r.home_away === 'home' || r.home_away === 'away' ? (r.home_away as 'home' | 'away') : null,
      shots: { line: num(r.shot_line), actual: num(r.actual_shots), over: null, under: null, delta: { l10: num(r.l10_delta), ha: num(r.ha_delta) } },
      ml: { odds: num(r.ml_odds), won: bool(r.ml_won), ev: { l10: null, ha: num(r.ml_ev) } },
      total: { line: num(r.ou_goals_line), actual: null, over: num(r.ou_goals_odds), under: num(r.ou_goals_odds), x: { l10: null, ha: xTotal } },
      saves: { line: null, actual: num(r.actual_saves), over: null, under: null, x: { l10: null, ha: num(r.x_saves) },
               standIn: oppLine === null ? null : Math.floor(oppLine * 0.874) + 0.5 },
      loggedSide: r.logged_pick_side === 'over' || r.logged_pick_side === 'under' ? (r.logged_pick_side as 'over' | 'under') : null,
      loggedResult: r.logged_pick_result === 'win' || r.logged_pick_result === 'loss' ? (r.logged_pick_result as 'win' | 'loss') : null,
    }
  })
}

/** Live-season rows (model_vs_lines): both models for every market. */
export function fromLive(rows: Raw[]): Game[] {
  const byGame = new Map<string, Raw[]>()
  for (const r of rows) { const k = String(r.game_id); if (!byGame.has(k)) byGame.set(k, []); byGame.get(k)!.push(r) }
  return rows.map((r) => {
    const opp = (byGame.get(String(r.game_id)) || []).find((o) => o !== r)
    const oppLine = opp ? num(opp.shots_line) : null
    return {
      date: String(r.game_date), season: seasonOf(String(r.game_date)), source: 'live',
      gameKey: String(r.game_id), team: String(r.team_name ?? r.team ?? ''),
      homeAway: r.home_away === 'home' || r.home_away === 'away' ? (r.home_away as 'home' | 'away') : null,
      shots: { line: num(r.shots_line), actual: num(r.actual_shots), over: num(r.shots_over_odds), under: num(r.shots_under_odds),
               delta: { l10: num(r.shots_delta_l10), ha: num(r.shots_delta_ha) } },
      ml: { odds: num(r.ml_odds), won: bool(r.won), ev: { l10: num(r.ml_ev_l10), ha: num(r.ml_ev_ha) } },
      total: { line: num(r.game_total), actual: num(r.actual_game_goals), over: num(r.game_total_over_odds), under: num(r.game_total_under_odds),
               x: { l10: num(r.x_game_total_l10), ha: num(r.x_game_total_ha) } },
      saves: { line: num(r.saves_line), actual: num(r.actual_saves), over: num(r.saves_over_odds), under: num(r.saves_under_odds),
               x: { l10: num(r.x_saves_l10), ha: num(r.x_saves_ha) }, standIn: oppLine === null ? null : Math.floor(oppLine * 0.874) + 0.5 },
      loggedSide: null, loggedResult: null,
    }
  })
}

/** History totals: actual game goals = this team's goals + the opponent row's goals (same game_key). */
export function fillHistoryTotals(games: Game[], raw: Raw[]): Game[] {
  const goals = new Map<string, number[]>()
  for (const r of raw) { const k = String(r.game_key ?? ''); const gf = num(r.actual_goals); if (k && gf !== null) { if (!goals.has(k)) goals.set(k, []); goals.get(k)!.push(gf) } }
  return games.map((g) => {
    if (g.source === 'live') return g
    const gl = goals.get(g.gameKey)
    return gl && gl.length === 2 ? { ...g, total: { ...g.total, actual: gl[0] + gl[1] } } : g
  })
}

/** Moneyline by price: how big a favorite / underdog the team was at the posted odds. */
export const FAV_BUCKETS: [number, number][] = [[-120, -100], [-140, -121], [-160, -141], [-200, -161], [-250, -201], [-10000, -251]]
export const DOG_BUCKETS: [number, number][] = [[100, 120], [121, 140], [141, 160], [161, 200], [201, 250], [251, 10000]]
export function priceLabel([lo, hi]: [number, number]): string {
  if (lo <= -10000) return `${hi} or shorter`
  if (hi >= 10000) return `+${lo} or longer`
  return lo < 0 ? `${hi} to ${lo}` : `+${lo} to +${hi}`
}
/** minEv: null = every team (no model filter), otherwise only teams the model rated at EV >= minEv %. */
export function mlPriceBuckets(games: Game[], model: Model, minEv: number | null, side: 'favorite' | 'underdog'): ThresholdRow[] {
  const buckets = side === 'favorite' ? FAV_BUCKETS : DOG_BUCKETS
  return buckets.map((b, i) => {
    const [lo, hi] = b
    const picks: Pick[] = []
    for (const g of games) {
      const o = g.ml.odds, ev = g.ml.ev[model]
      if (o === null || g.ml.won === null || o < lo || o > hi) continue
      if (minEv !== null && (ev === null || ev < minEv / 100)) continue
      picks.push({ win: g.ml.won, odds: o })
    }
    return summarize(priceLabel(b), i, picks)
  })
}
