'use client'

import { useMemo, useState } from 'react'
import {
  MARKETS, PLAY_MODELS, bucketPlays, wholeBandLabel, type TeamGame, type Tally, type Side, type ShotModel,
} from '@/lib/linkedBets'
import { wilsonLower } from '@/lib/analytics'

const pct = (v: number | null, d = 1) => (v === null ? '—' : (100 * v).toFixed(d) + '%')
const sgn = (v: number | null, d = 2) => (v === null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d))
const readNum = (k: string, d: number) => { try { const v = localStorage.getItem(k); return v === null ? d : Number(v) } catch { return d } }
const saveNum = (k: string, v: number) => { try { localStorage.setItem(k, String(v)) } catch { /* private mode */ } }

function cls(t: Tally) {
  const n = t.w + t.l
  if (!n) return 'empty'
  const lb = wilsonLower(t.w, n) ?? 0
  return lb >= 0.524 ? 'good' : t.u > 0 ? 'ok' : ''
}

/** "Bucket plays": every bet type, graded whenever a shot model's bucket qualified (walk-forward, no hindsight). */
export default function BucketPlays({ games, include }: { games: TeamGame[]; include: (t: TeamGame) => boolean }) {
  // only rendered after data loads in the browser, so reading saved settings up front is safe
  const [bkt, setBkt] = useState(() => readNum('plb_bkt', 55))
  const [minN, setMinN] = useState(() => readNum('plb_minn', 20))
  const [bandModel, setBandModel] = useState<ShotModel>('ha')

  const report = useMemo(() => bucketPlays(games, { minPct: bkt / 100, minN }, include), [games, bkt, minN, include])

  return (
    <>
      <div className="pla-note">
        A <b>bucket play</b> is any team-game where a shot model&apos;s delta landed in a bucket whose record cleared your bar
        <b> at that time</b> (only earlier games count, so there&apos;s no hindsight). Each play is then graded on every linked bet in the
        same direction: an over means more shots, so the <b>opposing goalie&apos;s saves over</b>, this team&apos;s goals over, the game total over,
        and this team&apos;s moneyline. An under bets the opposite way, including the <b>opponent&apos;s moneyline</b>. H/A and L10 are graded separately;
        &ldquo;Both&rdquo; counts only games where both models qualified on the same side.
      </div>
      <div className="pla-filters">
        <div className="grp"><span className="lbl">Bucket win ≥</span>
          {[52, 55, 58, 60].map((v) => <button key={v} className="pla-chip" aria-pressed={bkt === v} onClick={() => { setBkt(v); saveNum('plb_bkt', v) }}>{v}%</button>)}</div>
        <div className="grp"><span className="lbl">Min bets in bucket</span>
          {[10, 20, 30, 50].map((v) => <button key={v} className="pla-chip" aria-pressed={minN === v} onClick={() => { setMinN(v); saveNum('plb_minn', v) }}>{v}</button>)}</div>
        <div className="grp"><span className="lbl">Plays found</span><b style={{ color: '#fff' }}>{report.plays.toLocaleString()}</b></div>
      </div>

      <div className="pla-grid">
        {PLAY_MODELS.map((m) => (
          <section className="pla-card" key={m.key}>
            <h3><span><span className={`pla-model ${m.key === 'both' ? 'l10' : m.key}`}>{m.label}</span>Bucket plays · every bet type</span></h3>
            <div className="pla-scroll"><table>
              <thead><tr><th>Linked bet</th><th>Bets</th><th>W–L</th><th>Win %</th><th>Conf. 95%</th><th>Units</th><th>ROI</th></tr></thead>
              <tbody>{MARKETS.map((k) => {
                const t = report.summary[m.key][k.key], n = t.w + t.l
                return (
                  <tr key={k.key} className={cls(t)}>
                    <td>{k.label}{k.key === 'opp_saves' && t.est > 0 ? <small style={{ color: 'var(--pla-muted)' }}> · {t.est === n + t.p ? 'est. lines' : `${t.est} est.`}</small> : null}</td>
                    <td>{n}</td><td>{t.w}–{t.l}{t.p ? `–${t.p}` : ''}</td><td>{pct(n ? t.w / n : null)}</td>
                    <td>{pct(wilsonLower(t.w, n))}</td>
                    <td className={t.u > 0 ? 'pos' : t.u < 0 ? 'neg' : ''}>{n ? sgn(t.u) : '—'}</td>
                    <td className={t.u > 0 ? 'pos' : t.u < 0 ? 'neg' : ''}>{n ? sgn((100 * t.u) / n, 1) + '%' : '—'}</td>
                  </tr>)
              })}</tbody>
            </table></div>
          </section>))}
      </div>

      <section className="pla-card">
        <h3><span><span className={`pla-model ${bandModel}`}>{bandModel === 'ha' ? 'H/A' : 'L10'}</span>Every shot signal by delta band · linked bets</span>
          <span className="grp" style={{ display: 'flex', gap: 6 }}>
            {(['ha', 'l10'] as const).map((k) => <button key={k} className="pla-chip" aria-pressed={bandModel === k} onClick={() => setBandModel(k)}>{k === 'ha' ? 'H/A' : 'L10'}</button>)}
          </span></h3>
        <div className="pla-scroll"><table>
          <thead><tr><th>Shot delta</th>{MARKETS.map((k) => <th key={k.key}>{k.label}</th>)}</tr></thead>
          <tbody>{(['under', 'over'] as Side[]).flatMap((side) => (side === 'under' ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4]).map((b) => {
            const row = report.bands[`${bandModel}|${side}|${b}`]
            return (
              <tr key={side + b}>
                <td>{wholeBandLabel(side, b)}</td>
                {MARKETS.map((k) => {
                  const t = row?.[k.key], n = t ? t.w + t.l : 0
                  if (!t || !n) return <td key={k.key} style={{ color: 'rgba(224,242,254,.3)' }}>—</td>
                  return <td key={k.key} className={t.u > 0 ? 'pos' : t.u < 0 ? 'neg' : ''} title={`${t.w}–${t.l}${t.p ? `–${t.p}` : ''}, ${sgn(t.u)}u`}>
                    {t.w}–{t.l} <small>{sgn((100 * t.u) / n, 0)}%</small></td>
                })}
              </tr>)
          }))}</tbody>
        </table></div>
        <div className="pla-foot">Every non-zero shot delta, qualifying or not, grouped by whole shots. Cells show W–L and ROI. Saves use the posted line when there is one, otherwise floor(shot line × 0.874) + 0.5 at −110 (an estimate, not a real price).</div>
      </section>
    </>
  )
}
