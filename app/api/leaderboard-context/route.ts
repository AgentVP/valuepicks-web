import { getLeaderboardDisplayDate, getLocalDateString } from '@/lib/dateUtils'

/**
 * Single server clock for contest "today" vs leaderboard display date (yesterday until 2pm ET).
 * Avoids client/server timezone or clock skew vs /api/contest-date.
 */
export async function GET() {
  return Response.json({
    contestDate: getLocalDateString(),
    leaderboardDate: getLeaderboardDisplayDate(),
  })
}
