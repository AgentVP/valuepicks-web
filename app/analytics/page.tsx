'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  MODELS, type Model, type Game, type ThresholdRow, breakeven,
  fromHistory, fromLive, fillHistoryTotals, ouThresholds, mlThresholds, mlPriceBuckets, goalsVsLeague, savesAccuracy,
} from '@/lib/analytics'
import './analytics.css'

type Tab = 'shots' | 'moneyline' | 'totals' | 'saves'
const TABS: { key: Tab; label: string }[] = [
  { key: 'shots', label: 'Shots' }, { key: 'moneyline', label: 'Moneyline' }, { key: 'totals', label: 'Goal totals' }, { key: 'saves', label: 'Saves' },
]
const SHOT_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]
const SAVE_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5]
const TOTAL_STEPS = [0, 0.25, 0.5, 0.75, 1, 1.5]
const LEAGUE_STEPS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2]
const EV_STEPS = [0, 5, 10, 15, 20, 25, 30, 40, 50]
const BE = breakeven(-110)

const pct = (v: number | null, d = 1) => (v === null ? '—' : (100 * v).toFixed(d) + '%')
const sgn = (v: number | null, d = 2) => (v === null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d))

function ThresholdTable({ title, model, rows, note, firstCol = 'Threshold' }: { title: string; model: Model; rows: ThresholdRow[]; note?: string; firstCol?: string }) {
  return (
    <section className="pla-card">
      <h3><span><span className={`pla-model ${model}`}>{model === 'l10' ? 'L10' : 'H/A'}</span>{title}</span></h3>
      <div className="pla-scroll"><table>
        <thead><tr><th>{firstCol}</th><th>Bets</th><th>W–L</th><th>Win %</th><th>Conf. 95%</th><th>Units</th><th>ROI</th></tr></thead>
        <tbody>{rows.map((r) => {
          const cls = r.bets === 0 ? 'empty' : r.confidence !== null && r.confidence >= r.breakeven ? 'good' : r.winPct !== null && r.winPct >= 0.58 ? 'ok' : ''
          return (
            <tr key={r.label} className={cls}>
              <td>{r.label}</td><td>{r.bets}</td><td>{r.wins}–{r.losses}{r.pushes ? `–${r.pushes}` : ''}</td>
              <td className="bar"><div className="pla-barwrap">{pct(r.winPct)}
                <span className="pla-bar" aria-hidden="true"><i style={{ width: `${(r.winPct ?? 0) * 100}%` }} /><b style={{ left: `${r.breakeven * 100}%` }} /></span></div></td>
              <td>{pct(r.confidence)}</td>
              <td className={r.units > 0 ? 'pos' : r.units < 0 ? 'neg' : ''}>{r.bets ? sgn(r.units) : '—'}</td>
              <td className={r.roi !== null && r.roi > 0 ? 'pos' : r.roi !== null && r.roi < 0 ? 'neg' : ''}>{r.roi === null ? '—' : sgn(r.roi * 100, 1) + '%'}</td>
            </tr>)
        })}</tbody>
      </table></div>
      {note && <div className="pla-foot">{note}</div>}
    </section>
  )
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('shots')
  const [seasons, setSeasons] = useState<string[]>([])
  const [population, setPopulation] = useState<'all' | 'every' | 'picks'>('all')
  const [venue, setVenue] = useState<'all' | 'home' | 'away'>('all')
  const [mode, setMode] = useState<'cumulative' | 'bucket'>('cumulative')
  const [saveLine, setSaveLine] = useState<'real' | 'standin'>('real')
  const [priceEv, setPriceEv] = useState<number | null>(0)

  useEffect(() => {
    try { const t = localStorage.getItem('pla_tab'); if (t && TABS.some((x) => x.key === t)) setTab(t as Tab) } catch { /* ignore */ }
    (async () => {
      if (!supabase) { setError('Sign-in is not configured.'); setLoading(false); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login?redirect=/analytics'); return }
      try {
        const res = await fetch('/api/analytics', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' })
        if (res.status === 401) { router.replace('/login?redirect=/analytics'); return }
        if (res.status === 403) { setError('Analytics is private to the site owner. The Puck Line Board is open to all members.'); return }
        const json = await res.json()
        if (!res.ok) { setError(json?.error || 'Could not load analytics.'); return }
        const all = [...fillHistoryTotals(fromHistory(json.history || []), json.history || []), ...fromLive(json.live || [])]
        setGames(all)
        setSeasons([...new Set(all.map((g) => g.season))].sort())
      } catch { setError('Could not load analytics. Check your connection and reload.') }
      finally { setLoading(false) }
    })()
  }, [router])

  const allSeasons = useMemo(() => [...new Set(games.map((g) => g.season))].sort(), [games])
  const filtered = useMemo(() => games.filter((g) =>
    seasons.includes(g.season) &&
    (population === 'all' || (population === 'every' ? g.source !== 'history-picks' : g.source === 'history-picks' || g.loggedResult !== null)) &&
    (venue === 'all' || g.homeAway === venue)), [games, seasons, population, venue])

  const pickTab = (t: Tab) => { setTab(t); try { localStorage.setItem('pla_tab', t) } catch { /* ignore */ } }
  const toggleSeason = (s: string) => setSeasons((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

  const shotLine = (side: 'over' | 'under') => (g: Game) => ({ actual: g.shots.actual, line: g.shots.line, odds: side === 'over' ? g.shots.over : g.shots.under })
  const totalLine = (side: 'over' | 'under') => (g: Game) => ({ actual: g.total.actual, line: g.total.line, odds: side === 'over' ? g.total.over : g.total.under })
  const saveLineOf = (side: 'over' | 'under') => (g: Game) => saveLine === 'real'
    ? { actual: g.saves.actual, line: g.saves.line, odds: side === 'over' ? g.saves.over : g.saves.under }
    : { actual: g.saves.actual, line: g.saves.standIn, odds: null }
  const uniqueGames = (gs: Game[]) => { const s = new Set<string>(); return gs.filter((g) => (s.has(g.gameKey) ? false : (s.add(g.gameKey), true))) }

  const counts = useMemo(() => ({
    rows: filtered.length,
    graded: filtered.filter((g) => g.shots.actual !== null && g.shots.line !== null).length,
    live: filtered.filter((g) => g.source === 'live').length,
    first: filtered.reduce((m, g) => (m && m < g.date ? m : g.date), ''),
    last: filtered.reduce((m, g) => (m > g.date ? m : g.date), ''),
  }), [filtered])

  return (
    <div className="pla">
      <div className="pla-head">
        <div>
          <h1>Analytics</h1>
          <div className="pla-sub">How each model performs by edge size. L10 and H/A are always graded separately, never blended. Unders count edges at or below the threshold, overs at or above it.</div>
        </div>
      </div>

      <nav className="pla-tabs" role="tablist" aria-label="Bet type">
        {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => pickTab(t.key)}>{t.label}</button>)}
      </nav>

      <div className="pla-filters">
        <div className="grp"><span className="lbl">Season</span>
          {allSeasons.map((s) => <button key={s} className="pla-chip" aria-pressed={seasons.includes(s)} onClick={() => toggleSeason(s)}>{s}</button>)}</div>
        <div className="grp"><span className="lbl">Rows</span>
          {([['all', 'All rows'], ['every', 'Every game'], ['picks', 'My logged picks']] as const).map(([k, l]) =>
            <button key={k} className="pla-chip" aria-pressed={population === k} onClick={() => setPopulation(k)}>{l}</button>)}</div>
        <div className="grp"><span className="lbl">Team</span>
          {([['all', 'Home + away'], ['home', 'Home'], ['away', 'Away']] as const).map(([k, l]) =>
            <button key={k} className="pla-chip" aria-pressed={venue === k} onClick={() => setVenue(k)}>{l}</button>)}</div>
        {tab !== 'moneyline' && <div className="grp"><span className="lbl">View</span>
          {([['cumulative', 'Cumulative'], ['bucket', 'By bucket']] as const).map(([k, l]) =>
            <button key={k} className="pla-chip" aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}</div>}
      </div>

      {error && <div className="pla-note err">{error}</div>}
      {loading && !error && <div className="pla-note">Loading every graded game…</div>}

      {!loading && !error && (
        <>
          <div className="pla-stats">
            <div className="pla-stat"><b>{counts.rows.toLocaleString()}</b><small>team-games in view</small></div>
            <div className="pla-stat"><b>{counts.graded.toLocaleString()}</b><small>graded vs a shot line</small></div>
            <div className="pla-stat"><b>{counts.live.toLocaleString()}</b><small>from the live 2026-27 feed</small></div>
            <div className="pla-stat"><b>{counts.first ? `${counts.first.slice(5)}/${counts.first.slice(2, 4)}` : '—'} → {counts.last ? `${counts.last.slice(5)}/${counts.last.slice(2, 4)}` : '—'}</b><small>date range</small></div>
          </div>
          <div className="pla-legend">
            <span><i className="pla-sw" style={{ background: 'rgba(34,197,94,.35)' }} />95% confidence clears break-even at the prices bet ({pct(BE)} at −110)</span>
            <span><i className="pla-sw" style={{ background: 'rgba(34,197,94,.14)' }} />Win % 58% or better</span>
            <span>White tick on each bar = break-even</span>
            <span>Units: flat 1u at the posted price (−110 when no price was recorded)</span>
          </div>

          {tab === 'shots' && (
            <div className="pla-grid">
              {(['under', 'over'] as const).flatMap((side) => MODELS.map((m) => (
                <ThresholdTable key={side + m.key} model={m.key} title={side === 'under' ? 'Shot unders' : 'Shot overs'}
                  rows={ouThresholds(filtered, side, (g) => g.shots.delta[m.key], shotLine(side), SHOT_STEPS, mode)} />)))}
            </div>
          )}

          {tab === 'moneyline' && (
            <>
              <div className="pla-note">Before October 2026 the workbook made one moneyline number, from its own goals model, so those games appear under H/A only. From October 2026 on, both models price every game.</div>
              <div className="pla-filters">
                <div className="grp"><span className="lbl">By price · include</span>
                  {([[null, 'Every team'], [0, 'Model EV ≥ 0%'], [5, 'EV ≥ 5%'], [10, 'EV ≥ 10%']] as const).map(([k, l]) =>
                    <button key={String(k)} className="pla-chip" aria-pressed={priceEv === k} onClick={() => setPriceEv(k)}>{l}</button>)}
                </div>
              </div>
              {(['favorite', 'underdog'] as const).map((side) => (
                <div className="pla-grid" key={'price' + side}>
                  {MODELS.map((m) => <ThresholdTable key={m.key} model={m.key}
                    title={side === 'favorite' ? 'Favorites by price' : 'Underdogs by price'}
                    rows={mlPriceBuckets(filtered, m.key, priceEv, side)} firstCol="Posted price"
                    note={priceEv === null ? 'Every team at that price, model or not: the market baseline. Both tables match in this view.' : `Only teams the model rated at EV ≥ ${priceEv}%, grouped by the posted price.`} />)}
                </div>))}
              {(['all', 'favorite', 'underdog'] as const).map((side) => (
                <div className="pla-grid" key={side}>
                  {MODELS.map((m) => <ThresholdTable key={m.key} model={m.key}
                    title={side === 'all' ? 'Moneyline · all picks' : side === 'favorite' ? 'Moneyline · favorites' : 'Moneyline · underdogs'}
                    rows={mlThresholds(filtered, m.key, EV_STEPS, side)} note="Bet the team when the model's EV against the posted price is at or above the threshold." />)}
                </div>))}
            </>
          )}

          {tab === 'totals' && (
            <>
              <div className="pla-grid">
                {(['under', 'over'] as const).flatMap((side) => MODELS.map((m) => (
                  <ThresholdTable key={side + m.key} model={m.key} title={side === 'under' ? 'Game total unders' : 'Game total overs'}
                    rows={ouThresholds(uniqueGames(filtered), side, (g) => (g.total.x[m.key] === null || g.total.line === null ? null : (g.total.x[m.key] as number) - g.total.line), totalLine(side), TOTAL_STEPS, mode)}
                    note="Projected game total minus the posted total. Few historical games have a logged total line; live games all do." />)))}
              </div>
              <div className="pla-grid">
                {MODELS.map((m) => {
                  const hi = goalsVsLeague(filtered, m.key, LEAGUE_STEPS, 'high'), lo = goalsVsLeague(filtered, m.key, LEAGUE_STEPS, 'low')
                  return (
                    <section className="pla-card" key={m.key}>
                      <h3><span><span className={`pla-model ${m.key}`}>{m.label}</span>Projected total vs league average</span>
                        <small>league avg {hi.leagueAvg === null ? '—' : hi.leagueAvg.toFixed(2)} goals</small></h3>
                      <div className="pla-scroll"><table>
                        <thead><tr><th>Projection vs avg</th><th>Games</th><th>Avg actual</th><th>% above avg</th><th>Avg proj. delta</th></tr></thead>
                        <tbody>{[...lo.rows.slice().reverse(), ...hi.rows].map((r, i) => (
                          <tr key={r.label + i} className={r.games === 0 ? 'empty' : ''}>
                            <td>{r.label}</td><td>{r.games}</td><td>{r.avgActual === null ? '—' : r.avgActual.toFixed(2)}</td>
                            <td>{pct(r.pctAboveAvg)}</td><td>{sgn(r.avgDelta)}</td></tr>))}</tbody>
                      </table></div>
                      <div className="pla-foot">Do games the model projects high actually score more? Works without betting lines, so it covers all history.</div>
                    </section>)
                })}
              </div>
            </>
          )}

          {tab === 'saves' && (
            <>
              <div className="pla-filters">
                <div className="grp"><span className="lbl">Grade against</span>
                  <button className="pla-chip" aria-pressed={saveLine === 'real'} onClick={() => setSaveLine('real')}>Real saves lines</button>
                  <button className="pla-chip" aria-pressed={saveLine === 'standin'} onClick={() => setSaveLine('standin')}>Stand-in line (opp. shot line × 0.90)</button>
                </div>
              </div>
              <div className="pla-stats">
                {MODELS.map((m) => { const a = savesAccuracy(filtered, m.key); return (
                  <div className="pla-stat" key={m.key}><b>{a.mae === null ? '—' : a.mae.toFixed(2)}</b>
                    <small>{m.label} avg miss, saves ({a.n} games{a.bias === null ? '' : `, bias ${sgn(a.bias)}`})</small></div>) })}
              </div>
              {saveLine === 'real' && filtered.every((g) => g.saves.line === null) &&
                <div className="pla-note">No saves lines have been recorded yet. Bovada hasn&apos;t posted goalie saves props so far; the 12:01am, 9:30 and 10:30 pulls and the closing pull pick them up as soon as they appear. Switch to the stand-in line to use history.</div>}
              <div className="pla-grid">
                {(['under', 'over'] as const).flatMap((side) => MODELS.map((m) => (
                  <ThresholdTable key={side + m.key} model={m.key} title={side === 'under' ? 'Saves unders' : 'Saves overs'}
                    rows={ouThresholds(filtered, side, (g) => { const L = saveLine === 'real' ? g.saves.line : g.saves.standIn; return g.saves.x[m.key] === null || L === null ? null : (g.saves.x[m.key] as number) - L }, saveLineOf(side), SAVE_STEPS, mode)}
                    note={saveLine === 'standin' ? 'Stand-in line, not a real price: graded at −110. Use it to compare the models, not to size bets.' : undefined} />)))}
              </div>
              <div className="pla-note">History before October 2026 has one saves projection (the workbook&apos;s), shown under H/A. The L10 saves model fills in from the live season.</div>
            </>
          )}
        </>
      )}
    </div>
  )
}
