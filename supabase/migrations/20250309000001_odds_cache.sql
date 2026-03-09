-- Cache Odds API response once per day to stay within free tier (500 req/month).
-- One row per day; /api/odds reads here first and only calls the API if today is missing.
CREATE TABLE IF NOT EXISTS odds_cache (
  cache_date date PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE odds_cache IS 'Daily cache of NHL moneyline odds; avoids repeated Odds API calls.';
