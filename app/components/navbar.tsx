'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Scoreboard from './Scoreboard'

export default function Navbar() {
  const pathname = usePathname()

  const base =
    'px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200'
  const active = 'bg-[var(--accent)] text-[var(--background)]'
  const inactive =
    'text-[var(--ice)]/90 hover:bg-white/10 hover:text-white'

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="text-lg font-bold text-white tracking-tight hover:text-[var(--accent)] transition-colors"
        >
          🏒 ValuePicks
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/contest"
            className={`${base} ${pathname === '/contest' ? active : inactive}`}
          >
            Contest
          </Link>
          <Link
            href="/today"
            className={`${base} ${pathname === '/today' ? active : inactive}`}
          >
            Today
          </Link>
          <Link
            href="/leaderboard"
            className={`${base} ${pathname === '/leaderboard' ? active : inactive}`}
          >
            Leaderboard
          </Link>
          <Link
            href="/leaderboard/history"
            className={`${base} ${pathname === '/leaderboard/history' ? active : inactive}`}
          >
            All-Time
          </Link>
          <Link
            href="/history"
            className={`${base} ${pathname === '/history' || pathname?.startsWith('/history/') ? active : inactive}`}
          >
            History
          </Link>
          <Link
            href="/analytics"
            className={`${base} ${pathname === '/analytics' || pathname?.startsWith('/analytics') ? active : inactive}`}
          >
            Analytics
          </Link>
        </nav>
      </div>
      <Scoreboard />
    </div>
  )
}
