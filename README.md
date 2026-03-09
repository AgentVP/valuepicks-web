This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## ValuePicks NHL Contest

Daily NHL pick contest among friends. Submit picks, optional odds for tiebreaker (higher parlay odds win ties). Live scores on Today page.

### Optional: show odds on Contest page

Odds are for reference and used as the tiebreaker. To display them (single source, free):

1. Sign up at [The Odds API](https://the-odds-api.com/) (free tier: 500 requests/month).
2. Add to `.env.local`: `ODDS_API_KEY=your_key_here`
3. Restart the dev server. The Contest page will show moneyline odds next to each team and use them when you submit picks.

If you don’t set the key, the Contest page still works; odds just won’t be shown.

Odds are cached in the database once per day so the API is only called once per day (optional table: see `docs/RUN-MIGRATION.md`).

### Database migration (tiebreaker odds)

To enable the parlay-odds tiebreaker, add the `decimal_odds` column to `picks`:

```bash
# If using Supabase CLI:
supabase db push

# Or run in SQL Editor in Supabase dashboard:
# See supabase/migrations/20250309000000_add_picks_odds.sql
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
