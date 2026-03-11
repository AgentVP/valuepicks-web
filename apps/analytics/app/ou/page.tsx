'use client'

import Link from 'next/link'

export default function OuPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/" className="text-sm text-[var(--ice)]/70 hover:text-[var(--accent)]">
        ← Analytics
      </Link>
      <h1 className="text-2xl font-bold text-white mt-3">O/U</h1>
      <p className="text-[var(--ice)]/70 mt-2">
        Coming soon.
      </p>
    </div>
  )
}

