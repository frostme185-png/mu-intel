"""
Thu thập match data (fixtures, lineups, player ratings) cho Manchester United
qua API-Football (api-sports.io).

Trạng thái: SKELETON — cấu trúc gọi API đã có sẵn, cần Claude Code hoàn thiện:
  - Xử lý lineup/player ratings sau khi trận đấu kết thúc
  - Retry/backoff khi gặp lỗi rate limit (429)
  - Cache response để không lãng phí free tier quota (100 req/ngày)

Docs tham khảo: https://www.api-football.com/documentation-v3
"""

import os
import yaml
import requests
from datetime import datetime, timezone, timedelta

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "team.yaml")


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


def get_recent_and_upcoming_fixtures(config):
    """
    Lấy fixture gần nhất (đã đá) và sắp tới của team.
    TODO: implement — gọi endpoint /fixtures với team + season,
    lọc ra fixture gần nhất theo ngày hiện tại.
    """
    base_url = config["api"]["base_url"]
    team_id = config["team"]["api_football_id"]
    season = config["season"]

    headers = get_api_headers()
    params = {"team": team_id, "season": season}

    response = requests.get(f"{base_url}/fixtures", headers=headers, params=params)
    response.raise_for_status()
    data = response.json()

    # TODO: lọc fixture theo ngày, tách "recent" vs "upcoming"
    return data.get("response", [])


def get_fixture_stats(config, fixture_id):
    """
    Lấy player ratings + stats chi tiết cho 1 fixture cụ thể.
    TODO: implement — gọi endpoint /fixtures/players với fixture id.
    """
    base_url = config["api"]["base_url"]
    headers = get_api_headers()
    params = {"fixture": fixture_id}

    response = requests.get(
        f"{base_url}/fixtures/players", headers=headers, params=params
    )
    response.raise_for_status()
    data = response.json()

    # TODO: chuẩn hoá format thành {player_name, rating, goals, assists, minutes}
    return data.get("response", [])


def collect_match_data():
    """Entry point — trả về dict match data đã chuẩn hoá cho report."""
    config = load_config()
    fixtures = get_recent_and_upcoming_fixtures(config)

    # TODO: nếu có fixture vừa kết thúc trong 24h qua, gọi thêm get_fixture_stats()
    return {
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "fixtures": fixtures,
    }


if __name__ == "__main__":
    import json

    result = collect_match_data()
    print(json.dumps(result, indent=2, ensure_ascii=False))
