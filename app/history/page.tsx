'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Slate = { slate_date: string }

export default function HistoryPage() {
  const [dates, setDates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data, error } = await supabase
      .from('slates')
      .select('slate_date')
      .order('slate_date', { ascending: false })
      .limit(60)
    if (error) {
      console.error(error)
      setDates([])
    } else {
      setDates((data as Slate[] || []).map((s) => s.slate_date))
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
      <h1 className="text-3xl font-bold text-white mb-2">Past Contests</h1>
      <p className="text-[var(--ice)]/70 text-sm mb-6">
        Select a date to view that day&apos;s games, picks, and leaderboard.
      </p>
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <ul className="divide-y divide-[var(--card-border)]">
          {dates.map((d) => {
            const label = new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
            return (
              <li key={d}>
                <Link
                  href={`/history/${d}`}
                  className="block p-4 hover:bg-white/5 transition-colors text-white font-medium"
                >
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
