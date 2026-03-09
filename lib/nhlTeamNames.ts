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
  'Utah': 'UTA',
  'Utah HC': 'UTA',
  'Utah Hockey': 'UTA',
  'UTA': 'UTA',
  'Vancouver Canucks': 'VAN',
  'Vegas Golden Knights': 'VGK',
  'Washington Capitals': 'WSH',
  'Winnipeg Jets': 'WPG',
}

function toAbbrev(name: string): string | null {
  const raw = name?.trim() ?? ''
  if (ODDS_API_NAME_TO_ABBREV[raw]) return ODDS_API_NAME_TO_ABBREV[raw]
  const lower = raw.toLowerCase()
  for (const [key, abbrev] of Object.entries(ODDS_API_NAME_TO_ABBREV)) {
    if (key.toLowerCase() === lower) return abbrev
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
