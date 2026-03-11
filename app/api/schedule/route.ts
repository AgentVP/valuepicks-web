import { NextRequest } from 'next/server'
import { getLocalDateString } from '@/lib/dateUtils'

/**
 * Server-side proxy for NHL schedule. The NHL API can block or fail
 * when called from the browser (CORS / "Load failed"). Calling from
 * the server avoids that.
 */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? getLocalDateString()
  try {
    const res = await fetch(
      `https://api-web.nhle.com/v1/schedule/${date}`,
      { cache: 'no-store' }
    )
    if (!res.ok) {
      return Response.json({ gameWeek: [] }, { status: res.status })
    }
    const json = await res.json()
    return Response.json(json)
  } catch (err) {
    console.error('NHL schedule fetch error:', err)
    return Response.json({ gameWeek: [] }, { status: 500 })
  }
}
