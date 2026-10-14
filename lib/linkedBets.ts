/**
 * Bucket plays: when a team's xShot delta lands in a profitable shot bucket, which OTHER bets win too?
 *
 * For every graded team-game (oldest first) each shot model (H/A, L10 — never blended) is checked against its
 * bucket, using ONLY games graded before that date (walk-forward, no hindsight). When the bucket qualifies
 * (win % >= threshold with enough bets), the linked bets are graded in the same direction:
 *   shots        this team's shots, same side
 *   opp_saves    the OPPONENT goalie's saves, same side (more shots on him = more saves)
 *   moneyline    over -> this team's ML; under -> the opponent's ML
 *   team_goals   this team's goals, same side
 *   game_total   the game total, same side
 * Saves use the posted saves line when there is one, otherwise an estimate: floor(shot line x 0.874) + 0.5 at -110 (0.874 = league starter saves per team shot against, which is also how Bovada sets saves lines on average).
 */
import { bandOf, type BucketStats } from './shotBuckets'

export type ShotModel = 'ha' | 'l10'
export type Side = 'over' | 'under'
export type Market = 'shots' | 'opp_saves' | 'moneyline' | 'team_goals' | 'game_total'
export const MARKETS: { key: Market; label: string }[] = [
  { key: 'shots', label: 'Shots (the signal)' },
  { key: 'opp_saves', label: 'Opp goalie saves' },
  { key: 'moneyline', label: 'Moneyline' },
  { key: 'team_goals', label: 'Team goals' },
  { key: 'game_total', label: 'Game total' },
]
export type PlayModel = ShotModel | 'both'
export const PLAY_MODELS: { key: PlayModel; label: string }[] = [{ key: 'ha', label: 'H/A' }, { key: 'l10', label: 'L10' }, { key: 'both', label: 'Both models' }]

type OU = { line: number | null; actual: number | null; over: number | null; under: number | null }
/** One team's side of one game. Deltas are the original-formula (bucket) deltas. */
export interface TeamGame {
  date: string
  gameKey: string
  team: string
  homeAway: 'home' | 'away' | null
  live: boolean
  delta: Record<ShotModel, number | null>
  shots: OU
  saves: OU            // this team's goalie
  goals: OU
  total: OU
  ml: { odds: number | null; won: boolean | null }
}

export interface Tally { w: number; l: number; p: number; u: number; est: number }
const blank = (): Tally => ({ w: 0, l: 0, p: 0, u: 0, est: 0 })
export const profit = (o: number) => (o < 0 ? 100 / -o : o / 100)
export const estSavesLine = (oppShotLine: number | null) => (oppShotLine === null ? null : Math.floor(oppShotLine * 0.874) + 0.5)

export interface BucketRule { minPct: number; minN: number }   // minPct as a fraction (0.55)
export const bucketKey = (m: ShotModel, d: number) => `${m}|${d < 0 ? 'under' : 'over'}|${bandOf(d)}`
export function qualifies(stats: BucketStats, m: ShotModel, d: number | null, rule: BucketRule) {
  if (d === null || d === 0) return false
  const s = stats[bucketKey(m, d)]; if (!s) return false
  const n = s.w + s.l
  return n >= rule.minN && n > 0 && s.w / n >= rule.minPct
}

function gradeOU(o: OU, side: Side, lineOverride?: number | null): { win: boolean | null; odds: number } | undefined {
  const line = lineOverride ?? o.line
  if (o.actual === null || line === null) return undefined
  const odds = (lineOverride != null && o.line === null ? null : side === 'over' ? o.over : o.under) ?? -110
  return { win: o.actual === line ? null : side === 'over' ? o.actual > line : o.actual < line, odds }
}

/** Grade every linked bet for team t betting `side` on its shots. */
export function linkedGrades(t: TeamGame, opp: TeamGame | undefined, side: Side) {
  const out: Partial<Record<Market, { win: boolean | null; odds: number; est?: boolean }>> = {}
  const s = gradeOU(t.shots, side); if (s) out.shots = s
  if (opp) {
    const est = opp.saves.line === null
    const g = gradeOU(opp.saves, side, est ? estSavesLine(t.shots.line) : null); if (g) out.opp_saves = { ...g, est }
    const ml = side === 'over' ? t.ml : opp.ml
    if (ml.odds !== null && ml.won !== null) out.moneyline = { win: ml.won, odds: ml.odds }
  }
  const tg = gradeOU(t.goals, side); if (tg) out.team_goals = tg
  const gt = gradeOU(t.total, side); if (gt) out.game_total = gt
  return out
}

export interface BucketPlayReport {
  summary: Record<PlayModel, Record<Market, Tally>>
  /** every non-zero delta, by model / side / whole-shot band (0-1 … 4+), qualifying or not */
  bands: Record<string, Record<Market, Tally>>
  plays: number
}
export const wholeBand = (d: number) => Math.min(4, Math.floor(Math.abs(d)))
export const wholeBandLabel = (side: Side, b: number) => `${side === 'under' ? '−' : '+'}${b}${b === 4 ? '+' : `–${b + 1}`}`

/**
 * Walk forward through all team-games. `seedOnly` games (older history without bet data) only feed the buckets.
 * include(t): which graded games to report on (e.g. only this season). Buckets always learn from everything earlier.
 */
export function bucketPlays(games: TeamGame[], rule: BucketRule, include: (t: TeamGame) => boolean = () => true): BucketPlayReport {
  const summary = Object.fromEntries(PLAY_MODELS.map((m) => [m.key, Object.fromEntries(MARKETS.map((k) => [k.key, blank()]))])) as BucketPlayReport['summary']
  const bands: BucketPlayReport['bands'] = {}
  const byGame = new Map<string, TeamGame[]>()
  for (const g of games) { if (!byGame.has(g.gameKey)) byGame.set(g.gameKey, []); byGame.get(g.gameKey)!.push(g) }
  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date))
  const stats: BucketStats = {}
  let plays = 0
  const add = (t: Tally, r: { win: boolean | null; odds: number; est?: boolean }) => {
    if (r.est) t.est++
    if (r.win === null) { t.p++; return }
    if (r.win) { t.w++; t.u += profit(r.odds) } else { t.l++; t.u -= 1 }
  }
  for (let i = 0; i < sorted.length;) {
    const day = sorted[i].date, todays: TeamGame[] = []
    while (i < sorted.length && sorted[i].date === day) todays.push(sorted[i++])
    // 1) grade today's games against buckets built from earlier days
    for (const t of todays) {
      if (!include(t)) continue
      const opp = (byGame.get(t.gameKey) || []).find((o) => o !== t)
      const q: Partial<Record<ShotModel, Side>> = {}
      for (const m of ['ha', 'l10'] as const) {
        const d = t.delta[m]
        if (d === null || d === 0) continue
        const side: Side = d < 0 ? 'under' : 'over'
        const grades = linkedGrades(t, opp, side)
        const bk = `${m}|${side}|${wholeBand(d)}`
        const row = bands[bk] || (bands[bk] = Object.fromEntries(MARKETS.map((k) => [k.key, blank()])) as Record<Market, Tally>)
        for (const k of MARKETS) { const r = grades[k.key]; if (r) add(row[k.key], r) }
        if (qualifies(stats, m, d, rule)) {
          q[m] = side
          for (const k of MARKETS) { const r = grades[k.key]; if (r) add(summary[m][k.key], r) }
        }
      }
      if (q.ha && q.ha === q.l10) {
        const grades = linkedGrades(t, opp, q.ha)
        for (const k of MARKETS) { const r = grades[k.key]; if (r) add(summary.both[k.key], r) }
      }
      if (q.ha || q.l10) plays++
    }
    // 2) then let today's results into the buckets
    for (const t of todays) {
      const { line, actual } = t.shots
      if (line === null || actual === null || actual === line) continue
      for (const m of ['ha', 'l10'] as const) {
        const d = t.delta[m]; if (d === null || d === 0) continue
        const k = bucketKey(m, d), b = stats[k] || (stats[k] = { w: 0, l: 0 })
        if (d < 0 ? actual < line : actual > line) b.w++; else b.l++
      }
    }
  }
  return { summary, bands, plays }
}

// ---------------- normalizers ----------------
type Raw = Record<string, unknown>
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))
const bool = (v: unknown): boolean | null => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null)
const ha = (v: unknown) => (v === 'home' || v === 'away' ? v : null)
const NO: OU = { line: null, actual: null, over: null, under: null }

/** team_games (workbook history + prior seasons). Totals need both rows of a game. */
export function teamGamesFromHistory(rows: Raw[]): TeamGame[] {
  const goals = new Map<string, number[]>()
  for (const r of rows) { const k = String(r.game_key ?? ''), g = num(r.actual_goals); if (k && g !== null) { if (!goals.has(k)) goals.set(k, []); goals.get(k)!.push(g) } }
  return rows.filter((r) => r.game_date && r.game_key).map((r) => {
    const k = String(r.game_key), gl = goals.get(k)
    return {
      date: String(r.game_date).slice(0, 10), gameKey: 'h:' + k, team: String(r.team ?? ''), live: false, homeAway: ha(r.home_away),
      delta: { ha: num(r.ha_delta), l10: num(r.l10_delta) },
      shots: { ...NO, line: num(r.shot_line), actual: num(r.actual_shots) },
      saves: { ...NO, actual: num(r.actual_saves) },
      goals: { ...NO, actual: num(r.actual_goals) },
      total: { line: num(r.ou_goals_line), actual: gl && gl.length === 2 ? gl[0] + gl[1] : null, over: num(r.ou_goals_odds), under: num(r.ou_goals_odds) },
      ml: { odds: num(r.ml_odds), won: bool(r.ml_won) },
    }
  })
}

/** model_vs_lines (this season, Bovada lines). Buckets use the original-formula deltas, same as the Board. */
export function teamGamesFromLive(rows: Raw[]): TeamGame[] {
  return rows.map((r) => ({
    date: String(r.game_date).slice(0, 10), gameKey: 'l:' + String(r.game_id), team: String(r.team ?? ''), live: true, homeAway: ha(r.home_away),
    delta: { ha: num(r.shots_delta_ha_excel) ?? num(r.shots_delta_ha), l10: num(r.shots_delta_l10_excel) ?? num(r.shots_delta_l10) },
    shots: { line: num(r.shots_line), actual: num(r.actual_shots), over: num(r.shots_over_odds), under: num(r.shots_under_odds) },
    saves: { line: num(r.saves_line), actual: num(r.actual_saves), over: num(r.saves_over_odds), under: num(r.saves_under_odds) },
    goals: { line: num(r.team_goals_line), actual: num(r.actual_goals), over: num(r.team_goals_over_odds), under: num(r.team_goals_under_odds) },
    total: { line: num(r.game_total), actual: num(r.actual_game_goals), over: num(r.game_total_over_odds), under: num(r.game_total_under_odds) },
    ml: { odds: num(r.ml_odds), won: bool(r.won) },
  }))
}
