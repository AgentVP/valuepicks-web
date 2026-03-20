/**
 * Moneyline analytics from Goal Tracking sheet: bucket by EV % (0-5%, 5-10%, … 70%+),
 * split by favorite (GameLine <= -110) vs underdog (GameLine >= -105).
 * Uses GameWinner for hit/loss. Same table shape as goal tracking (Bucket, Total Bets,
 * Wins, Losses, Win %) with >58% row highlight.
 */

export type MoneylineSide = 'favorite' | 'underdog'

/** One row from Goal Tracking (same sheet as shot/goal; has EV, GameWinner, GameLine). */
export type MoneylineRow = Record<string, unknown>

/** EV % buckets: lower bound of each 5% band, capped at 70. 0, 5, 10, …, 65, 70 (70 = 70%+). */
export const EV_BUCKETS: number[] = (() => {
  const out: number[] = []
  for (let i = 0; i <= 70; i += 5) out.push(i)
  return out
})()

function findKey(row: MoneylineRow, ...candidates: string[]): string | undefined {
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

/** Use only the column whose full name is exactly "ROI" (ignore "ROI %", etc.). */
function findRoiKey(row: MoneylineRow): string | undefined {
  const key = Object.keys(row).find((k) => k.trim().toLowerCase() === 'roi')
  return key ?? undefined
}

/** Use only the column whose full name is exactly "GameWinner". */
function findGameWinnerKey(row: MoneylineRow): string | undefined {
  const key = Object.keys(row).find((k) => k.trim().toLowerCase() === 'gamewinner')
  return key ?? undefined
}

function num(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  const s = String(v).trim()
  const n = Number(s.replace(/[^-\d.]/g, ''))
  let val = Number.isNaN(n) ? 0 : n
  if (s.includes('(') && s.includes(')') && val > 0) val = -val
  return val
}

/** Only "Win" = win, "Loss" = loss; no other outcomes. Uses GameWinner column value. */
function parseGameWinner(v: unknown): 'win' | 'loss' | null {
  if (v == null) return null
  const s = String(v).trim().toLowerCase()
  if (s === 'win') return 'win'
  if (s === 'loss') return 'loss'
  return null
}

/**
 * Normalize a Goal Tracking row for moneyline: EV %, side from GameLine, result from GameWinner,
 * and per-bet ROI (-1 for loss, positive profit for win; used for ROI %).
 */
export function parseMoneylineRow(row: MoneylineRow): {
  evPct: number
  side: MoneylineSide
  result: 'win' | 'loss'
  roiPerBet: number
} | null {
  const evKey = findKey(row, 'EV', 'EV %', 'ev', 'ev_pct', 'ev%', 'ev %')
  const gameLineKey = findKey(row, 'GameLine', 'game_line', 'gameline', 'Odds', 'odds')
  const gameWinnerKey = findGameWinnerKey(row)
  const roiKey = findRoiKey(row)

  if (!evKey || !gameLineKey || !gameWinnerKey) return null

  const result = parseGameWinner(row[gameWinnerKey])
  if (result === null) return null // only "Win" or "Loss" in GameWinner

  let evPct = num(row[evKey])
  // If EV is stored as decimal (e.g. 0.05 for 5%), convert to percentage
  if (evPct > 0 && evPct <= 1) evPct = evPct * 100
  if (evPct <= 0) return null // only include positive EV rows

  const gameLine = num(row[gameLineKey])
  // Per-bet ROI: -1 for loss, positive number for win. Default -1/0 if column missing.
  const roiPerBet = roiKey != null ? num(row[roiKey]) : (result === 'win' ? 0 : -1)

  // Underdog: -105 and above. Favorite: -110 and below. Exclude -110 < GameLine < -105.
  if (gameLine >= -105) return { evPct, side: 'underdog', result, roiPerBet }
  if (gameLine <= -110) return { evPct, side: 'favorite', result, roiPerBet }
  return null
}

/** Map EV % to bucket lower bound (0, 5, …, 70). EV >= 70 → 70 (70%+). */
function evToBucket(evPct: number): number {
  if (evPct >= 70) return 70
  const b = Math.floor(evPct / 5) * 5
  return Math.max(0, Math.min(65, b))
}

export interface BucketStat {
  bucket: number
  wins: number
  total: number
  winPct: number
  /** ROI % = total profit / total bets. Profit = sum(ROI for wins) + sum(ROI for losses); ROI col is -1 loss, +profit win. */
  roiPct?: number
}

/**
 * Aggregate Goal Tracking rows by EV bucket for favorites or underdogs.
 * Steps: (1) Keep only positive EV rows. (2) Categorize by EV bucket → total bets per bucket.
 * (3) Wins/Losses from GameWinner. (4) ROI % = total profit / total bets, where total profit = sum(ROI for wins) + sum(ROI for losses) = sumWinsRoi - losses (each loss is -1).
 */
export function aggregateMoneylineByBucket(
  rows: MoneylineRow[],
  side: MoneylineSide
): BucketStat[] {
  const parsed = rows.map(parseMoneylineRow).filter((r): r is NonNullable<typeof r> => r !== null)
  const filtered = parsed.filter((r) => r.side === side && r.evPct > 0)

  const stats = EV_BUCKETS.map((bucket) => {
    const inBucket = filtered.filter((r) => evToBucket(r.evPct) === bucket)
    const total = inBucket.length
    const winningRows = inBucket.filter((r) => r.result === 'win')
    const wins = winningRows.length
    const winPct = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0
    // Total profit: sum ROI for all bets (wins give +profit, losses give -1). Same as sumWinsRoi + (losses * -1).
    const sumWinsRoi = winningRows.reduce((s, r) => s + r.roiPerBet, 0)
    const losses = total - wins
    const totalProfit = sumWinsRoi - losses
    const roiPct = total > 0 ? Math.round((totalProfit / total) * 1000) / 10 : 0
    return { bucket, wins, total, winPct, roiPct }
  })

  return stats
}

/** Format EV bucket for display: 0 → "0-5%", 70 → "70%+". */
export function formatEvBucket(bucket: number): string {
  if (bucket >= 70) return '70%+'
  return `${bucket}-${bucket + 5}%`
}
