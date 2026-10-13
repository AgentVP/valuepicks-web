/**
 * Checks the Supabase session token sent by the browser (Authorization: Bearer <token>).
 * Returns the signed-in member's email ('' if it has none), or null when the token is missing or invalid.
 */
export async function getUserEmail(request: Request): Promise<string | null> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: key } })
  if (!res.ok) return null
  const user = await res.json().catch(() => null)
  return typeof user?.email === 'string' ? user.email.toLowerCase() : ''
}
