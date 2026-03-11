'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/analytics'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (err) {
        setError(err.message || 'Invalid email or password')
        return
      }
      if (data.session) router.push(redirect)
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-lg">
        <h1 className="text-xl font-bold text-white mb-1">ValuePicks Analytics</h1>
        <p className="text-sm text-[var(--ice)]/70 mb-6">
          Sign in to view shot bet analytics.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--ice)]/90 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white placeholder-[var(--ice)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--ice)]/90 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white placeholder-[var(--ice)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="text-sm text-[var(--loss)] font-medium">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-[var(--accent)] text-[var(--background)] font-semibold hover:bg-[var(--accent-dim)] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--ice)]/60">
          <Link href="/" className="hover:text-[var(--accent)]">
            ← Back to ValuePicks
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function AnalyticsLoginPage() {
  return (
    <Suspense fallback={
      <div className="max-w-sm mx-auto mt-12 flex justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
