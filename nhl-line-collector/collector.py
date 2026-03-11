import os
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import requests
from dotenv import load_dotenv
from supabase import Client, create_client
# Load environment from the project `.env.local` so we can reuse
# the same Supabase settings as the Next.js app.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env.local")

# SUPABASE CONNECTION (read from environment)
# The Next.js app uses NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "Missing Supabase env vars. Ensure NEXT_PUBLIC_SUPABASE_URL and "
        "SUPABASE_SERVICE_ROLE_KEY are set in .env.local"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

ODDS_API_IO_KEY = os.getenv("ODDS_API_IO_KEY")
ODDS_API_IO_BASE = "https://api.odds-api.io/v3"
SPORT_SLUG = "ice-hockey"

# Map Odds API team names to your labels used in excel_game_id
# Right-hand side values must match the team tokens in Column35
# like "20260106_Blue Jackets_Golden Knights".
TEAM_NAME_MAP: Dict[str, str] = {
    "Anaheim Ducks": "ANA",
    "Arizona Coyotes": "ARI",
    "Boston Bruins": "BOS",
    "Buffalo Sabres": "BUF",
    "Calgary Flames": "CGY",
    "Carolina Hurricanes": "CAR",
    "Chicago Blackhawks": "CHI",
    "Colorado Avalanche": "COL",
    "Columbus Blue Jackets": "CBJ",
    "Dallas Stars": "DAL",
    "Detroit Red Wings": "DET",
    "Edmonton Oilers": "EDM",
    "Florida Panthers": "FLA",
    "Los Angeles Kings": "LAK",
    "Minnesota Wild": "MIN",
    "Montreal Canadiens": "MTL",
    "Montréal Canadiens": "MTL",
    "Nashville Predators": "NSH",
    "New Jersey Devils": "NJD",
    "New York Islanders": "NYI",
    "New York Rangers": "NYR",
    "Ottawa Senators": "OTT",
    "Philadelphia Flyers": "PHI",
    "Pittsburgh Penguins": "PIT",
    "San Jose Sharks": "SJS",
    "Seattle Kraken": "SEA",
    "St. Louis Blues": "STL",
    "Tampa Bay Lightning": "TBL",
    "Toronto Maple Leafs": "TOR",
    "Vancouver Canucks": "VAN",
    "Vegas Golden Knights": "VGK",
    "Washington Capitals": "WSH",
    "Winnipeg Jets": "WPG",
    "Utah Mammoth": "UTA",
    "Utah Hockey Club": "UTA",
    "Utah HC": "UTA",
    "Utah Hockey": "UTA",
    "Utah": "UTA",
}


def _normalize_name(s: str) -> str:
    """Strip accents so 'Montréal' matches 'Montreal'."""
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def map_team_name(full_name: str) -> Optional[str]:
    label = TEAM_NAME_MAP.get(full_name)
    if label:
        return label
    # Match by accent-normalized name so "Montréal Canadiens" etc. resolve
    key = full_name.strip()
    normalized = _normalize_name(key).lower()
    for k, abbr in TEAM_NAME_MAP.items():
        if _normalize_name(k).lower() == normalized:
            return abbr
    print(f"[collector] Unmapped Odds API team name: {full_name!r}")
    return None


def odds_to_american(value: object) -> Optional[int]:
    """
    Odds-API.io may return odds as:
    - American strings like "-110" / "+125"
    - Decimal strings like "2.70"
    - Numbers
    Convert to American int for storage in sportsbook_lines.odds.
    """
    if value is None:
        return None
    try:
        s = str(value).strip()
        if not s:
            return None
        # American format
        if s.startswith(("+", "-")) and s[1:].replace(".", "", 1).isdigit():
            return int(round(float(s)))
        # Decimal format
        dec = float(s)
        if dec <= 1:
            return None
        if dec >= 2:
            return int(round((dec - 1) * 100))
        return int(round(-100 / (dec - 1)))
    except Exception:
        return None


def chunked(items: List[int], size: int) -> Iterable[List[int]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def get_or_create_game(
    game_date: str, away_label: str, home_label: str, commence_time: str
) -> int:
    """
    Ensure a games row exists for this matchup and return its id.
    game_date: 'YYYY-MM-DD'
    commence_time: ISO timestamp from The Odds API.
    """
    game_key = f"{game_date}_{away_label}_{home_label}"

    # Ensure slate exists for this date
    slate_res = supabase.table("slates").select("id").eq("slate_date", game_date).execute()
    if slate_res.data:
        slate_id = slate_res.data[0]["id"]
    else:
        insert_slate = supabase.table("slates").insert({"slate_date": game_date}).execute()
        slate_id = insert_slate.data[0]["id"]

    # 1) Prefer existing contest games for this slate (abbreviations)
    existing = (
        supabase.table("games")
        .select("id, game_date, game_key")
        .eq("slate_id", slate_id)
        .eq("away_team", away_label)
        .eq("home_team", home_label)
        .execute()
    )
    if existing.data:
        g = existing.data[0]
        # Backfill game_date/game_key if missing
        updates = {}
        if not g.get("game_date"):
            updates["game_date"] = game_date
        if not g.get("game_key"):
            updates["game_key"] = game_key
        if updates:
            supabase.table("games").update(updates).eq("id", g["id"]).execute()
        return g["id"]

    # 2) Fallback: existing game by game_key
    res = supabase.table("games").select("id").eq("game_key", game_key).execute()
    if res.data:
        return res.data[0]["id"]

    # 3) No existing game: create one
    insert_game = supabase.table("games").insert(
        {
            "slate_id": slate_id,
            "away_team": away_label,
            "home_team": home_label,
            "game_date": game_date,
            "start_time": commence_time,
            "game_key": game_key,
            # excel_game_id left null for API-created games
        }
    ).execute()
    return insert_game.data[0]["id"]


def collect_and_push_lines(capture_type: str = "mid") -> None:
    if not ODDS_API_IO_KEY:
        raise RuntimeError("ODDS_API_IO_KEY is not set. Add it to .env.local and rerun.")

    # 1) Find NHL league slug under ice-hockey
    leagues_url = f"{ODDS_API_IO_BASE}/leagues?apiKey={ODDS_API_IO_KEY}&sport={SPORT_SLUG}"
    leagues = requests.get(leagues_url, timeout=30).json()
    nhl_leagues = [l for l in leagues if "NHL" in (l.get("name") or "")]
    if not nhl_leagues:
        raise RuntimeError(f"No NHL leagues found from {leagues_url}")
    # Prefer regular season if present; otherwise first NHL league
    nhl_league = next((l for l in nhl_leagues if "Regular" in (l.get("name") or "")), nhl_leagues[0])
    league_slug = nhl_league.get("slug")
    if not league_slug:
        raise RuntimeError("NHL league slug missing in leagues response")

    # 2) Fetch today's pending/live events (UTC window)
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=2)  # cover late games crossing midnight UTC
    events_url = (
        f"{ODDS_API_IO_BASE}/events?apiKey={ODDS_API_IO_KEY}"
        f"&sport={SPORT_SLUG}&league={league_slug}"
        f"&status=pending,live"
        f"&from={start.isoformat().replace('+00:00','Z')}"
        f"&to={end.isoformat().replace('+00:00','Z')}"
        f"&limit=60"
    )
    events: List[dict] = requests.get(events_url, timeout=30).json()
    event_ids = [e.get("id") for e in events if isinstance(e.get("id"), int)]
    print(f"[collector] Odds-API.io NHL league={league_slug} events={len(event_ids)}")

    if not event_ids:
        print("[collector] No events returned for window.")
        return

    # 3) Use selected bookmakers (free plan: 2). Fall back to a sensible default.
    selected_url = f"{ODDS_API_IO_BASE}/bookmakers/selected?apiKey={ODDS_API_IO_KEY}"
    selected = requests.get(selected_url, timeout=30).json()
    bookmakers = selected if isinstance(selected, list) else []
    if not bookmakers:
        bookmakers = ["Bovada", "DraftKings"]
    bookmakers_param = ",".join(bookmakers[:2])

    rows: List[dict] = []
    captured_at = datetime.now(timezone.utc).isoformat()

    # 4) Fetch odds in batches of 10 events
    for batch in chunked(event_ids, 10):
        odds_url = (
            f"{ODDS_API_IO_BASE}/odds/multi?apiKey={ODDS_API_IO_KEY}"
            f"&eventIds={','.join(str(i) for i in batch)}"
            f"&bookmakers={bookmakers_param}"
        )
        odds_events: List[dict] = requests.get(odds_url, timeout=30).json()

        for ev in odds_events:
            away_name = ev.get("away")
            home_name = ev.get("home")
            commence_time = ev.get("date")  # ISO string
            if not away_name or not home_name or not commence_time:
                continue

            away_label = map_team_name(away_name)
            home_label = map_team_name(home_name)
            if not away_label or not home_label:
                continue

            game_date = commence_time.split("T", 1)[0]
            game_id = get_or_create_game(game_date, away_label, home_label, commence_time)

            bks = ev.get("bookmakers") or {}
            # bks: { "Bookmaker": [ { name: "ML", odds: [ {home:"", away:"", hdp:...} ] }, ... ] }
            for bk_name, markets in bks.items():
                if not isinstance(markets, list):
                    continue
                for market in markets:
                    market_name = (market.get("name") or "").strip()
                    odds_list = market.get("odds") or []
                    if not isinstance(odds_list, list) or not odds_list:
                        continue

                    # Moneyline
                    if market_name in ("ML", "Moneyline"):
                        o = odds_list[0]
                        away_price = odds_to_american(o.get("away"))
                        home_price = odds_to_american(o.get("home"))
                        if away_price is not None:
                            rows.append(
                                {
                                    "game_id": game_id,
                                    "market": "moneyline",
                                    "team": away_label,
                                    "line": None,
                                    "odds": away_price,
                                    "capture_type": capture_type,
                                    "captured_at": captured_at,
                                }
                            )
                        if home_price is not None:
                            rows.append(
                                {
                                    "game_id": game_id,
                                    "market": "moneyline",
                                    "team": home_label,
                                    "line": None,
                                    "odds": home_price,
                                    "capture_type": capture_type,
                                    "captured_at": captured_at,
                                }
                            )

                    # Totals (game total goals) – commonly labeled "Total" or "Over/Under"
                    if market_name.lower() in ("total", "totals", "over/under", "over under"):
                        o = odds_list[0]
                        hdp = o.get("hdp")
                        over_price = odds_to_american(o.get("over"))
                        under_price = odds_to_american(o.get("under"))
                        if hdp is None:
                            continue
                        if over_price is not None:
                            rows.append(
                                {
                                    "game_id": game_id,
                                    "market": "total_goals",
                                    "team": "over",
                                    "line": float(hdp),
                                    "odds": over_price,
                                    "capture_type": capture_type,
                                    "captured_at": captured_at,
                                }
                            )
                        if under_price is not None:
                            rows.append(
                                {
                                    "game_id": game_id,
                                    "market": "total_goals",
                                    "team": "under",
                                    "line": float(hdp),
                                    "odds": under_price,
                                    "capture_type": capture_type,
                                    "captured_at": captured_at,
                                }
                            )

    if rows:
        supabase.table("sportsbook_lines").insert(rows).execute()
        print(f"[collector] Inserted rows: {len(rows)}")
    else:
        print("[collector] No rows to insert (no applicable markets).")


if __name__ == "__main__":
    collect_and_push_lines(capture_type="mid")

