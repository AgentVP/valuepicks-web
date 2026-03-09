import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="max-w-xl mx-auto text-center py-12">
      <h1 className="text-4xl font-bold text-white mb-3">ValuePicks</h1>
      <p className="text-[var(--ice)]/80 text-lg mb-8">
        Daily NHL pick contest with friends. Pick winners, add odds for the tiebreaker.
      </p>
      <Link
        href="/contest"
        className="inline-block px-8 py-4 rounded-xl bg-[var(--accent)] text-[var(--background)] font-bold text-lg hover:bg-[var(--accent-dim)] transition-colors"
      >
        Enter today&apos;s contest →
      </Link>
      <div className="mt-12 flex justify-center gap-6 text-sm">
        <Link href="/today" className="text-[var(--ice)]/70 hover:text-[var(--accent)] transition-colors">
          Today&apos;s picks
        </Link>
        <Link href="/leaderboard" className="text-[var(--ice)]/70 hover:text-[var(--accent)] transition-colors">
          Leaderboard
        </Link>
      </div>
    </div>
  )
}
