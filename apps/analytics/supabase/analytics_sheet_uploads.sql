-- Table used by ValuePicks Analytics (valuepicks.pro/analytics).
-- Primary source: Excel workbook "shot formula_2025-26-1_rev", sheet name "Goal Tracking".
-- Sync that sheet into this table (sheet_name = 'Goal Tracking', data = array of row objects).
CREATE TABLE IF NOT EXISTS analytics_sheet_uploads (
  sheet_name text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE analytics_sheet_uploads IS 'Excel sheet data by name. Goal Tracking from shot formula_2025-26-1_rev is the primary DB for models and results.';

