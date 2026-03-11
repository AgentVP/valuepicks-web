import { getLocalDateString } from '@/lib/dateUtils'

/** Returns the contest date (today in Eastern) so the Contest page always uses the server’s “today”. */
export async function GET() {
  return Response.json(
    { date: getLocalDateString() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
}
