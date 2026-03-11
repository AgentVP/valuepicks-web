/**
 * "Contest day" is pinned to a single timezone so server routes (UTC) and browsers
 * (local time) always agree on which slate/date to use.
 */
export const CONTEST_TIME_ZONE = 'America/New_York'

/** Contest date as YYYY-MM-DD in `CONTEST_TIME_ZONE`. */
export function getContestDateString(d: Date = new Date()): string {
  // `en-CA` yields YYYY-MM-DD formatting.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CONTEST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Back-compat alias used throughout the app. */
export function getLocalDateString(): string {
  return getContestDateString()
}
