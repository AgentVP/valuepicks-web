# ValuePicks Analytics

Standalone Next.js app for private analytics dashboards (charts + Excel upload).

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; required for reading/writing `analytics_sheet_uploads`)

## Supabase SQL

Run:

- `supabase/analytics_sheet_uploads.sql`

## Local dev

```bash
npm install
npm run dev
```

