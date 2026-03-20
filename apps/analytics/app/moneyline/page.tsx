'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { aggregateMoneylineByBucket, formatEvBucket } from '@/lib/moneylineUtils'
import type { MoneylineRow } from '@/lib/moneylineUtils'
import BucketChart from '../components/BucketChart'

export default function MoneylinePage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<MoneylineRow[]>([])
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
        router.replace('/login?redirect=/moneyline')
        return
      }
      setAuthChecked(true)

      try {
        const res = await fetch('/api/analytics/data', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) {
          if (res.status === 401) {
            router.replace('/login?redirect=/moneyline')
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

  if (!authChecked || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[var(--ice)]/80">Loading…</p>
      </div>
    )
  }

  const favorites = aggregateMoneylineByBucket(rows, 'favorite')
  const underdogs = aggregateMoneylineByBucket(rows, 'underdog')

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/" className="text-[var(--ice)]/70 hover:text-[var(--accent)] text-sm">
              ← Analytics
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-white">Moneyline</h1>
          <p className="text-[var(--ice)]/70 text-sm mt-0.5">
            Win % by EV % bucket (0-5% to 70%+). Favorites vs underdogs from Goal Tracking. Green = &gt;58% win rate.
          </p>
        </div>
      </div>

      {dataError && (
        <div className="rounded-xl border border-[var(--loss)]/50 bg-[var(--loss)]/10 text-[var(--loss)] px-4 py-3 mb-6">
          {dataError}
        </div>
      )}

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-4">Favorites</h2>
        <p className="text-[var(--ice)]/60 text-sm mb-4">
          GameLine -110 and below. EV % buckets 0-5% to 70%+. Row and Win % highlighted in green when Win % &gt;58%.
        </p>
        <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-1">
          <BucketChart title="Favorites by EV %" data={favorites} betType="over" bucketLabel={formatEvBucket} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Underdogs</h2>
        <p className="text-[var(--ice)]/60 text-sm mb-4">
          GameLine -105 and above. EV % buckets 0-5% to 70%+. Row and Win % highlighted in green when Win % &gt;58%.
        </p>
        <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-1">
          <BucketChart title="Underdogs by EV %" data={underdogs} betType="under" bucketLabel={formatEvBucket} />
        </div>
      </section>
    </div>
  )
}
