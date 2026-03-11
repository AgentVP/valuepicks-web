/**
 * "Contest day" is pinned to a single timezone so server routes (UTC) and browsers
 * (local time) always agree on which slate/date to use.
 */
export const CONTEST_TIME_ZONE = 'America/New_York'

/**
 * Contest date as YYYY-MM-DD in Eastern. Rolls at 1am Eastern (not midnight):
 * 12:00am–12:59am Eastern still counts as the previous day so the contest page
 * shows yesterday's slate until 1am, then switches to today's (clearing old games).
 */
export function getContestDateString(d: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONTEST_TIME_ZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONTEST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [hour] = formatter.format(d).split(':').map(Number)
  // Before 1am Eastern = still previous calendar day for contest purposes
  if ((hour ?? 0) < 1) {
    const yesterday = new Date(d.getTime() - 24 * 60 * 60 * 1000)
    return dateFormatter.format(yesterday)
  }
  return dateFormatter.format(d)
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

/**
 * Date to use for the daily leaderboard: yesterday until 2pm Eastern the next day, then today.
 * So "yesterday's" results stay visible until 2pm Eastern, then we show today's slate.
 */
export function getLeaderboardDisplayDate(): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONTEST_TIME_ZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  const [hour, minute] = formatter.format(now).split(':').map(Number)
  const minutesSinceMidnight = (hour ?? 0) * 60 + (minute ?? 0)
  const twoPM = 14 * 60
  if (minutesSinceMidnight < twoPM) {
    return getYesterdayContestDate()
  }
  return getContestDateString(now)
}
