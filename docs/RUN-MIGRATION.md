# How to run the tiebreaker migration

This adds the "odds" column so the contest can use parlay odds as a tiebreaker. You only need to do this **once**.

## Where: Supabase Dashboard (in your browser)

1. Go to **[supabase.com](https://supabase.com)** and sign in.
2. Open your **project** (the one used by ValuePicks — same as in your `.env.local`).
3. In the left sidebar, click **"SQL Editor"**.
4. Click **"New query"** (or the + button).
5. **Paste this** into the big text box:

```sql
ALTER TABLE picks ADD COLUMN IF NOT EXISTS decimal_odds numeric;

COMMENT ON COLUMN picks.decimal_odds IS 'Decimal odds for this pick (parlay tiebreaker). e.g. 2.5 = +150, 1.5 = -200.';
```

6. Click the **"Run"** button (or press Ctrl+Enter / Cmd+Enter).
7. You should see a green success message like "Success. No rows returned." That’s correct — it just added the column.

Done. The Contest page can now save odds, and the Leaderboard will use them for tiebreakers.

---

## Optional: Odds cache (use Odds API once per day)

If you added an Odds API key, run this **once** so odds are cached per day and you stay within the free 500 requests/month.

In the same **SQL Editor**, run a **new query** with:

```sql
CREATE TABLE IF NOT EXISTS odds_cache (
  cache_date date PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE odds_cache IS 'Daily cache of NHL moneyline odds; avoids repeated Odds API calls.';
```

After this, the app will call The Odds API only once per day (the first time someone loads the Contest page that day); all other requests use the cached copy.
