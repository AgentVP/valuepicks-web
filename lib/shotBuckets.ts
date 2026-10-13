/** Half-shot bands of |shot delta| used for bucket win rates. Band 0 = 0–0.5, 1 = 0.5–1 … 12 = 6+. */
export type BucketStats = Record<string, { w: number; l: number }>
export const BAND = 0.5
export const MAX_BAND = 12
export const bandOf = (d: number) => Math.min(MAX_BAND, Math.floor(Math.abs(d) / BAND + 1e-9))
export const bandLabel = (band: number, side: 'under' | 'over') => {
  const s = side === 'under' ? '−' : '+'
  return band >= MAX_BAND ? `${s}${MAX_BAND * BAND}+` : `${s}${band * BAND}–${(band + 1) * BAND}`
}
