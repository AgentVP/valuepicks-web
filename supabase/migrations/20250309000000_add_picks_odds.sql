-- Tiebreaker: parlay-style odds per pick. Higher combined odds wins ties.
-- Store decimal odds (e.g. 2.5 for +150, 1.5 for -200). Null = no odds entered.
ALTER TABLE picks ADD COLUMN IF NOT EXISTS decimal_odds numeric;

COMMENT ON COLUMN picks.decimal_odds IS 'Decimal odds for this pick (parlay tiebreaker). e.g. 2.5 = +150, 1.5 = -200.';
