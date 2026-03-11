'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

const SECTIONS = [
  {
    href: '/shot-bets',
    title: 'Shot Bets',
    description: 'Over/under shot totals by model (L10, H/A). Cumulative win rates and confidence.',
    available: true,
  },
  {
    href: '/moneyline',
    title: 'Moneyline',
    description: 'Moneyline bet performance by model and context.',
    available: false,
  },
  {
    href: '/ou',
    title: 'O/U',
    description: 'Over/under (goals, totals) analytics by model.',
    available: false,
  },
  {
    href: '/save-bets',
    title: 'Save Bets',
    description: 'Save bet (goalie) performance and win rates.',
    available: false,
  },
] as const

export default function AnalyticsHubPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) {
        router.replace('/login?redirect=/')
        return
      }
      setAuthChecked(true)
      setLoading(false)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [router])

  async function handleSignOut() {
    await supabase.auth.signOut()
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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-[var(--ice)]/70 text-sm mt-0.5">
            Pick a bet type to view charts and winning percentages by model.
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

      <nav className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.available ? section.href : '#'}
            className={`rounded-xl border overflow-hidden transition-all duration-200 block text-left ${
              section.available
                ? 'border-[var(--card-border)] bg-[var(--card)] hover:border-[var(--accent)]/50 hover:bg-[var(--card)]/90 card-hover'
                : 'border-[var(--card-border)]/60 bg-[var(--card)]/60 opacity-75 cursor-default'
            }`}
            onClick={(e) => {
              if (!section.available) e.preventDefault()
            }}
          >
            <div className="p-5">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{section.title}</h2>
                {!section.available && (
                  <span className="text-xs font-medium text-[var(--ice)]/60 bg-white/10 px-2 py-0.5 rounded">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--ice)]/70 mt-1.5">
                {section.description}
              </p>
              {section.available && (
                <span className="inline-block mt-3 text-sm font-medium text-[var(--accent)]">
                  View charts →
                </span>
              )}
            </div>
          </Link>
        ))}
      </nav>
    </div>
  )
}

