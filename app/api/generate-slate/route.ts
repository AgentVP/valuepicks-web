import { createClient } from '@supabase/supabase-js'
import { getLocalDateString } from '@/lib/dateUtils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const today =
      url.searchParams.get('date')?.trim() ||
      getLocalDateString()

    let { data: slate } = await supabase
      .from('slates')
      .select('*')
      .eq('slate_date', today)
      .maybeSingle()

    if (!slate) {
      const { data, error } = await supabase
        .from('slates')
        .insert({ slate_date: today })
        .select()
        .single()

      if (error || !data) {
        return Response.json(
          { success: false, error: error?.message || 'Could not create slate' },
          { status: 500 }
        )
      }

      slate = data
    }

    const res = await fetch(
      `https://api-web.nhle.com/v1/schedule/${today}`,
      { cache: 'no-store' }
    )

    if (!res.ok) {
      return Response.json(
        { success: false, error: 'Failed to fetch NHL schedule' },
        { status: 500 }
      )
    }

    const json = await res.json()

    const games =
      json.gameWeek
        ?.filter((d: any) => d.date === today)
        .flatMap((d: any) => d.games || []) || []

    if (!games.length) {
      return Response.json({
        success: true,
        gamesInserted: 0,
        message: 'No games scheduled for today'
      })
    }

    const rows = games.map((g: any) => ({
      slate_id: slate.id,
      nhl_game_id: g.id,
      start_time: g.startTimeUTC,
      away_team: g.awayTeam.abbrev,
      home_team: g.homeTeam.abbrev,
      status: g.gameState || null
    }))

    const { error: upsertError } = await supabase
      .from('games')
      .upsert(rows, {
        onConflict: 'slate_id,nhl_game_id'
      })

    if (upsertError) {
      return Response.json(
        { success: false, error: upsertError.message },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      gamesInserted: rows.length
    })
  } catch (err) {
    console.error(err)

    return Response.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    )
  }
}