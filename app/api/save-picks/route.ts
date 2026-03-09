import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const entrantName: string = body.entrantName
    const picks: Array<{ gameId: number; pickedTeam: string; decimalOdds?: number | null }> = body.picks || []

    if (!entrantName) {
      return Response.json({ success: false, error: 'entrantName is required' }, { status: 400 })
    }

    if (!Array.isArray(picks) || picks.length === 0) {
      return Response.json({ success: false, error: 'No picks submitted' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]

    const { data: slate, error: slateError } = await supabase
      .from('slates')
      .select('id')
      .eq('slate_date', today)
      .single()

    if (slateError || !slate) {
      return Response.json({ success: false, error: 'Slate not found' }, { status: 400 })
    }

    let { data: entry, error: entryLookupError } = await supabase
      .from('entries')
      .select('id')
      .eq('slate_id', slate.id)
      .eq('entrant_name', entrantName)
      .maybeSingle()

    if (entryLookupError) {
      return Response.json({ success: false, error: entryLookupError.message }, { status: 400 })
    }

    if (!entry) {
      const { data: newEntry, error: insertEntryError } = await supabase
        .from('entries')
        .insert({
          slate_id: slate.id,
          entrant_name: entrantName,
          entry_token: randomUUID(),
        })
        .select('id')
        .single()

      if (insertEntryError || !newEntry) {
        return Response.json({ success: false, error: insertEntryError?.message || 'Could not create entry' }, { status: 400 })
      }

      entry = newEntry
    }

    const gameIds = picks.map((p) => p.gameId)

    const { data: dbGames, error: gamesError } = await supabase
      .from('games')
      .select('id, start_time, away_team, home_team')
      .in('id', gameIds)
      .eq('slate_id', slate.id)

    if (gamesError || !dbGames) {
      return Response.json({ success: false, error: gamesError?.message || 'Could not load games' }, { status: 400 })
    }

    const gameMap = new Map(dbGames.map((g) => [g.id, g]))

    let savedCount = 0
    let lockedCount = 0

    for (const pick of picks) {
      const game = gameMap.get(pick.gameId)
      if (!game) continue

      const locked = new Date(game.start_time) <= new Date()
      if (locked) {
        lockedCount += 1
        continue
      }

      if (pick.pickedTeam !== game.away_team && pick.pickedTeam !== game.home_team) {
        continue
      }

      const decimalOdds =
        pick.decimalOdds != null && pick.decimalOdds > 0 ? pick.decimalOdds : null

      const { error: pickError } = await supabase
        .from('picks')
        .upsert(
          {
            entry_id: entry.id,
            game_id: pick.gameId,
            picked_team: pick.pickedTeam,
            ...(decimalOdds != null && { decimal_odds: decimalOdds }),
          },
          {
            onConflict: 'entry_id,game_id',
          }
        )

      if (!pickError) {
        savedCount += 1
      }
    }

    return Response.json({
      success: true,
      savedCount,
      lockedCount,
    })
  } catch (err) {
    console.error(err)
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}