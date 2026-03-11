'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type BucketRow = {
  label: string
  bets: number
  wins: number
  losses: number
  winPct: number
  confidence95: number
}

type AnalyticsTable = {
  model: string
  betType: string
  title: string
  rows: BucketRow[]
}

const WIN_PCT_HIGHLIGHT = 58

function AnalyticsTableCard({ table }: { table: AnalyticsTable }) {
  const betLabel = table.betType === 'under' ? 'Under' : 'Over'
  const prefix = table.model === 'L10' ? 'L10 ' : ''

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden shadow-lg">
      <h2 className="text-lg font-bold text-white text-center py-3 border-b border-[var(--card-border)] bg-[var(--card)]/80">
        {table.title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--card-border)] bg-[var(--background)]/50">
              <th className="text-left py-2.5 px-3 text-[var(--ice)]/90 font-semibold">
                Label
              </th>
              <th className="text-right py-2.5 px-3 text-[var(--ice)]/90 font-semibold">
                {prefix}{betLabel} Bets (cumulative)
              </th>
              <th className="text-right py-2.5 px-3 text-[var(--ice)]/90 font-semibold">
                {prefix}{betLabel} Wins (cumulative)
              </th>
              <th className="text-right py-2.5 px-3 text-[var(--ice)]/90 font-semibold">
                {prefix}{betLabel} Losses (cumulative)
              </th>
              <th className="text-right py-2.5 px-3 text-[var(--ice)]/90 font-semibold">
                {prefix}{betLabel} Win % (cumulative)
              </th>
              <th className="text-right py-2.5 px-3 text-[var(--ice)]/90 font-semibold">
                {prefix}{betLabel} Confidence Score (95%)
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr
                key={`${row.label}-${i}`}
                className="border-b border-[var(--card-border)]/70 hover:bg-white/5 transition-colors"
              >
                <td className="py-2.5 px-3 font-medium text-white">
                  {row.label}
                </td>
                <td className="py-2.5 px-3 text-right text-[var(--ice)]">
                  {row.bets}
                </td>
                <td className="py-2.5 px-3 text-right text-[var(--ice)]">
                  {row.wins}
                </td>
                <td className="py-2.5 px-3 text-right text-[var(--ice)]">
                  {row.losses}
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span
                    className={
                      row.winPct > WIN_PCT_HIGHLIGHT
                        ? 'font-semibold text-[var(--win)] bg-[var(--win)]/15 px-2 py-0.5 rounded'
                        : 'text-[var(--ice)]'
                    }
                  >
                    {row.winPct}%
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right text-[var(--ice)]">
                  {row.confidence95}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ShotBetsPage() {
  const router = useRouter()
  const [tables, setTables] = useState<AnalyticsTable[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sheetName, setSheetName] = useState('Goal Tracking')
  const [session, setSession] = useState<{ access_token: string } | null>(null)

  async function loadData(accessToken: string) {
    setError(null)
    const res = await fetch('/api/analytics/data', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.status === 401) {
      router.replace('/login?redirect=/shot-bets')
      return
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Failed to load analytics')
      return
    }
    const json = await res.json()
    setTables(json.tables ?? [])
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      const {
        data: { session: s },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (!s) {
        router.replace('/login?redirect=/shot-bets')
        return
      }
      setSession(s)
      setAuthChecked(true)
      try {
        await loadData(s.access_token)
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [router])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !session) return
    setUploadMessage(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.set('file', file)
      if (sheetName.trim()) form.set('sheet', sheetName.trim())
      const res = await fetch('/api/analytics/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUploadMessage(json.error || 'Upload failed')
        return
      }
      setUploadMessage(`Uploaded "${file.name}": ${json.rows} rows from sheet "${json.sheet}".`)
      await loadData(session.access_token)
    } catch {
      setUploadMessage('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (!authChecked || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[var(--ice)]/80">Loading shot bet analytics…</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-[var(--ice)]/70 hover:text-[var(--accent)]"
        >
          ← Analytics
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2">Shot Bets</h1>
        <p className="text-[var(--ice)]/70 text-sm mt-0.5">
          Winning percentages by model and bet type (L10 and H/A, Over/Under). Buckets use <strong>L10 Bucket</strong> and <strong>HA Bucket</strong> from your sheet. Win rate &gt; 58% highlighted.
        </p>
      </div>

      <div className="mb-6 p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
        <h2 className="text-sm font-semibold text-white mb-2">Upload Excel</h2>
        <p className="text-[var(--ice)]/70 text-sm mb-3">
          Upload your workbook. Use the sheet name that contains your data (e.g. <strong>Goal Tracking</strong>). Columns: Shot Line, L10 Delta, HA Delta, L10 Bucket, HA Bucket, Result, Over/Under (or Bet Type).
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="text-[var(--ice)]/80 text-sm">
            Sheet name:
            <input
              type="text"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Goal Tracking"
              className="ml-2 px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm w-40"
            />
          </label>
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--background)] font-medium text-sm cursor-pointer hover:bg-[var(--accent-dim)] disabled:opacity-50">
            <input
              type="file"
              accept=".xlsx,.xlsm"
              onChange={handleUpload}
              disabled={uploading}
              className="sr-only"
            />
            {uploading ? 'Uploading…' : 'Choose file (.xlsx or .xlsm)'}
          </label>
        </div>
        {uploadMessage && (
          <p className={`mt-2 text-sm ${uploadMessage.startsWith('Uploaded') ? 'text-[var(--win)]' : 'text-[var(--loss)]'}`}>
            {uploadMessage}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-[var(--loss)]/15 border border-[var(--loss)]/40 text-[var(--loss)]">
          {error}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
        {tables.map((table) => (
          <AnalyticsTableCard key={`${table.model}-${table.betType}`} table={table} />
        ))}
      </div>
    </div>
  )
}

