'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import './board.css'

type Row = Record<string, string | number | boolean | null>

const etToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))
const fmt = (v: unknown, d = 1) => (n(v) === null ? '—' : (n(v) as number).toFixed(d))
const sgn = (v: number | null, d = 1) => (v === null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d))
const odds = (o: unknown) => { const x = n(o); return x === null ? '—' : x > 0 ? `+${x}` : String(x) }
const profit = (o: number) => (o < 0 ? 100 / -o : o / 100)
const readNum = (k: string, d: number) => { try { const v = localStorage.getItem(k); return v === null ? d : Number(v) } catch { return d } }
const saveNum = (k: string, v: number) => { try { localStorage.setItem(k, String(v)) } catch { /* private mode */ } }

export default function PuckLineBoard() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [date, setDate] = useState(etToday())
  const [rows, setRows] = useState<Row[]>([])
  const [hist, setHist] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updated, setUpdated] = useState<string>('')
  const [thr, setThr] = useState(2)
  const [evThr, setEvThr] = useState(5)
  const [playsOnly, setPlaysOnly] = useState(false)

  useEffect(() => { setThr(readNum('plb_thr', 2)); setEvThr(readNum('plb_ev', 5)) }, [])

  useEffect(() => {
    (async () => {
      if (!supabase) { setError('Sign-in is not configured.'); setLoading(false); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login?redirect=/board'); return }
      setToken(session.access_token)
    })()
  }, [router])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`/api/board?date=${date}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      if (res.status === 401) { router.replace('/login?redirect=/board'); return }
      const json = await res.json()
      if (!res.ok) { setError(json?.error || 'Could not load the board.'); return }
      setRows(json.rows || []); setHist(json.history || []); setError(null)
      setUpdated(new Date(json.loadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
    } catch { setError('Could not load the board. Check your connection and press Refresh.') }
    finally { setLoading(false) }
  }, [token, date, router])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden && date === etToday()) load() }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [load, date])

  const isShotPlay = (r: Row) => thr > 0 && [r.shots_delta_ha, r.shots_delta_l10].some((d) => n(d) !== null && Math.abs(n(d) as number) >= thr)
  const isMlPlay = (r: Row) => [r.ml_ev_ha, r.ml_ev_l10].some((e) => n(e) !== null && (n(e) as number) >= evThr / 100)

  const games = useMemo(() => {
    const m = new Map<number, Row[]>()
    for (const r of rows) { const g = Number(r.game_id); if (!m.has(g)) m.set(g, []); m.get(g)!.push(r) }
    return [...m.values()]
  }, [rows])

  const shift = (days: number) => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + days); setDate(d.toISOString().slice(0, 10)) }

  const Delta = ({ v }: { v: unknown }) => {
    const d = n(v); if (d === null) return <span className="plb-na">—</span>
    return <span className={`plb-pill ${d < 0 ? 'under' : 'over'}${thr > 0 && Math.abs(d) >= thr ? ' hit' : ''}`}>{sgn(d)}</span>
  }
  const Ev = ({ v }: { v: unknown }) => {
    const e = n(v); if (e === null) return <span className="plb-na">—</span>
    return <span className={`plb-ev ${e > 0 ? 'pos' : 'neg'}${e >= evThr / 100 ? ' hit' : ''}`}>{sgn(e * 100, 0)}%</span>
  }

  const ledger = useMemo(() => {
    const acc: Record<string, { market: string; model: string; w: number; l: number; p: number; u: number }> = {}
    const add = (market: string, model: string, win: boolean | null, units = 0) => {
      const k = market + '|' + model; const a = acc[k] || (acc[k] = { market, model, w: 0, l: 0, p: 0, u: 0 })
      if (win === null) { a.p++; return } if (win) a.w++; else a.l++; a.u += units
    }
    const ou = (actual: unknown, line: unknown, delta: number | null, oOdds: unknown, uOdds: unknown) => {
      const A = n(actual), L = n(line); if (A === null || L === null || delta === null) return null
      if (A === L) return { win: null, units: 0 }
      const under = delta < 0, win = under ? A < L : A > L, o = n(under ? uOdds : oOdds) ?? -110
      return { win, units: win ? profit(o) : -1 }
    }
    for (const r of hist) {
      for (const [model, d] of [['H/A', n(r.shots_delta_ha)], ['L10', n(r.shots_delta_l10)]] as const) {
        if (d === null || Math.abs(d) < thr) continue
        const g = ou(r.actual_shots, r.shots_line, d, r.shots_over_odds, r.shots_under_odds)
        if (g) add(d < 0 ? 'Shots under' : 'Shots over', model, g.win, g.units)
      }
      for (const [model, e] of [['H/A', n(r.ml_ev_ha)], ['L10', n(r.ml_ev_l10)]] as const) {
        const o = n(r.ml_odds); if (e === null || o === null || r.won === null || e < evThr / 100) continue
        add('Moneyline', model, r.won === true, r.won === true ? profit(o) : -1)
      }
      for (const [model, x] of [['H/A', n(r.x_goals_ha)], ['L10', n(r.x_goals_l10)]] as const) {
        const L = n(r.team_goals_line); if (x === null || L === null) continue
        const g = ou(r.actual_goals, L, x - L, r.team_goals_over_odds, r.team_goals_under_odds)
        if (g) add('Team goals', model, g.win, g.units)
      }
    }
    const seen = new Set<string>()
    for (const r of hist) {
      const gid = String(r.game_id); if (seen.has(gid)) continue; seen.add(gid)
      for (const [model, x] of [['H/A', n(r.x_game_total_ha)], ['L10', n(r.x_game_total_l10)]] as const) {
        const L = n(r.game_total); if (x === null || L === null) continue
        const g = ou(r.actual_game_goals, L, x - L, r.game_total_over_odds, r.game_total_under_odds)
        if (g) add('Game total', model, g.win, g.units)
      }
    }
    const order = ['Shots under', 'Shots over', 'Moneyline', 'Team goals', 'Game total']
    return Object.values(acc).sort((a, b) => order.indexOf(a.market) - order.indexOf(b.market) || a.model.localeCompare(b.model))
  }, [hist, thr, evThr])

  const posted = rows.filter((r) => n(r.shots_line) !== null).length
  const graded = rows.filter((r) => n(r.actual_shots) !== null).length

  return (
    <div className="plb">
      <div className="plb-head">
        <div>
          <h1>Puck Line Board</h1>
          <div className="plb-sub">{loading ? 'Loading…' : error ? 'Not loaded' : `Updated ${updated} · ${date}`}</div>
        </div>
        <div className="plb-controls">
          <button aria-label="Previous day" onClick={() => shift(-1)}>◀</button>
          <input id="plb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Slate date" />
          <button aria-label="Next day" onClick={() => shift(1)}>▶</button>
          <label htmlFor="plb-thr">Shot edge ≥ <input id="plb-thr" type="number" min={0} max={10} step={0.5} value={thr}
            onChange={(e) => { const v = Number(e.target.value) || 0; setThr(v); saveNum('plb_thr', v) }} /></label>
          <label htmlFor="plb-ev">ML EV ≥ <input id="plb-ev" type="number" min={0} max={50} step={1} value={evThr}
            onChange={(e) => { const v = Number(e.target.value) || 0; setEvThr(v); saveNum('plb_ev', v) }} />%</label>
          <div className="plb-seg" role="group" aria-label="Show">
            <button aria-pressed={!playsOnly} onClick={() => setPlaysOnly(false)}>All games</button>
            <button aria-pressed={playsOnly} onClick={() => setPlaysOnly(true)}>Plays only</button>
          </div>
          <button className="plb-primary" onClick={load} disabled={loading}>Refresh</button>
        </div>
      </div>

      <div className="plb-chips">
        {[[games.length, 'games'], [rows.filter(isShotPlay).length, 'shot plays'], [rows.filter(isMlPlay).length, 'moneyline plays'],
          [`${posted}/${rows.length}`, 'shot lines posted'], [graded ? `${graded / 2} final` : '—', 'results']].map(([b, s]) => (
          <div className="plb-chip" key={String(s)}><b>{b}</b><small>{s}</small></div>))}
      </div>

      {error && <div className="plb-note err">{error}</div>}
      <div className="plb-legend">
        <span><span className="plb-pill under">−2.5</span> model under the line</span>
        <span><span className="plb-pill over">+2.5</span> model over the line</span>
        <span><span className="plb-pill under hit">−3.0</span> outlined = meets your edge</span>
        <span><span className="plb-ev pos hit">+8%</span> moneyline EV meets your threshold</span>
        <span>H/A and L10 are separate models, never blended</span>
      </div>

      {!loading && !error && rows.length === 0 && <div className="plb-note">No projections for this date yet. They&apos;re built at 7:00am ET each game day.</div>}

      {games.map((g) => {
        const hasPlay = g.some((r) => isShotPlay(r) || isMlPlay(r))
        if (playsOnly && !hasPlay) return null
        const a = g.find((r) => r.home_away === 'away') || g[0], h = g.find((r) => r.home_away === 'home') || g[g.length - 1]
        const iso = a.start_time_utc ? String(a.start_time_utc).replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00') : null
        const time = iso && !isNaN(Date.parse(iso)) ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : ''
        const final = n(a.actual_game_goals) !== null
        const tot = n(a.game_total)
        const totPill = (x: unknown) => { const v = n(x); if (v === null || tot === null) return <span className="plb-na">—</span>
          return <span className={`plb-pill ${v - tot < 0 ? 'under' : 'over'}`}>{sgn(v - tot, 2)}</span> }
        return (
          <article key={String(a.game_id)} className={`plb-game${hasPlay ? ' play' : ''}`}>
            <div className="plb-ghead">
              <h2>{a.team_name} @ {h.team_name}</h2>
              <div className="plb-meta">{time}{final && <b style={{ color: '#fff' }}>Final {a.actual_goals}–{h.actual_goals}</b>}
                {a.last_snapshot === 'close' && <span className="plb-tag">closing line</span>}</div>
            </div>
            <div className="plb-scroll"><table>
              <thead>
                <tr><th></th><th className="grp sep" colSpan={6}>Shots on goal</th><th className="grp sep" colSpan={6}>Moneyline</th><th className="grp sep" colSpan={4}>Team goals</th></tr>
                <tr><th>Team</th><th className="sep">Line</th><th>xS H/A</th><th>Δ H/A</th><th>xS L10</th><th>Δ L10</th><th>Actual</th>
                  <th className="sep">Bovada</th><th>xML H/A</th><th>EV H/A</th><th>xML L10</th><th>EV L10</th><th>Result</th>
                  <th className="sep">Line</th><th>xG H/A</th><th>xG L10</th><th>Actual</th></tr>
              </thead>
              <tbody>
                {[a, h].map((r) => (
                  <tr key={String(r.team)}>
                    <td className="team">{r.team_name}<small>{r.home_away}</small>{r.b2b ? <> <span className="plb-tag b2b">B2B</span></> : null}</td>
                    <td className="sep">{n(r.shots_line) === null ? <span className="plb-na">not posted</span> : <>{fmt(r.shots_line)}
                      <div className="plb-move">o{odds(r.shots_over_odds)} u{odds(r.shots_under_odds)}</div>
                      {n(r.shots_first) !== null && n(r.shots_first) !== n(r.shots_line) && <div className="plb-move">first {fmt(r.shots_first)}</div>}</>}</td>
                    <td>{fmt(r.x_shots_ha)}</td><td><Delta v={r.shots_delta_ha} /></td>
                    <td>{fmt(r.x_shots_l10)}</td><td><Delta v={r.shots_delta_l10} /></td>
                    <td>{n(r.actual_shots) === null ? '' : <>{r.actual_shots} <span className="plb-tag">{n(r.shots_line) === null ? '' : (n(r.actual_shots)! > n(r.shots_line)! ? 'over' : n(r.actual_shots)! < n(r.shots_line)! ? 'under' : 'push')}</span></>}</td>
                    <td className="sep">{odds(r.ml_odds)}{n(r.ml_open) !== null && n(r.ml_open) !== n(r.ml_odds) && <div className="plb-move">open {odds(r.ml_open)}</div>}</td>
                    <td>{odds(r.ml_implied_ha)}</td><td><Ev v={r.ml_ev_ha} /></td>
                    <td>{odds(r.ml_implied_l10)}</td><td><Ev v={r.ml_ev_l10} /></td>
                    <td>{r.won === true ? <span className="plb-w">W</span> : r.won === false ? <span className="plb-l">L</span> : ''}</td>
                    <td className="sep">{n(r.team_goals_line) === null ? <span className="plb-na">—</span> : <>{fmt(r.team_goals_line)}
                      <div className="plb-move">o{odds(r.team_goals_over_odds)} u{odds(r.team_goals_under_odds)}</div></>}</td>
                    <td>{fmt(r.x_goals_ha, 2)}</td><td>{fmt(r.x_goals_l10, 2)}</td>
                    <td>{n(r.actual_goals) === null ? '' : String(r.actual_goals)}</td>
                  </tr>))}
              </tbody>
            </table></div>
            <div className="plb-foot">
              <span><span className="plb-lbl">Game total</span><b>{tot === null ? '—' : fmt(tot)}</b>{tot !== null && <span className="plb-move"> o{odds(a.game_total_over_odds)} u{odds(a.game_total_under_odds)}</span>}
                {n(a.total_open) !== null && n(a.total_open) !== tot && <span className="plb-move"> open {fmt(a.total_open)}</span>}</span>
              <span><span className="plb-lbl">xTotal H/A</span><b>{fmt(a.x_game_total_ha, 2)}</b> {totPill(a.x_game_total_ha)}</span>
              <span><span className="plb-lbl">xTotal L10</span><b>{fmt(a.x_game_total_l10, 2)}</b> {totPill(a.x_game_total_l10)}</span>
              {final && <span><span className="plb-lbl">Actual</span><b>{String(a.actual_game_goals)}</b></span>}
            </div>
          </article>)
      })}

      <section className="plb-ledger">
        <h3>Results ledger</h3>
        <div className="plb-legend" style={{ marginBottom: 8 }}>Every graded game this season at your thresholds. Flat 1 unit at Bovada&apos;s posted price.</div>
        <div className="plb-card plb-scroll"><table>
          <thead><tr><th>Bet type</th><th>Model</th><th>Record</th><th>Win %</th><th>Units</th><th>ROI</th></tr></thead>
          <tbody>
            {ledger.length === 0 ? <tr><td colSpan={6} className="plb-na" style={{ textAlign: 'left' }}>No graded games yet. Results appear the morning after each game.</td></tr> :
              ledger.map((x) => { const t = x.w + x.l; return (
                <tr key={x.market + x.model}><td className="team">{x.market}</td><td>{x.model}</td><td>{x.w}-{x.l}{x.p ? `-${x.p}` : ''}</td>
                  <td>{t ? ((100 * x.w) / t).toFixed(1) + '%' : '—'}</td>
                  <td><span className={`plb-ev ${x.u >= 0 ? 'pos' : 'neg'}`}>{sgn(x.u, 2)}</span></td>
                  <td>{t ? sgn((100 * x.u) / t, 1) + '%' : '—'}</td></tr>) })}
          </tbody>
        </table></div>
      </section>
    </div>
  )
}
