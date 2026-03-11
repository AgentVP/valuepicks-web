// Map The Odds API full names to NHL 3-letter abbreviations
export const ODDS_API_NAME_TO_ABBREV: Record<string, string> = {
  'Anaheim Ducks': 'ANA',
  'Arizona Coyotes': 'ARI',
  'Boston Bruins': 'BOS',
  'Buffalo Sabres': 'BUF',
  'Calgary Flames': 'CGY',
  'Carolina Hurricanes': 'CAR',
  'Chicago Blackhawks': 'CHI',
  'Colorado Avalanche': 'COL',
  'Columbus Blue Jackets': 'CBJ',
  'Dallas Stars': 'DAL',
  'Detroit Red Wings': 'DET',
  'Edmonton Oilers': 'EDM',
  'Florida Panthers': 'FLA',
  'Los Angeles Kings': 'LAK',
  'Minnesota Wild': 'MIN',
  'Montreal Canadiens': 'MTL',
  'Montréal Canadiens': 'MTL',
  'Nashville Predators': 'NSH',
  'New Jersey Devils': 'NJD',
  'New York Islanders': 'NYI',
  'New York Rangers': 'NYR',
  'Ottawa Senators': 'OTT',
  'Philadelphia Flyers': 'PHI',
  'Pittsburgh Penguins': 'PIT',
  'San Jose Sharks': 'SJS',
  'Seattle Kraken': 'SEA',
  'St Louis Blues': 'STL',
  'St. Louis Blues': 'STL',
  'Tampa Bay Lightning': 'TBL',
  'Toronto Maple Leafs': 'TOR',
  'Utah Hockey Club': 'UTA',
  'Utah Mammoth': 'UTA',
  'Utah': 'UTA',
  'Utah HC': 'UTA',
  'Utah Hockey': 'UTA',
  'UTA': 'UTA',
  'Vancouver Canucks': 'VAN',
  'Vegas Golden Knights': 'VGK',
  'Washington Capitals': 'WSH',
  'Winnipeg Jets': 'WPG',
}

/** Alternate/display names that may appear in DB (e.g. from odds or collector) → 3-letter abbrev for dedupe/logos */
const DISPLAY_TO_ABBREV: Record<string, string> = {
  Mammoth: 'UTA',
  Wild: 'MIN',
  ...ODDS_API_NAME_TO_ABBREV,
}

/** Canonical 3-letter abbrev for a team string (for dedupe and logo URL). Returns input if already abbrev or unknown. */
export function teamToCanonicalAbbrev(team: string): string {
  const t = (team ?? '').trim()
  if (!t) return t
  const fromDisplay = DISPLAY_TO_ABBREV[t] ?? DISPLAY_TO_ABBREV[t.toLowerCase()]
  if (fromDisplay) return fromDisplay
  if (toAbbrev(t)) return toAbbrev(t)!
  return t
}

/** Normalize accents so "Montréal" matches "Montreal" */
function normalizeForMatch(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function toAbbrev(name: string): string | null {
  const raw = name?.trim() ?? ''
  if (ODDS_API_NAME_TO_ABBREV[raw]) return ODDS_API_NAME_TO_ABBREV[raw]
  const lower = raw.toLowerCase()
  for (const [key, abbrev] of Object.entries(ODDS_API_NAME_TO_ABBREV)) {
    if (key.toLowerCase() === lower) return abbrev
  }
  const normalized = normalizeForMatch(raw)
  for (const [key, abbrev] of Object.entries(ODDS_API_NAME_TO_ABBREV)) {
    if (normalizeForMatch(key) === normalized) return abbrev
  }
  return null
}

export function mapOddsEventToAbbrevs(
  awayTeam: string,
  homeTeam: string
): { away: string; home: string } | null {
  const away = toAbbrev(awayTeam)
  const home = toAbbrev(homeTeam)
  if (away && home) return { away, home }
  return null
}
