import type { RawShotBet } from './analyticsAggregate'

/** Normalize header for matching: lowercase, collapse spaces to underscore */
function norm(s: string): string {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function num(val: unknown): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val
  const n = Number(val)
  return Number.isNaN(n) ? 0 : n
}

function isWin(val: unknown): boolean {
  if (val === null || val === undefined) return false
  const s = String(val).trim().toLowerCase()
  if (s === 'win' || s === 'w' || s === 'yes' || s === '1' || s === 'hit') return true
  if (s === 'loss' || s === 'loss' || s === 'l' || s === 'no' || s === '0') return false
  return Boolean(Number(val)) || s === 'true'
}

function isUnder(val: unknown): boolean {
  if (val === null || val === undefined) return false
  const s = String(val).trim().toLowerCase()
  return s === 'under' || s === 'u' || s === '0'
}

function findColKey(keys: string[], ...candidates: string[]): string | undefined {
  for (const k of keys) {
    const nk = norm(k)
    for (const c of candidates) {
      const nc = norm(c)
      if (nk === nc || nk.includes(nc) || nc.includes(nk)) return k
    }
  }
  return undefined
}

function get(row: Record<string, unknown>, keys: string[], candidates: string[]): unknown {
  const key = findColKey(keys, ...candidates)
  return key !== undefined ? row[key] : undefined
}

/**
 * Parse rows from "Goal Tracking" sheet (array of objects, first row = headers).
 * Column names matched case-insensitively; spaces/underscores normalized.
 */
export function parseGoalTrackingSheet(rows: Record<string, unknown>[]): RawShotBet[] {
  if (!rows.length) return []
  const keys = Object.keys(rows[0])

  const out: RawShotBet[] = []
  for (const row of rows) {
    const shot_line = num(get(row, keys, ['Shot Line', 'shot_line', 'shot line']))
    const l10_delta = num(get(row, keys, ['L10 Delta', 'l10_delta', 'l10 delta']))
    const ha_delta = num(get(row, keys, ['HA Delta', 'ha_delta', 'ha delta']))
    const l10_bucket = num(get(row, keys, ['L10 Bucket', 'l10_bucket', 'l10 bucket']))
    const ha_bucket = num(get(row, keys, ['HA Bucket', 'ha_bucket', 'ha bucket']))
    const resultVal = get(row, keys, ['Result', 'result', 'Win', 'win', 'Hit', 'hit', 'Outcome'])
    const betVal = get(row, keys, ['Over/Under', 'over_under', 'Bet Type', 'bet_type', 'Type', 'type'])
    const result = isWin(resultVal) ? 'win' : 'loss'
    const bet_type = isUnder(betVal) ? 'under' : 'over'

    out.push({
      shot_line,
      l10_delta,
      ha_delta,
      l10_bucket,
      ha_bucket,
      bet_type,
      result,
    })
  }
  return out
}

