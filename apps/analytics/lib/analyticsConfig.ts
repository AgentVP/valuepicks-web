/**
 * Analytics data source: Excel workbook synced to Supabase.
 * Table: analytics_sheet_uploads (sheet_name, data jsonb, updated_at).
 *
 * Primary database for all models and results:
 * - Workbook: shot formula_2025-26-1_rev
 * - Sheet name: Goal Tracking (shot/goal buckets)
 * - Sheet name: Moneyline (moneyline odds, side, result)
 */
export const ANALYTICS_WORKBOOK_NAME = 'shot formula_2025-26-1_rev'
export const GOAL_TRACKING_SHEET_NAME = 'Goal Tracking'
export const MONEYLINE_SHEET_NAME = 'Moneyline'
