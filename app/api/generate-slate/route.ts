import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {

  try {

    const today = new Date().toISOString().split('T')[0]

    // Create or get today's slate
    let { data: slate } = await supabase
      .from('slates')
      .select('*')
      .eq('slate_date', today)
      .single()

    if (!slate) {

      const { data } = await supabase
        .from('slates')
        .insert({ slate_date: today })
        .select()
        .single()

      slate = data

    }

    // Pull NHL schedule
    const res = await fetch(
      `https://api-web.nhle.com/v1/schedule/${today}`
    )

    const json = await res.json()

    const games =
      json.gameWeek?.flatMap((d:any) => d.games) || []

    for (const g of games) {

      await supabase
        .from('games')
        .upsert({

          slate_id: slate.id,

          nhl_game_id: g.id,

          start_time: g.startTimeUTC,

          away_team: g.awayTeam.abbrev,

          home_team: g.homeTeam.abbrev,

          status: g.gameState

        }, {
          onConflict: 'slate_id,nhl_game_id'
        })

    }

    return Response.json({
      success: true,
      gamesInserted: games.length
    })

  } catch (err) {

    console.error(err)

    return Response.json({
      success: false
    })

  }

}