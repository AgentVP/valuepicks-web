-- Table used by analytics upload + charts
CREATE TABLE IF NOT EXISTS analytics_sheet_uploads (
  sheet_name text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE analytics_sheet_uploads IS 'Stores parsed Excel sheet rows for ValuePicks analytics dashboards.';

