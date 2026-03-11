/**
 * Shot bet analytics: aggregate by l10_bucket / ha_bucket from Excel
 * (Goal Tracking sheet). One row = one bet with both bucket values.
 */

export type BetType = 'over' | 'under'
export type Result = 'win' | 'loss'

/** One bet: shot line, deltas, and the bucket used for each model. */
export interface RawShotBet {
  shot_line: number
  l10_delta: number
  ha_delta: number
  l10_bucket: number
  ha_bucket: number
  bet_type: BetType
  result: Result
}

export interface BucketRow {
  label: string
  bets: number
  wins: number
  losses: number
  winPct: number
  confidence95: number
}

/** 95% Wilson score interval lower bound (conservative estimate of true rate). */
function wilsonLower(wins: number, n: number): number {
  if (n <= 0) return 0
  const z = 1.96
  const p = wins / n
  const denom = 1 + (z * z) / n
  const center = p + (z * z) / (2 * n)
  const spread = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / n
  return Math.max(0, (center - spread) / denom)
}

function roundPct(value: number): number {
  return Math.round(value * 1000) / 10
}

/** Bucket values from data, from 0 in 0.5 steps: unders 0, -0.5, -1, ... ; overs 0, 0.5, 1, ... */
function getBucketValues(betType: BetType, values: number[]): number[] {
  const filtered = values.filter((v) => (betType === 'under' ? v <= 0 : v >= 0))
  if (filtered.length === 0) return []
  const min = Math.min(...filtered)
  const max = Math.max(...filtered)
  const buckets: number[] = []
  if (betType === 'under') {
    for (let v = 0; v >= min; v -= 0.5) {
      buckets.push(Math.round(v * 10) / 10)
    }
  } else {
    for (let v = 0; v <= max; v += 0.5) {
      buckets.push(Math.round(v * 10) / 10)
    }
  }
  return buckets
}

function formatLabel(betType: BetType, value: number): string {
  return betType === 'under' ? `≤ ${value}` : `≥ ${value}`
}

export type Model = 'L10' | 'HA'

function getBucketValue(row: RawShotBet, model: Model): number {
  return model === 'L10' ? row.l10_bucket : row.ha_bucket
}

/** Aggregate one (model, betType) table using l10_bucket or ha_bucket. */
export function aggregateShotBetsByModelAndBetType(raw: RawShotBet[], model: Model, betType: BetType): BucketRow[] {
  const subset = raw.filter((r) => r.bet_type === betType)
  const bucketValues = subset.map((r) => getBucketValue(r, model))
  const buckets = getBucketValues(betType, bucketValues)

  return buckets.map((thresh) => {
    const meets = betType === 'under'
      ? (r: RawShotBet) => getBucketValue(r, model) <= thresh
      : (r: RawShotBet) => getBucketValue(r, model) >= thresh
    const inBucket = subset.filter(meets)
    const bets = inBucket.length
    const wins = inBucket.filter((r) => r.result === 'win').length
    const losses = bets - wins
    const winPct = bets > 0 ? (wins / bets) * 100 : 0
    const confidence95 = bets > 0 ? wilsonLower(wins, bets) * 100 : 0

    return {
      label: formatLabel(betType, thresh),
      bets,
      wins,
      losses,
      winPct: roundPct(winPct),
      confidence95: roundPct(confidence95),
    }
  })
}

