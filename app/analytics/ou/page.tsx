'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

export default function OUAnalyticsPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) {
        router.replace('/analytics/login?redirect=/analytics/ou')
        return
      }
      setAuthChecked(true)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [router])

  if (!authChecked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/analytics"
        className="text-sm text-[var(--ice)]/70 hover:text-[var(--accent)]"
      >
        ← Analytics
      </Link>
      <h1 className="text-2xl font-bold text-white mt-2">O/U</h1>
      <p className="text-[var(--ice)]/70 text-sm mt-1 mb-6">
        Over/under (goals, totals) analytics are coming soon.
      </p>
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]/60 p-8 text-center text-[var(--ice)]/60">
        Coming soon
      </div>
    </div>
  )
}
