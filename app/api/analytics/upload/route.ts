import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import { parseGoalTrackingSheet } from '@/lib/parseGoalTrackingSheet'
import type { RawShotBet } from '@/lib/analyticsAggregate'

const GOAL_TRACKING_SHEET = 'Goal Tracking'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function requireAuth(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return false
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: key,
    },
  })
  return res.ok
}

export async function POST(request: Request) {
  const ok = await requireAuth(request)
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Invalid form data' },
      { status: 400 }
    )
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'No file uploaded. Use form field "file".' },
      { status: 400 }
    )
  }

  // Optional: specific sheet name (e.g. "Goal Tracking"). If omitted, use default or first sheet.
  const requestedSheet = (formData.get('sheet') as string)?.trim() || null

  const buf = Buffer.from(await file.arrayBuffer())
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buf, { type: 'buffer' })
  } catch (e) {
    console.error('Excel read error:', e)
    return NextResponse.json(
      { error: 'Could not read Excel file. Use .xlsx or .xlsm.' },
      { status: 400 }
    )
  }

  const sheetName = requestedSheet
    ? (workbook.SheetNames.includes(requestedSheet) ? requestedSheet : null)
    : (workbook.SheetNames.includes(GOAL_TRACKING_SHEET) ? GOAL_TRACKING_SHEET : workbook.SheetNames[0])

  if (!sheetName) {
    return NextResponse.json(
      { error: requestedSheet ? `Sheet "${requestedSheet}" not found. Available: ${workbook.SheetNames.join(', ')}` : 'No sheets in workbook.' },
      { status: 400 }
    )
  }

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    return NextResponse.json(
      { error: `Sheet "${sheetName}" not found.` },
      { status: 400 }
    )
  }

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
  const parsed = parseGoalTrackingSheet(json)

  if (parsed.length === 0) {
    return NextResponse.json(
      { error: 'No rows parsed. Check column names: Shot Line, L10 Delta, HA Delta, L10 Bucket, HA Bucket, Result, Over/Under (or Bet Type).' },
      { status: 400 }
    )
  }

  const supabase = getSupabase()
  if (supabase) {
    const { error } = await supabase
      .from('analytics_sheet_uploads')
      .upsert(
        { sheet_name: sheetName, data: parsed, updated_at: new Date().toISOString() },
        { onConflict: 'sheet_name' }
      )
    if (error) {
      console.error('Supabase analytics_sheet_uploads upsert:', error)
      return NextResponse.json(
        { error: 'Saved to file but Supabase update failed. Run the SQL in supabase/analytics_sheet_uploads.sql and ensure SUPABASE_SERVICE_ROLE_KEY is set.' },
        { status: 500 }
      )
    }
  }

  try {
    const path = join(process.cwd(), 'data', 'shot-bet-analytics.json')
    await writeFile(path, JSON.stringify(parsed, null, 2), 'utf-8')
  } catch {
    // optional local backup
  }

  return NextResponse.json({
    success: true,
    rows: parsed.length,
    sheet: sheetName,
    source: supabase ? 'Supabase' : 'file',
  })
}
