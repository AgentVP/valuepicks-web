/**
 * "Contest day" is pinned to a single timezone so server routes (UTC) and browsers
 * (local time) always agree on which slate/date to use.
 */
export const CONTEST_TIME_ZONE = 'America/New_York'

/** Eastern wall-clock hour (0–23) and minute using formatToParts (avoids locale parse bugs). */
function getEasternHourMinute(d: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CONTEST_TIME_ZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d)
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  if (hour === 24) hour = 0
  return { hour: Number.isFinite(hour) ? hour : 0, minute: Number.isFinite(minute) ? minute : 0 }
}

/** Eastern calendar Y/M/D from formatToParts (en-CA string can be YYYY-MM-DD or M/D/YYYY — do not split on '-'). */
function getEasternCalendarParts(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CONTEST_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d)
  const y = Number(parts.find((p) => p.type === 'year')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'month')?.value ?? 0)
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? 0)
  return { y, m, day }
}

/**
 * Contest date as YYYY-MM-DD in Eastern. Rolls at 1am Eastern (not midnight):
 * 12:00am–12:59am Eastern still counts as the previous day so the contest page
 * shows yesterday's slate until 1am, then switches to today's (clearing old games).
 */
function easternPartsToYmd(p: { y: number; m: number; day: number }): string {
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function getContestDateString(d: Date = new Date()): string {
  const { hour } = getEasternHourMinute(d)
  // Before 1am Eastern = still previous calendar day for contest purposes
  if (hour < 1) {
    return getEasternCalendarYesterdayString(d)
  }
  return easternPartsToYmd(getEasternCalendarParts(d))
}

/** Calendar date YYYY-MM-DD in Eastern for a given moment (no 1am rollover). Use to compare game start_time to contest date. */
export function getCalendarDateInEastern(d: Date): string {
  return easternPartsToYmd(getEasternCalendarParts(d))
}

/** Back-compat alias used throughout the app. */
export function getLocalDateString(): string {
  return getContestDateString()
}

/** Yesterday's contest date (YYYY-MM-DD) in CONTEST_TIME_ZONE. */
export function getYesterdayContestDate(): string {
  const d = new Date()
  const yesterday = new Date(d.getTime() - 24 * 60 * 60 * 1000)
  return getContestDateString(yesterday)
}

/** Last day of calendar month m (1–12) in year y. */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

/**
 * Eastern calendar date (YYYY-MM-DD) minus one civil day — no 1am contest rollover.
 * Used so the leaderboard "yesterday" matches a real slate_date in the DB.
 */
export function getEasternCalendarYesterdayString(now: Date = new Date()): string {
  const { y, m, day } = getEasternCalendarParts(now)
  let d = day - 1
  let month = m
  let year = y
  if (d < 1) {
    month -= 1
    if (month < 1) {
      month = 12
      year -= 1
    }
    d = daysInMonth(year, month)
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Leaderboard slate_date (aligns with contest slates in DB):
 * - Before 2:00 PM Eastern: show previous calendar day’s slate (e.g. on 3/20 show 3/19 until 2pm).
 * - After midnight but before 1:00 AM, Eastern calendar may be “ahead” of contest date — use contest date
 *   so we don’t jump to an older slate (e.g. show 3/19, not 3/18, when contest is still 3/19).
 * - At/after 2:00 PM Eastern: contest date for that moment (same as /api/contest-date).
 */
export function getLeaderboardDisplayDate(now: Date = new Date()): string {
  const { hour, minute } = getEasternHourMinute(now)
  const minutesSinceMidnight = hour * 60 + minute
  const before2pm = minutesSinceMidnight < 14 * 60
  const cal = easternPartsToYmd(getEasternCalendarParts(now))
  const contest = getContestDateString(now)

  if (!before2pm) {
    return contest
  }
  if (contest < cal) {
    return contest
  }
  return getEasternCalendarYesterdayString(now)
}
