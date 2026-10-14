'use client'

import { useMemo } from 'react'
import { wilsonLower, breakeven } from '@/lib/analytics'

/** Graded starter saves picks: the line Bovada posted ~30 min before puck drop, the confirmed starter's real saves. */
export type SaveRow = {
  game_date: string; team: string; goalie: string | null; saves_line: number | null; saves_over_odds: number | null; saves_under_odds: number | null
  edge_ha: number | null; edge_l10: number | null; implied_sv: number | null; actual_saves: number | null; result: string | null
}
type T = { w: number; l: number; p: number; u: number; be: number }
const blank = (): T => ({ w: 0, l: 0, p: 0, u: 0, be: 0 })
const profit = (o: number) => (o < 0 ? 100 / -o : o / 100)
const pct = (v: number | null) => (v === null ? '—' : (100 * v).toFixed(1) + '%')
const sgn = (v: number, d = 2) => (v > 0 ? '+' : '') + v.toFixed(d)
const STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5]
const SV_BANDS: [number, number, string][] = [[0, 0.82, 'under .820'], [0.82, 0.85, '.820–.849'], [0.85, 0.88, '.850–.879'], [0.88, 0.91, '.880–.909'], [0.91, 0.94, '.910–.939'], [0.94, 9, '.940+']]

function add(t: T, r: SaveRow, side: 'over' | 'under') {
  if (r.result === 'push') { t.p++; return }
  const odds = (side === 'over' ? r.saves_over_odds : r.saves_under_odds) ?? -110
  t.be += breakeven(odds)
  if (r.result === side) { t.w++; t.u += profit(odds) } else { t.l++; t.u -= 1 }
}

function Rows({ label, t }: { label: string; t: T }) {
  const n = t.w + t.l, lb = wilsonLower(t.w, n)
  const cls = !n ? 'empty' : lb !== null && lb >= t.be / n ? 'good' : t.u > 0 ? 'ok' : ''
  return <tr className={cls}><td>{label}</td><td>{n}</td><td>{t.w}–{t.l}{t.p ? `–${t.p}` : ''}</td><td>{pct(n ? t.w / n : null)}</td><td>{pct(lb)}</td>
    <td className={t.u > 0 ? 'pos' : t.u < 0 ? 'neg' : ''}>{n ? sgn(t.u) : '—'}</td><td className={t.u > 0 ? 'pos' : t.u < 0 ? 'neg' : ''}>{n ? sgn((100 * t.u) / n, 1) + '%' : '—'}</td></tr>
}
const Head = ({ first }: { first: string }) => <thead><tr><th>{first}</th><th>Bets</th><th>W–L</th><th>Win %</th><th>Conf. 95%</th><th>Units</th><th>ROI</th></tr></thead>

export default function StarterSaves({ rows }: { rows: SaveRow[] }) {
  const graded = useMemo(() => rows.filter((r) => r.result === 'over' || r.result === 'under' || r.result === 'push'), [rows])
  const voids = rows.filter((r) => r.result === 'void').length
  const tables = useMemo(() => (['ha', 'l10'] as const).flatMap((m) => (['under', 'over'] as const).map((side) => {
    const out = STEPS.map((s) => {
      const t = blank()
      for (const r of graded) {
        const e = m === 'ha' ? r.edge_ha : r.edge_l10
        if (e === null) continue
        const mag = side === 'over' ? e : -e
        if (mag <= 0 || mag < s) continue
        add(t, r, side)
      }
      return { label: s === 0 ? (side === 'over' ? 'All overs' : 'All unders') : side === 'over' ? `≥ +${s}` : `≤ −${s}`, t }
    })
    return { m, side, out }
  })), [graded])
  const svTable = useMemo(() => SV_BANDS.map(([lo, hi, label]) => {
    const o = blank(), u = blank()
    for (const r of graded) { if (r.implied_sv === null || r.implied_sv < lo || r.implied_sv >= hi) continue; add(o, r, 'over'); add(u, r, 'under') }
    return { label, o, u }
  }), [graded])

  return (
    <>
      <div className="pla-note">
        <b>Starter saves picks</b>: the confirmed starter&apos;s saves line from Bovada&apos;s pull about 30 minutes before puck drop, graded on <b>his own saves</b> from the box score.
        If a different goalie starts, the pick is void ({voids} so far). Projection = the other team&apos;s shot projection × the league starter save rate × this goalie&apos;s save %, shown separately for H/A and L10.
        Overs and unders use the same bar: the starter save rate already counts pulled starters, and over 2025-26 misses ran evenly in both directions.
      </div>
      {graded.length === 0 && <div className="pla-note">No graded starter picks yet. They fill in the morning after each game.</div>}
      <div className="pla-grid">
        {tables.map(({ m, side, out }) => (
          <section className="pla-card" key={m + side}>
            <h3><span><span className={`pla-model ${m}`}>{m === 'ha' ? 'H/A' : 'L10'}</span>Starter saves {side === 'over' ? 'overs' : 'unders'} by edge</span></h3>
            <div className="pla-scroll"><table><Head first="Edge vs line" /><tbody>{out.map((x) => <Rows key={x.label} label={x.label} t={x.t} />)}</tbody></table></div>
          </section>))}
      </div>
      <section className="pla-card">
        <h3><span>Book&apos;s implied save rate (saves line ÷ other team&apos;s shot line), no model</span><small>league starters ≈ .874</small></h3>
        <div className="pla-scroll"><table>
          <thead><tr><th>Implied rate</th><th>Overs W–L</th><th>Overs units</th><th>Unders W–L</th><th>Unders units</th></tr></thead>
          <tbody>{svTable.map((x) => (
            <tr key={x.label} className={x.o.w + x.o.l === 0 ? 'empty' : ''}><td>{x.label}</td>
              <td>{x.o.w}–{x.o.l}</td><td className={x.o.u > 0 ? 'pos' : x.o.u < 0 ? 'neg' : ''}>{x.o.w + x.o.l ? sgn(x.o.u) : '—'}</td>
              <td>{x.u.w}–{x.u.l}</td><td className={x.u.u > 0 ? 'pos' : x.u.u < 0 ? 'neg' : ''}>{x.u.w + x.u.l ? sgn(x.u.u) : '—'}</td></tr>))}</tbody>
        </table></div>
        <div className="pla-foot">When the saves line asks for a save rate far above normal, the under should win more often; far below, the over. This checks whether Bovada&apos;s two markets disagree.</div>
      </section>
    </>
  )
}
