'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Scoreboard from './Scoreboard'

const LINKS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: '/contest', label: 'Contest', match: (p) => p === '/contest' },
  { href: '/today', label: 'Today', match: (p) => p === '/today' },
  { href: '/leaderboard', label: 'Leaderboard', match: (p) => p === '/leaderboard' },
  { href: '/leaderboard/history', label: 'All-Time', match: (p) => p === '/leaderboard/history' },
  { href: '/history', label: 'History', match: (p) => p === '/history' || p.startsWith('/history/') },
  { href: '/board', label: 'Board', match: (p) => p === '/board' },
  { href: '/analytics', label: 'Analytics', match: (p) => p === '/analytics' },
]

export default function Navbar() {
  const pathname = usePathname() || ''
  const navRef = useRef<HTMLElement>(null)

  // On phones the tabs scroll sideways: keep the current page's tab in view.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [pathname])

  const base = 'shrink-0 px-3 py-2 md:px-4 md:py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 whitespace-nowrap'
  const active = 'bg-[var(--accent)] text-[var(--background)]'
  const inactive = 'text-[var(--ice)]/90 hover:bg-white/10 hover:text-white'

  return (
    <div className="flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4 px-4 pt-3 pb-2 md:py-3">
        <Link href="/" className="text-lg font-bold text-white tracking-tight hover:text-[var(--accent)] transition-colors shrink-0">
          🏒 ValuePicks
        </Link>
        <nav ref={navRef} aria-label="Main"
          className="flex items-center gap-1 md:gap-2 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar">
          {LINKS.map((l) => {
            const on = l.match(pathname)
            return (
              <Link key={l.href} href={l.href} aria-current={on ? 'page' : undefined} className={`${base} ${on ? active : inactive}`}>
                {l.label}
              </Link>)
          })}
        </nav>
      </div>
      {/* Phones already get the live scores in the bottom ticker; keep the sticky header short there. */}
      <div className="hidden md:block">
        <Scoreboard />
      </div>
    </div>
  )
}
