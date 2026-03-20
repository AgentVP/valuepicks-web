/**
 * Test script: fetch Goal Tracking data from Supabase and filter to a given date.
 * Usage from repo root: node --env-file=.env.local apps/analytics/scripts/test-goal-tracking.mjs
 * Or: node apps/analytics/scripts/test-goal-tracking.mjs
 * (Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env or .env.local at repo root)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local from repo root if present
const rootEnv = resolve(__dirname, '../../../.env.local')
if (existsSync(rootEnv)) {
  const content = readFileSync(rootEnv, 'utf-8')
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m) {
      const key = m[1]
      const val = m[2].replace(/^["']|["']$/g, '').trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}

const GOAL_TRACKING_SHEET = 'Goal Tracking'
const TARGET_DATE = '2026-01-07' // Jan 7, 2026

function normalizeDate(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    // Excel serial date: 1 = Jan 1, 1900 (with leap bug). Jan 7 2026 ≈ 45308
    const d = new Date((value - 25569) * 86400 * 1000) // 25569 = days from 1900-01-01 to 1970-01-01 (Unix)
    return d.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/) || s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) {
    if (match[1].length === 4) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`
  }
  return null
}

function findDateColumnKeys(row) {
  if (!row || typeof row !== 'object') return []
  const candidates = ['Date', 'Game Date', 'date', 'game_date', 'GameDate', 'Day', 'Match Date']
  const keys = Object.keys(row)
  return keys.filter((k) => {
    const lower = k.toLowerCase().replace(/\s+/g, '_')
    return candidates.some((c) => lower.includes(c.toLowerCase().replace(/\s+/g, '_')) || c.toLowerCase() === lower)
  })
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Use .env.local at repo root or set in env.')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  console.log('Fetching Goal Tracking data from Supabase...\n')

  const { data: row, error } = await supabase
    .from('analytics_sheet_uploads')
    .select('data, updated_at')
    .eq('sheet_name', GOAL_TRACKING_SHEET)
    .maybeSingle()

  if (error) {
    console.error('Supabase error:', error.message)
    if (error.message.includes('Could not find the table')) {
      console.error('\nCreate the table in Supabase SQL Editor: run apps/analytics/supabase/analytics_sheet_uploads.sql')
      console.error('Then sync the "Goal Tracking" sheet from workbook shot formula_2025-26-1_rev into that table.')
    }
    process.exit(1)
  }

  const rows = row?.data && Array.isArray(row.data) ? row.data : []
  console.log('Total rows in Goal Tracking:', rows.length)
  console.log('Sheet last updated:', row?.updated_at ?? 'N/A')
  if (rows.length === 0) {
    console.log('\nNo data in sheet. Sync the Excel "Goal Tracking" sheet to Supabase first.')
    process.exit(0)
  }

  const first = rows[0]
  const dateKeys = findDateColumnKeys(first)
  console.log('Date-like columns found:', dateKeys.length ? dateKeys : '(none)')
  console.log('All columns in first row:', Object.keys(first).join(', '))

  const jan7Rows = dateKeys.length
    ? rows.filter((r) => {
        for (const key of dateKeys) {
          const norm = normalizeDate(r[key])
          if (norm === TARGET_DATE) return true
        }
        return false
      })
    : rows

  console.log('\n--- Games for Jan 7, 2026 ---')
  console.log('Count:', jan7Rows.length)
  if (jan7Rows.length > 0) {
    console.log('\nSample rows (first 5):')
    jan7Rows.slice(0, 5).forEach((r, i) => console.log(JSON.stringify(r, null, 2)))
    if (jan7Rows.length > 5) {
      console.log('\n... and', jan7Rows.length - 5, 'more row(s).')
    }
  } else if (dateKeys.length === 0) {
    console.log('No date column detected. First row keys:', Object.keys(first).join(', '))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
