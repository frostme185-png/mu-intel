"""
Thu thập match data (fixtures, lineups, player ratings) cho Manchester United
qua API-Football (api-sports.io).

Hoàn thiện so với skeleton ban đầu:
  - Lọc fixture gần nhất đã đá (finished) và fixture sắp tới (upcoming)
  - Chuẩn hoá player ratings sau trận thành {player_name, rating, goals, assists, minutes}
  - Retry/backoff khi gặp lỗi rate limit (429) hoặc lỗi mạng tạm thời
  - Cache response ra file cục bộ để không lãng phí free tier quota (100 req/ngày)
    khi chạy thử nhiều lần trong cùng một khoảng thời gian ngắn

Docs tham khảo: https://www.api-football.com/documentation-v3
"""

import os
import json
import time
import yaml
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "team.yaml")
CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")
CACHE_TTL_SECONDS = 4 * 60 * 60  # 4 tiếng - đủ để tránh gọi trùng khi test nhiều lần/ngày

# Fixture đã đá xong trong khoảng này mới coi là "recent" (để lấy player ratings)
RECENT_FIXTURE_WINDOW = timedelta(days=3)

FINISHED_STATUSES = {"FT", "AET", "PEN"}
NOT_STARTED_STATUSES = {"NS", "TBD"}

MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 5


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_api_headers():
    api_key = os.environ.get("API_FOOTBALL_KEY")
    if not api_key:
        raise EnvironmentError(
            "Thiếu API_FOOTBALL_KEY trong biến môi trường. "
            "Xem .env.example để biết cách setup."
        )
    return {"x-apisports-key": api_key}


def _cache_path(cache_key):
    os.makedirs(CACHE_DIR, exist_ok=True)
    safe_key = cache_key.replace("/", "_").replace("?", "_").replace("&", "_")
    return os.path.join(CACHE_DIR, f"{safe_key}.json")


def _read_cache(cache_key):
    path = _cache_path(cache_key)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        cached = json.load(f)
    cached_at = datetime.fromisoformat(cached["cached_at"])
    if datetime.now(timezone.utc) - cached_at > timedelta(seconds=CACHE_TTL_SECONDS):
        return None
    return cached["data"]


def _write_cache(cache_key, data):
    path = _cache_path(cache_key)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(
            {"cached_at": datetime.now(timezone.utc).isoformat(), "data": data},
            f,
            ensure_ascii=False,
        )


def api_get(base_url, endpoint, params, cache_key):
    """Gọi API-Football với cache + retry/backoff cho lỗi rate limit."""
    cached = _read_cache(cache_key)
    if cached is not None:
        return cached

    headers = get_api_headers()
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        response = requests.get(f"{base_url}/{endpoint}", headers=headers, params=params)

        if response.status_code == 429:
            wait = RETRY_BACKOFF_SECONDS * attempt
            print(f"[WARN] Rate limit (429) khi gọi {endpoint}, thử lại sau {wait}s...")
            time.sleep(wait)
            last_error = requests.HTTPError("429 Too Many Requests")
            continue

        try:
            response.raise_for_status()
        except requests.HTTPError as e:
            last_error = e
            break

        data = response.json()
        _write_cache(cache_key, data)
        return data

    raise last_error or RuntimeError(f"Không gọi được API-Football endpoint {endpoint}")


def get_recent_and_upcoming_fixtures(config):
    """
    Lấy fixture gần nhất (đã đá trong RECENT_FIXTURE_WINDOW) và fixture sắp tới.
    Gọi 1 lần /fixtures với team + season, lọc cục bộ theo ngày hiện tại
    để tiết kiệm quota (free tier chỉ 100 req/ngày).
    """
    base_url = config["api"]["base_url"]
    team_id = config["team"]["api_football_id"]
    season = config["season"]

    params = {"team": team_id, "season": season}
    cache_key = f"fixtures_team{team_id}_season{season}"
    data = api_get(base_url, "fixtures", params, cache_key)

    fixtures = data.get("response", [])
    now = datetime.now(timezone.utc)

    finished_past = []
    upcoming_future = []

    for fixture in fixtures:
        fixture_info = fixture.get("fixture", {})
        status_short = fixture_info.get("status", {}).get("short")
        date_str = fixture_info.get("date")
        if not date_str:
            continue
        fixture_date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))

        if status_short in FINISHED_STATUSES and fixture_date <= now:
            finished_past.append((fixture_date, fixture))
        elif status_short in NOT_STARTED_STATUSES and fixture_date > now:
            upcoming_future.append((fixture_date, fixture))

    finished_past.sort(key=lambda pair: pair[0], reverse=True)
    upcoming_future.sort(key=lambda pair: pair[0])

    recent_fixture = None
    if finished_past:
        latest_date, latest_fixture = finished_past[0]
        if now - latest_date <= RECENT_FIXTURE_WINDOW:
            recent_fixture = latest_fixture

    upcoming_fixture = upcoming_future[0][1] if upcoming_future else None

    return {
        "recent": recent_fixture,
        "upcoming": upcoming_fixture,
    }


def _normalize_player_stats(fixture_players_response):
    """Chuẩn hoá response /fixtures/players thành list phẳng {player_name, rating, goals, assists, minutes}."""
    normalized = []
    for team_block in fixture_players_response:
        for player_entry in team_block.get("players", []):
            player_name = player_entry.get("player", {}).get("name", "")
            stats_list = player_entry.get("statistics", [])
            if not stats_list:
                continue
            stats = stats_list[0]
            games = stats.get("games", {}) or {}
            goals = stats.get("goals", {}) or {}

            rating_raw = games.get("rating")
            normalized.append(
                {
                    "player_name": player_name,
                    "rating": float(rating_raw) if rating_raw is not None else None,
                    "minutes": games.get("minutes"),
                    "goals": goals.get("total") or 0,
                    "assists": goals.get("assists") or 0,
                }
            )
    return normalized


def get_fixture_stats(config, fixture_id):
    """Lấy player ratings + stats chi tiết cho 1 fixture cụ thể, đã chuẩn hoá."""
    base_url = config["api"]["base_url"]
    params = {"fixture": fixture_id}
    cache_key = f"fixture_players_{fixture_id}"

    data = api_get(base_url, "fixtures/players", params, cache_key)
    return _normalize_player_stats(data.get("response", []))


def collect_match_data():
    """Entry point — trả về dict match data đã chuẩn hoá cho report."""
    config = load_config()
    fixtures = get_recent_and_upcoming_fixtures(config)

    recent_fixture = fixtures["recent"]
    player_stats = []
    if recent_fixture:
        fixture_id = recent_fixture.get("fixture", {}).get("id")
        if fixture_id:
            player_stats = get_fixture_stats(config, fixture_id)

    return {
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "recent_fixture": recent_fixture,
        "recent_fixture_player_stats": player_stats,
        "upcoming_fixture": fixtures["upcoming"],
    }


if __name__ == "__main__":
    result = collect_match_data()
    print(json.dumps(result, indent=2, ensure_ascii=False))
