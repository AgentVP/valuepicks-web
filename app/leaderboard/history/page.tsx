'use client'

import { useEffect, useState } from 'react'

type Agg = {
  entrant_name: string
  contestsEntered: number
  wins: number
  losses: number
  winPct: number
  earnings: number
}

const ENTRY_FEE = 5

export default function HistoryLeaderboardPage() {
  const [rows, setRows] = useState<Agg[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/leaderboard/history')
      const json = await res.json()
      setRows((json.aggs as Agg[]) ?? [])
    } catch (e) {
      console.error(e)
      setRows([])
    }
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
