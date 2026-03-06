import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {

    const today = new Date().toISOString().split('T')[0]

    const { data: slate } = await supabase
      .from('slates')
      .select('id')
      .eq('slate_date', today)
      .maybeSingle()

    if (!slate) {
      return Response.json({
        success: false,
        error: 'No slate found for today'
      })
    }

    const res = await fetch(
      `https://api-web.nhle.com/v1/schedule/${today}`,
      { cache: 'no-store' }
    )

    const json = await res.json()

    const nhlGames =
      json.gameWeek?.flatMap((d: any) => d.games) || []

    if (!nhlGames.length) {
      return Response.json({
        success: true,
        message: 'No games today',
        updatedGames: 0,
        gradedPicks: 0
      })
    }

    const { data: dbGames } = await supabase
      .from('games')
      .select('id, nhl_game_id')
      .eq('slate_id', slate.id)

    const gameMap = new Map()

    dbGames?.forEach((g) => {
      gameMap.set(g.nhl_game_id, g.id)
    })

    const gameUpdates: any[] = []

    for (const g of nhlGames) {

      const dbGameId = gameMap.get(g.id)

      if (!dbGameId) continue

      const awayScore = g.awayTeam?.score ?? null
      const homeScore = g.homeTeam?.score ?? null

      let winner = null

      const isFinal =
        g.gameState === 'FINAL' ||
        g.gameState === 'OFF'

      if (
        isFinal &&
        awayScore !== null &&
        homeScore !== null
      ) {

        if (awayScore > homeScore) {
          winner = g.awayTeam.abbrev
        } else if (homeScore > awayScore) {
          winner = g.homeTeam.abbrev
        }

      }

      gameUpdates.push({
  id: dbGameId,
  status: g.gameState || null,
  away_score: awayScore,
  home_score: homeScore,
  winner_team: winner,
  period: g.periodDescriptor?.number
    ? `${g.periodDescriptor.number}${g.periodDescriptor.periodType === 'REG' ? '' : ''}`
    : null,
  clock: g.clock?.timeRemaining || null
})
    }

    if (gameUpdates.length) {
      await supabase
        .from('games')
        .upsert(gameUpdates, { onConflict: 'id' })
    }

    const finishedGames =
      gameUpdates.filter((g) => g.winner_team)

    if (!finishedGames.length) {

      return Response.json({
        success: true,
        updatedGames: gameUpdates.length,
        gradedPicks: 0
      })

    }

    const finishedIds =
      finishedGames.map((g) => g.id)

    const { data: picks } = await supabase
      .from('picks')
      .select('id, game_id, picked_team')
      .in('game_id', finishedIds)

    const winnerMap = new Map()

    finishedGames.forEach((g) => {
      winnerMap.set(g.id, g.winner_team)
    })

    const pickUpdates: any[] = []

    picks?.forEach((p) => {

      const winner = winnerMap.get(p.game_id)

      if (!winner) return

      pickUpdates.push({
        id: p.id,
        result: p.picked_team === winner
      })

    })

    if (pickUpdates.length) {

      await supabase
        .from('picks')
        .upsert(pickUpdates, { onConflict: 'id' })

    }

    return Response.json({
      success: true,
      updatedGames: gameUpdates.length,
      gradedPicks: pickUpdates.length
    })

  } catch (err) {

    console.error(err)

    return Response.json({
      success: false,
      error: 'Server error'
    })

  }
}