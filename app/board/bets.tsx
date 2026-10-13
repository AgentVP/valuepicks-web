'use client'

import { useState } from 'react'

type Row = Record<string, string | number | boolean | null>
export type Bet = {
  id: number; game_id: number; game_date: string; team: string; opponent: string | null; market: string; side: string
  line: number | null; odds: number; stake: number; model_basis: string | null; notes: string | null
  actual: number | null; score_for: number | null; score_against: number | null; result: 'win' | 'loss' | 'push' | 'pending'
}

export const MARKET_LABEL: Record<string, string> = {
  shots: 'Shots', moneyline: 'Moneyline', puck_line: 'Puck line', team_goals: 'Team goals', game_total: 'Game total', saves: 'Saves',
}
export const BASIS_LABEL: Record<string, string> = { ha: 'H/A', l10: 'L10', both: 'Both models', best: 'Best bucket', manual: 'Other' }

const n = (v: unknown): number | null => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))
export const odds = (o: number | null) => (o === null ? '—' : o > 0 ? `+${o}` : String(o))
export const betProfit = (b: Bet) => (b.result === 'win' ? b.stake * (b.odds < 0 ? 100 / -b.odds : b.odds / 100) : b.result === 'loss' ? -b.stake : 0)
export const describe = (b: Pick<Bet, 'market' | 'side' | 'line'>) =>
  b.market === 'moneyline' ? 'ML' : b.market === 'puck_line' ? `PL ${b.line !== null && b.line > 0 ? '+' : ''}${b.line}`
    : `${b.side === 'over' ? 'O' : 'U'} ${b.line} ${MARKET_LABEL[b.market].toLowerCase()}`

/** Prefill line + odds from today's Bovada numbers for the chosen market and side. */
function prefill(r: Row, market: string, side: string): { line: string; odds: string } {
  const s = (v: unknown) => (n(v) === null ? '' : String(n(v)))
  switch (market) {
    case 'shots': return { line: s(r.shots_line), odds: s(side === 'over' ? r.shots_over_odds : r.shots_under_odds) }
    case 'team_goals': return { line: s(r.team_goals_line), odds: s(side === 'over' ? r.team_goals_over_odds : r.team_goals_under_odds) }
    case 'game_total': return { line: s(r.game_total), odds: s(side === 'over' ? r.game_total_over_odds : r.game_total_under_odds) }
    case 'saves': return { line: s(r.saves_line), odds: s(side === 'over' ? r.saves_over_odds : r.saves_under_odds) }
    case 'puck_line': return { line: s(r.puck_line), odds: s(r.puck_line_odds) }
    default: return { line: '', odds: s(r.ml_odds) }
  }
}

export function BetForm({ row, date, defaultBasis, token, onSaved, onCancel }: {
  row: Row; date: string; defaultBasis: string; token: string; onSaved: () => void; onCancel: () => void
}) {
  const dHa = n(row.shots_delta_ha), dL10 = n(row.shots_delta_l10)
  const modelSide = (dHa ?? dL10 ?? 0) < 0 ? 'under' : 'over'
  const [market, setMarket] = useState('shots')
  const [side, setSide] = useState(modelSide)
  const init = prefill(row, 'shots', modelSide)
  const [line, setLine] = useState(init.line)
  const [o, setO] = useState(init.odds)
  const [stake, setStake] = useState('1')
  const [basis, setBasis] = useState(defaultBasis)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ou = !['moneyline', 'puck_line'].includes(market)

  const change = (m: string, sd: string) => { const p = prefill(row, m, sd); setLine(p.line); setO(p.odds) }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/bets', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          game_id: row.game_id, game_date: date, team: row.team, opponent: row.opponent, market, side: ou ? side : 'team',
          line: market === 'moneyline' ? null : line, odds: o, stake, model_basis: basis, notes,
          snapshot: { shots_line: row.shots_line, shots_delta_ha: row.shots_delta_ha, shots_delta_l10: row.shots_delta_l10,
            ml_odds: row.ml_odds, ml_ev_ha: row.ml_ev_ha, ml_ev_l10: row.ml_ev_l10, x_goals_ha: row.x_goals_ha, x_goals_l10: row.x_goals_l10 },
        }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j?.error || 'Could not save the bet.'); return }
      onSaved()
    } catch { setErr('Could not save the bet. Check your connection.') } finally { setSaving(false) }
  }

  const id = (k: string) => `bet-${row.game_id}-${row.team}-${k}`
  return (
    <form className="plb-betform" onSubmit={save}>
      <b>Log bet · {String(row.team_name || row.team)}</b>
      <label htmlFor={id('m')}>Market<select id={id('m')} value={market} onChange={(e) => { setMarket(e.target.value); change(e.target.value, side) }}>
        {Object.entries(MARKET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {ou && <label htmlFor={id('s')}>Side<select id={id('s')} value={side} onChange={(e) => { setSide(e.target.value); change(market, e.target.value) }}>
        <option value="under">Under</option><option value="over">Over</option></select></label>}
      {market !== 'moneyline' && <label htmlFor={id('l')}>Line<input id={id('l')} inputMode="decimal" value={line} onChange={(e) => setLine(e.target.value)} placeholder="30.5" /></label>}
      <label htmlFor={id('o')}>Odds<input id={id('o')} inputMode="numeric" value={o} onChange={(e) => setO(e.target.value)} placeholder="-110" /></label>
      <label htmlFor={id('u')}>Units<input id={id('u')} inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} /></label>
      <label htmlFor={id('b')}>Based on<select id={id('b')} value={basis} onChange={(e) => setBasis(e.target.value)}>
        {Object.entries(BASIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label htmlFor={id('n')} className="wide">Note<input id={id('n')} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" maxLength={300} /></label>
      <div className="plb-betbtns">
        <button type="submit" className="plb-primary" disabled={saving}>{saving ? 'Saving…' : 'Save bet'}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      {err && <div className="plb-betnote err">{err}</div>}
    </form>
  )
}

export function MyBets({ bets, token, onChanged }: { bets: Bet[]; token: string; onChanged: () => void }) {
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const graded = bets.filter((b) => b.result !== 'pending')
  const w = graded.filter((b) => b.result === 'win').length, l = graded.filter((b) => b.result === 'loss').length
  const p = graded.filter((b) => b.result === 'push').length, pend = bets.length - graded.length
  const units = graded.reduce((s, b) => s + betProfit(b), 0), risked = graded.reduce((s, b) => s + (b.result === 'push' ? 0 : b.stake), 0)
  const sgn = (v: number, d = 2) => (v > 0 ? '+' : '') + v.toFixed(d)

  const groups = new Map<string, { w: number; l: number; p: number; u: number; risk: number }>()
  for (const b of graded) for (const k of [`${MARKET_LABEL[b.market]}|All`, `${MARKET_LABEL[b.market]}|${BASIS_LABEL[b.model_basis || 'manual']}`]) {
    const g = groups.get(k) || { w: 0, l: 0, p: 0, u: 0, risk: 0 }
    if (b.result === 'win') g.w++; else if (b.result === 'loss') g.l++; else g.p++
    g.u += betProfit(b); g.risk += b.result === 'push' ? 0 : b.stake; groups.set(k, g)
  }
  async function del(id: number) {
    if (confirmId !== id) { setConfirmId(id); return }
    await fetch(`/api/bets?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    setConfirmId(null); onChanged()
  }
  const list = showAll ? bets : bets.slice(0, 25)
  return (
    <section className="plb-ledger" id="my-bets">
      <h3>My bets</h3>
      <div className="plb-chips">
        <div className="plb-chip"><b>{w}-{l}{p ? `-${p}` : ''}</b><small>record</small></div>
        <div className="plb-chip"><b className={units >= 0 ? 'plb-w' : 'plb-l'}>{sgn(units)}u</b><small>units</small></div>
        <div className="plb-chip"><b>{risked ? sgn((100 * units) / risked, 1) + '%' : '—'}</b><small>ROI</small></div>
        <div className="plb-chip"><b>{pend}</b><small>pending</small></div>
      </div>
      {groups.size > 0 && <div className="plb-card plb-scroll"><table>
        <thead><tr><th>Bet type</th><th>Based on</th><th>Record</th><th>Units</th><th>ROI</th></tr></thead>
        <tbody>{[...groups.entries()].sort().map(([k, g]) => { const [m, basis] = k.split('|'); return (
          <tr key={k}><td className="team">{basis === 'All' ? m : ''}</td><td>{basis}</td><td>{g.w}-{g.l}{g.p ? `-${g.p}` : ''}</td>
            <td><span className={`plb-ev ${g.u >= 0 ? 'pos' : 'neg'}`}>{sgn(g.u)}</span></td><td>{g.risk ? sgn((100 * g.u) / g.risk, 1) + '%' : '—'}</td></tr>) })}</tbody>
      </table></div>}
      <div className="plb-card plb-scroll"><table>
        <thead><tr><th>Date</th><th>Team</th><th>Bet</th><th>Odds</th><th>Units</th><th>Based on</th><th>Actual</th><th>Result</th><th>P/L</th><th></th></tr></thead>
        <tbody>{bets.length === 0 ? <tr><td colSpan={10} className="plb-na" style={{ textAlign: 'left' }}>No bets logged yet. Use the Log button next to a team.</td></tr> :
          list.map((b) => (
            <tr key={b.id}>
              <td>{b.game_date.slice(5)}</td><td className="team">{b.team}{b.opponent ? <small>vs {b.opponent}</small> : null}</td>
              <td>{describe(b)}</td><td>{odds(b.odds)}</td><td>{b.stake}</td><td>{BASIS_LABEL[b.model_basis || 'manual']}</td>
              <td>{b.market === 'moneyline' || b.market === 'puck_line' ? (b.score_for !== null ? `${b.score_for}–${b.score_against}` : '') : (b.actual ?? '')}</td>
              <td>{b.result === 'pending' ? <span className="plb-na">pending</span> : <span className={b.result === 'win' ? 'plb-w' : b.result === 'loss' ? 'plb-l' : ''}>{b.result}</span>}</td>
              <td>{b.result === 'pending' ? '' : <span className={`plb-ev ${betProfit(b) >= 0 ? 'pos' : 'neg'}`}>{sgn(betProfit(b))}</span>}</td>
              <td><button type="button" className="plb-del" onClick={() => del(b.id)}>{confirmId === b.id ? 'Delete?' : '✕'}</button></td>
            </tr>))}</tbody>
      </table></div>
      {bets.length > 25 && <button type="button" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show recent only' : `Show all ${bets.length} bets`}</button>}
      <div className="plb-legend">Bets grade automatically the morning after each game. Units use the odds you entered.</div>
    </section>
  )
}
