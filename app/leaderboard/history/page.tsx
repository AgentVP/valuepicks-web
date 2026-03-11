'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Row = {
  entrant_name: string
  slate_id: number
  picks: { result: boolean | null; decimal_odds: number | null }[]
}

type Agg = {
  entrant_name: string
  contestsEntered: number
  wins: number
  losses: number
  winPct: number
  earnings: number
}

const ENTRY_FEE = 5

function parlayMultiplier(picks: { decimal_odds: number | null }[]): number | null {
  const withOdds = picks.filter((p) => p.decimal_odds != null && p.decimal_odds > 0)
  if (withOdds.length === 0) return null
  const product = withOdds.reduce((acc, p) => acc * (p.decimal_odds ?? 1), 1)
  return Math.round(product * 100) / 100
}

export default function HistoryLeaderboardPage() {
  const [rows, setRows] = useState<Agg[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data: entryRows, error } = await supabase
      .from('entries')
      .select('entrant_name, slate_id, picks(result, decimal_odds)')
    if (error) {
      console.error(error)
      setRows([])
      setLoading(false)
      return
    }
    const list = (entryRows as Row[]) || []

    // Group entries by slate to compute winners & pot per contest
    const bySlate = new Map<number, Row[]>()
    for (const row of list) {
      if (!bySlate.has(row.slate_id)) bySlate.set(row.slate_id, [])
      bySlate.get(row.slate_id)!.push(row)
    }

    // Aggregate wins/losses and earnings per entrant
    const byName = new Map<
      string,
      { contests: Set<number>; wins: number; losses: number; earnings: number }
    >()

    for (const [slateId, rowsForSlate] of bySlate.entries()) {
      if (rowsForSlate.length === 0) continue
      const wins = (p: Row['picks']) => p.filter((x) => x.result === true).length

      let maxWins = 0
      for (const r of rowsForSlate) {
        const w = wins(r.picks)
        if (w > maxWins) maxWins = w
      }
      const topByWins = rowsForSlate.filter((r) => wins(r.picks) === maxWins)
      let maxParlay = 0
      for (const r of topByWins) {
        const pm = parlayMultiplier(r.picks) ?? 0
        if (pm > maxParlay) maxParlay = pm
      }
      const winners = rowsForSlate.filter(
        (r) => wins(r.picks) === maxWins && (parlayMultiplier(r.picks) ?? 0) === maxParlay,
      )

      const pot = rowsForSlate.length * ENTRY_FEE
      const perWinner = winners.length > 0 ? pot / winners.length : 0

      for (const row of rowsForSlate) {
        let agg = byName.get(row.entrant_name)
        if (!agg) {
          agg = { contests: new Set(), wins: 0, losses: 0, earnings: 0 }
          byName.set(row.entrant_name, agg)
        }
        agg.contests.add(slateId)
        for (const p of row.picks ?? []) {
          if (p.result === true) agg.wins += 1
          if (p.result === false) agg.losses += 1
        }
        if (winners.some((w) => w.entrant_name === row.entrant_name)) {
          agg.earnings += perWinner
        }
      }
    }

    const aggs: Agg[] = Array.from(byName.entries()).map(([entrant_name, a]) => {
      const total = a.wins + a.losses
      const winPct = total > 0 ? Math.round((a.wins / total) * 1000) / 10 : 0
      return {
        entrant_name,
        contestsEntered: a.contests.size,
        wins: a.wins,
        losses: a.losses,
        winPct,
        earnings: Math.round(a.earnings * 100) / 100,
      }
    })
    aggs.sort((a, b) => b.earnings - a.earnings || b.wins - a.wins || b.winPct - a.winPct)
    setRows(aggs)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-8 text-[var(--ice)]/70">
        Loading…
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">All-Time Leaderboard</h1>
      <p className="text-[var(--ice)]/70 text-sm mb-6">
        Total wins, contests entered, win percentage, and estimated earnings across all contests
        (assuming ${ENTRY_FEE.toFixed(2)} per entry, winner-take-all split among tied winners).
      </p>
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--card-border)] text-[var(--ice)]/80 text-sm">
              <th className="p-3 font-semibold">#</th>
              <th className="p-3 font-semibold">Name</th>
              <th className="p-3 font-semibold text-right">Contests</th>
              <th className="p-3 font-semibold text-right">W</th>
              <th className="p-3 font-semibold text-right">L</th>
              <th className="p-3 font-semibold text-right">Win %</th>
              <th className="p-3 font-semibold text-right">Earnings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.entrant_name}
                className="border-b border-[var(--card-border)]/50 last:border-0"
              >
                <td className="p-3 text-[var(--ice)]/70 font-medium">{i + 1}</td>
                <td className="p-3 font-semibold text-white">{r.entrant_name}</td>
                <td className="p-3 text-right text-[var(--ice)]">{r.contestsEntered}</td>
                <td className="p-3 text-right text-[var(--win)] font-semibold">{r.wins}</td>
                <td className="p-3 text-right text-[var(--loss)] font-semibold">{r.losses}</td>
                <td className="p-3 text-right font-semibold text-[var(--accent)]">{r.winPct}%</td>
                <td className="p-3 text-right font-semibold text-[var(--accent)]">
                  ${r.earnings.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
