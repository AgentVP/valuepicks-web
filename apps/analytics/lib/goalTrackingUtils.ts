/**
 * Helpers for Goal Tracking sheet data: normalize row keys (Excel headers vary)
 * and aggregate by bucket for win % charts. Buckets: 0, ±0.5, ±1, ... ±7.
 */

export type BetType = 'over' | 'under'
export type Model = 'L10' | 'HA'

/** One row from Goal Tracking (keys may be Excel headers e.g. "L10 Bucket"). */
export type GoalTrackingRow = Record<string, unknown>

const NUM_BUCKETS = 15 // 0, 0.5, 1, ... 7 (or 0, -0.5, -1, ... -7)
const BUCKET_STEP = 0.5

function findKey(row: GoalTrackingRow, ...candidates: string[]): string | undefined {
  const keys = Object.keys(row)
  const lower = (s: string) => s.toLowerCase().replace(/\s+/g, '_')
  for (const k of keys) {
    const nk = lower(k)
    for (const c of candidates) {
      if (nk === lower(c) || nk.includes(lower(c)) || lower(c).includes(nk)) return k
    }
  }
  return undefined
}

function num(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

function isWin(v: unknown): boolean {
  if (v == null) return false
  const s = String(v).trim().toLowerCase()
  if (['win', 'w', 'yes', '1', 'hit'].includes(s)) return true
  if (['loss', 'l', 'no', '0'].includes(s)) return false
  return Boolean(Number(v)) || s === 'true'
}

/** Normalize a raw row into typed fields. Over/under is inferred from bucket sign (negative = under, positive = over). */
export function parseRow(row: GoalTrackingRow): {
  l10Bucket: number
  haBucket: number
  result: 'win' | 'loss'
} | null {
  const l10Key = findKey(row, 'L10 Bucket', 'l10_bucket', 'l10 bucket')
  const haKey = findKey(row, 'HA Bucket', 'ha_bucket', 'ha bucket')
  const resultKey = findKey(row, 'Result', 'result', 'Win', 'Outcome', 'W/L', 'WL')
  if (!l10Key || !haKey) return null
  const l10Bucket = num(row[l10Key])
  const haBucket = num(row[haKey])
  const result = isWin(resultKey != null ? row[resultKey] : undefined) ? 'win' : 'loss'
  return { l10Bucket, haBucket, result }
}

/** Bucket values for unders: 0, -0.5, -1, ..., -7. */
export const UNDERS_BUCKETS: number[] = (() => {
  const out: number[] = []
  for (let i = 0; i <= NUM_BUCKETS; i++) out.push(-(i * BUCKET_STEP))
  return out
})()

/** Bucket values for overs: 0, 0.5, 1, ..., 7. */
export const OVERS_BUCKETS: number[] = (() => {
  const out: number[] = []
  for (let i = 0; i <= NUM_BUCKETS; i++) out.push(i * BUCKET_STEP)
  return out
})()

export interface BucketStat {
  bucket: number
  wins: number
  total: number
  winPct: number
}

/**
 * Aggregate rows by bucket for one (model, betType).
 * Bet type is inferred from bucket sign: negative bucket = under, positive = over (same for L10 and H/A).
 */
export function aggregateByBucket(
  rows: GoalTrackingRow[],
  model: Model,
  betType: BetType
): BucketStat[] {
  const buckets = betType === 'under' ? UNDERS_BUCKETS : OVERS_BUCKETS
  const getBucket = (r: ReturnType<typeof parseRow>) =>
    r && model === 'L10' ? r.l10Bucket : r?.haBucket ?? 0

  // Filter by bucket sign: unders = bucket <= 0, overs = bucket >= 0
  const filtered = rows
    .map(parseRow)
    .filter((r): r is NonNullable<typeof r> => {
      if (r === null) return false
      const b = getBucket(r)
      return betType === 'under' ? b <= 0 : b >= 0
    })

  const stats = buckets.map((bucket) => {
    const exact = filtered.filter((r) => getBucket(r) === bucket)
    const total = exact.length
    const wins = exact.filter((r) => r.result === 'win').length
    const winPct = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0
    return { bucket, wins, total, winPct }
  })

  return stats
}
