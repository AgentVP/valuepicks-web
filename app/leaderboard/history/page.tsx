'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Row = {
  entrant_name: string
  slate_id: number
  picks: { result: boolean | null }[]
}

type Agg = {
  entrant_name: string
  contestsEntered: number
  wins: number
  losses: number
  winPct: number
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
      .select('entrant_name, slate_id, picks(result)')
    if (error) {
      console.error(error)
      setRows([])
      setLoading(false)
      return
    }
    const list = (entryRows as Row[]) || []
    const byName = new Map<string, { contests: Set<number>; wins: number; losses: number }>()
    for (const row of list) {
      let agg = byName.get(row.entrant_name)
      if (!agg) {
        agg = { contests: new Set(), wins: 0, losses: 0 }
        byName.set(row.entrant_name, agg)
      }
      agg.contests.add(row.slate_id)
      for (const p of row.picks ?? []) {
        if (p.result === true) agg.wins += 1
        if (p.result === false) agg.losses += 1
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
      }
    })
    aggs.sort((a, b) => b.wins - a.wins || b.winPct - a.winPct)
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
        Total wins, contests entered, and win percentage across all contests.
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
