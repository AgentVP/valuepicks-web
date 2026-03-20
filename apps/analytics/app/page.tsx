'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { aggregateByBucket } from '@/lib/goalTrackingUtils'
import type { GoalTrackingRow } from '@/lib/goalTrackingUtils'
import BucketChart from './components/BucketChart'

export default function AnalyticsHubPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<GoalTrackingRow[]>([])
  const [dataError, setDataError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!supabase) {
        if (!cancelled) setDataError('Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to apps/analytics/.env.local')
        setAuthChecked(true)
        setLoading(false)
        return
      }
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) {
        router.replace('/login?redirect=/')
        return
      }
      setAuthChecked(true)

      // Fetch Goal Tracking data
      try {
        const res = await fetch('/api/analytics/data', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) {
          if (res.status === 401) {
            router.replace('/login?redirect=/')
            return
          }
          setDataError('Failed to load analytics data')
          setLoading(false)
          return
        }
        const json = await res.json()
        const data = json?.data && Array.isArray(json.data) ? json.data : []
        if (!cancelled) setRows(data)
      } catch {
        if (!cancelled) setDataError('Failed to load analytics data')
      }
      if (!cancelled) setLoading(false)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [router])

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut()
    router.replace('/login')
  }

  if (!authChecked || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[var(--ice)]/80">Loading…</p>
      </div>
    )
  }

  const undersL10 = aggregateByBucket(rows, 'L10', 'under')
  const undersHA = aggregateByBucket(rows, 'HA', 'under')
  const oversL10 = aggregateByBucket(rows, 'L10', 'over')
  const oversHA = aggregateByBucket(rows, 'HA', 'over')

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-[var(--ice)]/70 text-sm mt-0.5">
            Win % by bucket (0 to ±7 in 0.5 steps). Green = &gt;58% win rate.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--ice)] hover:bg-white/10 border border-[var(--card-border)] transition-colors"
        >
          Sign out
        </button>
      </div>

      {dataError && (
        <div className="rounded-xl border border-[var(--loss)]/50 bg-[var(--loss)]/10 text-[var(--loss)] px-4 py-3 mb-6">
          {dataError}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
        <BucketChart title="Unders L10" data={undersL10} betType="under" />
        <BucketChart title="Unders H/A" data={undersHA} betType="under" />
        <BucketChart title="Overs L10" data={oversL10} betType="over" />
        <BucketChart title="Overs H/A" data={oversHA} betType="over" />
      </div>
    </div>
  )
}
