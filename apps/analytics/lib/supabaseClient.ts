import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Avoid throwing during Next.js build/prerender when env vars may be absent.
// Vercel will provide NEXT_PUBLIC_* at build + runtime for the deployed app.
export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : (null as any)

