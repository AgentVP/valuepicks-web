'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { bandOf, bandLabel, type BucketStats } from '@/lib/shotBuckets'
import { estSavesLine } from '@/lib/linkedBets'
import './board.css'

/**
 * Puck Line Board: a view-only summary of each game and where the models see an advantage.
 * - Shots: a model's projection is highlighted when its bucket (same side, same half-shot band) has won more than 57% historically.
 * - Moneyline: EV against Bovada's price, green at +5% or better.
 * - Team goals / game total / saves: model minus the line, green when the edge clears the market's threshold below.
 */
type Row = Record<string, string | number | boolean | null>
type ShotModel = 'ha' | 'l10'

const BUCKET_WIN = 0.57      // bucket win % that highlights a shot projection
const BUCKET_MIN_BETS = 20   // ignore buckets with too little history to mean anything
const EV_GREEN = 0.05
const EDGE = { goals: 0.3, total: 0.5, saves: 1.5 }

const etToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))
const fmt = (v: unknown, d = 1) => (n(v) === null ? '—' : (n(v) as number).toFixed(d))
const sgn = (v: number | null, d = 1) => (v === null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d))
const odds = (o: unknown) => { const x = n(o); return x === null ? '—' : x > 0 ? `+${x}` : String(x) }

export default function PuckLineBoard() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [date, setDate] = useState(etToday())
  const [rows, setRows] = useState<Row[]>([])
  const [buckets, setBuckets] = useState<BucketStats>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updated, setUpdated] = useState('')

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
      setRows(json.rows || []); setBuckets(json.buckets || {}); setError(null)
      setUpdated(new Date(json.loadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
    } catch { setError('Could not load the board. Check your connection and press Refresh.') }
    finally { setLoading(false) }
  }, [token, date, router])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden && date === etToday()) load() }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [load, date])

  /** Bucket for a model's shot delta. Buckets were graded on the original shot formula, so look up that delta when present. */
  const bucketOf = (model: ShotModel, r: Row) => {
    const d = n(r[`shots_delta_${model}_excel`]) ?? n(r[`shots_delta_${model}`])
    if (d === null || d === 0) return null
    const side = d < 0 ? 'under' : 'over', band = bandOf(d), st = buckets[`${model}|${side}|${band}`] || { w: 0, l: 0 }
    const total = st.w + st.l, pct = total ? st.w / total : null
    return { side, total, w: st.w, pct, label: bandLabel(band, side), hit: total >= BUCKET_MIN_BETS && pct !== null && pct > BUCKET_WIN }
  }

  const games = useMemo(() => {
    const m = new Map<number, Row[]>()
    for (const r of rows) { const g = Number(r.game_id); if (!m.has(g)) m.set(g, []); m.get(g)!.push(r) }
    return [...m.values()]
  }, [rows])
  const shift = (days: number) => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + days); setDate(d.toISOString().slice(0, 10)) }

  /** Model projection with its delta vs the line; the whole cell lights up when that model's bucket is over 57%. */
  const ShotCell = ({ r, model }: { r: Row; model: ShotModel }) => {
    const x = n(r[`x_shots_${model}`]), d = n(r[`shots_delta_${model}`]), b = bucketOf(model, r)
    if (x === null) return <td className="plb-na">—</td>
    return (
      <td className={b?.hit ? 'plb-hitcell' : ''}
        title={b ? `${b.label} ${b.side}s bucket: ${b.w}-${b.total - b.w}${b.pct === null ? '' : ` (${(b.pct * 100).toFixed(0)}%)`}` : undefined}>
        {x.toFixed(1)} {d !== null && <span className={`plb-pill ${d < 0 ? 'under' : 'over'}`}>{sgn(d)}</span>}
        {b && b.total > 0 && <small className="plb-bktpct">{((b.pct ?? 0) * 100).toFixed(0)}%</small>}
        {b?.hit && <div className="plb-hitlbl">{b.side === 'under' ? 'Under' : 'Over'} · {b.total} bets</div>}
      </td>)
  }
  /** O/U edge: model minus line, green when it clears the threshold. */
  const Edge = ({ x, line, min, d = 2 }: { x: unknown; line: number | null; min: number; d?: number }) => {
    const v = n(x); if (v === null) return <td className="plb-na">—</td>
    if (line === null) return <td>{v.toFixed(d)}</td>
    const e = v - line, hit = Math.abs(e) >= min
    return <td>{v.toFixed(d)} <span className={`plb-edge${hit ? ' hit' : ''}`}>{hit ? (e > 0 ? 'O ' : 'U ') : ''}{sgn(e, d)}</span></td>
  }
  const Ev = ({ v }: { v: unknown }) => {
    const e = n(v); if (e === null) return <td className="plb-na">—</td>
    return <td><span className={`plb-ev ${e > 0 ? 'pos' : 'neg'}${e >= EV_GREEN ? ' hit' : ''}`}>{sgn(e * 100, 0)}%</span></td>
  }

  const posted = rows.filter((r) => n(r.shots_line) !== null).length
  const flagged = rows.reduce((c, r) => c + (['ha', 'l10'] as const).filter((m) => bucketOf(m, r)?.hit).length, 0)

  return (
    <div className="plb">
      <div className="plb-head">
        <div>
          <h1>Puck Line Board</h1>
          <div className="plb-sub">{loading ? 'Loading…' : error ? 'Not loaded' : `Updated ${updated} · ${date}`}</div>
        </div>
        <div className="plb-controls">
          <button aria-label="Previous day" onClick={() => shift(-1)}>◀</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Slate date" />
          <button aria-label="Next day" onClick={() => shift(1)}>▶</button>
          <button className="plb-primary" onClick={load} disabled={loading}>Refresh</button>
        </div>
      </div>

      <div className="plb-chips">
        {[[games.length, 'games'], [`${posted}/${rows.length}`, 'shot lines posted'], [flagged, 'shot projections in 57%+ buckets']].map(([b, s]) => (
          <div className="plb-chip" key={String(s)}><b>{b}</b><small>{s}</small></div>))}
      </div>

      {error && <div className="plb-note err">{error}</div>}
      <div className="plb-legend">
        <span><span className="plb-hitcell plb-swatch">28.4</span> that model&apos;s shot bucket has won over 57% (20+ bets)</span>
        <span><span className="plb-ev pos hit">+8%</span> moneyline EV +5% or better</span>
        <span><span className="plb-edge hit">O +0.45</span> goals, total or saves edge past the line (goals 0.3, total 0.5, saves 1.5)</span>
        <span>H/A and L10 are separate models, never blended</span>
      </div>

      {!loading && !error && rows.length === 0 && <div className="plb-note">No projections for this date yet. They&apos;re built at 7:00am ET each game day.</div>}

      {games.map((g) => {
        const a = g.find((r) => r.home_away === 'away') || g[0], h = g.find((r) => r.home_away === 'home') || g[g.length - 1]
        const iso = a.start_time_utc ? String(a.start_time_utc).replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00') : null
        const time = iso && !isNaN(Date.parse(iso)) ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : ''
        const final = n(a.actual_game_goals) !== null
        const tot = n(a.game_total)
        const hasHit = g.some((r) => bucketOf('ha', r)?.hit || bucketOf('l10', r)?.hit)
        return (
          <article key={String(a.game_id)} className={`plb-game${hasHit ? ' play' : ''}`}>
            <div className="plb-ghead">
              <h2>{a.team_name} @ {h.team_name}</h2>
              <div className="plb-meta">{time}{final && <b style={{ color: '#fff' }}>Final {a.actual_goals}–{h.actual_goals}</b>}</div>
            </div>
            <div className="plb-scroll"><table>
              <thead>
                <tr><th></th><th className="grp sep" colSpan={4}>Shots on goal</th><th className="grp sep" colSpan={3}>Moneyline</th>
                  <th className="grp sep" colSpan={3}>Team goals</th><th className="grp sep" colSpan={3}>Goalie saves</th></tr>
                <tr><th>Team</th><th className="sep">Line</th><th>H/A</th><th>L10</th><th>Actual</th>
                  <th className="sep">Bovada</th><th>EV H/A</th><th>EV L10</th>
                  <th className="sep">Line</th><th>xG H/A</th><th>xG L10</th>
                  <th className="sep" title="This team's goalie. est = the other team's shot line x 0.9 until Bovada posts the goalie">Line</th><th>xSv H/A</th><th>xSv L10</th></tr>
              </thead>
              <tbody>
                {[a, h].map((r) => {
                  const opp = r === a ? h : a
                  const sv = n(r.saves_line) ?? estSavesLine(n(opp.shots_line)), svEst = n(r.saves_line) === null && sv !== null
                  const gl = n(r.team_goals_line)
                  return (
                    <tr key={String(r.team)}>
                      <td className="team">{r.team_name}<small>{r.home_away}</small>{r.b2b ? <> <span className="plb-tag b2b">B2B</span></> : null}</td>
                      <td className="sep">{n(r.shots_line) === null ? <span className="plb-na">not posted</span> : fmt(r.shots_line)}</td>
                      <ShotCell r={r} model="ha" /><ShotCell r={r} model="l10" />
                      <td>{n(r.actual_shots) === null ? '' : String(r.actual_shots)}</td>
                      <td className="sep">{odds(r.ml_odds)}{r.won === true ? <> <span className="plb-w">W</span></> : r.won === false ? <> <span className="plb-l">L</span></> : null}</td>
                      <Ev v={r.ml_ev_ha} /><Ev v={r.ml_ev_l10} />
                      <td className="sep">{gl === null ? <span className="plb-na">—</span> : fmt(gl)}{n(r.actual_goals) !== null && <small className="plb-act"> ({String(r.actual_goals)})</small>}</td>
                      <Edge x={r.x_goals_ha} line={gl} min={EDGE.goals} /><Edge x={r.x_goals_l10} line={gl} min={EDGE.goals} />
                      <td className="sep">{sv === null ? <span className="plb-na">—</span> : <>{sv.toFixed(1)}{svEst && <small className="plb-est"> est</small>}</>}
                        {r.goalie ? <div className="plb-move">{String(r.goalie)}</div> : null}{n(r.actual_saves) !== null && <small className="plb-act"> ({String(r.actual_saves)})</small>}</td>
                      <Edge x={r.x_saves_ha} line={sv} min={EDGE.saves} d={1} /><Edge x={r.x_saves_l10} line={sv} min={EDGE.saves} d={1} />
                    </tr>)
                })}
              </tbody>
            </table></div>
            <div className="plb-foot">
              <span><span className="plb-lbl">Game total</span><b>{tot === null ? '—' : fmt(tot)}</b></span>
              {(['ha', 'l10'] as const).map((m) => { const x = n(a[`x_game_total_${m}`]); const e = x === null || tot === null ? null : x - tot
                return <span key={m}><span className="plb-lbl">x{m === 'ha' ? 'H/A' : 'L10'}</span><b>{fmt(x, 2)}</b>
                  {e !== null && <> <span className={`plb-edge${Math.abs(e) >= EDGE.total ? ' hit' : ''}`}>{Math.abs(e) >= EDGE.total ? (e > 0 ? 'O ' : 'U ') : ''}{sgn(e, 2)}</span></>}</span> })}
              {final && <span><span className="plb-lbl">Actual</span><b>{String(a.actual_game_goals)}</b></span>}
            </div>
          </article>)
      })}
    </div>
  )
}
