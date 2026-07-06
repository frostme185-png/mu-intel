"""
Thu thập tin tức/rumor từ RSS feeds đa tier (config/sources.yaml).

Ngoài fetch + parse RSS cơ bản, module này còn:
  - Lọc theo thời gian: chỉ giữ item trong TIME_WINDOW_HOURS giờ gần nhất,
    tránh feed trả lại tin cũ mỗi lần chạy.
  - Lọc độ liên quan: nguồn có scope "general" (feed tổng nhiều CLB, xem
    config/sources.yaml) phải chứa từ khoá liên quan Man United mới được giữ.
  - Dedup xuyên ngày: lưu danh sách URL đã từng thu thập vào
    reports/.state/seen_items.json (rolling window SEEN_RETENTION_DAYS),
    để report mỗi ngày chỉ chứa tin thực sự mới, không lặp lại tin hôm trước.
"""

import os
import json
import yaml
import feedparser
from datetime import datetime, timezone, timedelta

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "sources.yaml")
SEEN_STATE_PATH = os.path.join(
    os.path.dirname(__file__), "..", "reports", ".state", "seen_items.json"
)

TIME_WINDOW_HOURS = 48
SEEN_RETENTION_DAYS = 7

RELEVANCE_KEYWORDS = [
    "manchester united",
    "man utd",
    "man united",
    "mufc",
    "old trafford",
]


def load_sources():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def is_recent(entry, window_hours=TIME_WINDOW_HOURS):
    """Kiểm tra entry có nằm trong window_hours gần nhất không.
    Nếu không xác định được thời gian publish, giữ lại (tránh loại nhầm)."""
    parsed_time = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed_time:
        return True
    published_at = datetime(*parsed_time[:6], tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - published_at <= timedelta(hours=window_hours)


def is_relevant_to_mufc(title, summary):
    text = f"{title} {summary}".lower()
    return any(keyword in text for keyword in RELEVANCE_KEYWORDS)


def load_seen_state():
    if not os.path.exists(SEEN_STATE_PATH):
        return {}
    with open(SEEN_STATE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def prune_seen_state(seen_state, retention_days=SEEN_RETENTION_DAYS):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).date()
    pruned = {}
    for url, first_seen_date in seen_state.items():
        try:
            if datetime.fromisoformat(first_seen_date).date() >= cutoff:
                pruned[url] = first_seen_date
        except ValueError:
            continue
    return pruned


def save_seen_state(seen_state):
    os.makedirs(os.path.dirname(SEEN_STATE_PATH), exist_ok=True)
    with open(SEEN_STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(seen_state, f, ensure_ascii=False, indent=2)


def fetch_feed(source_name, rss_url, tier, scope):
    """Fetch và parse 1 RSS feed, trả về list item đã chuẩn hoá + lọc thời gian/độ liên quan."""
    items = []
    try:
        parsed = feedparser.parse(rss_url)

        # feedparser KHÔNG throw exception khi network/parse lỗi — nó set flag
        # 'bozo' và trả về entries rỗng. Phải tự check để không bị false negative
        # (tưởng nguồn không có tin trong khi thực ra là fetch fail).
        if parsed.bozo and not parsed.entries:
            print(
                f"[WARN] Fetch '{source_name}' có vẻ fail (bozo=1): "
                f"{parsed.get('bozo_exception', 'không rõ lý do')}"
            )
            return items

        for entry in parsed.entries:
            if not is_recent(entry):
                continue

            title = entry.get("title", "")
            summary = entry.get("summary", "")

            if scope == "general" and not is_relevant_to_mufc(title, summary):
                continue

            items.append(
                {
                    "title": title,
                    "summary": summary,
                    "url": entry.get("link", ""),
                    "source": source_name,
                    "tier": tier,
                    "published_at": entry.get("published", ""),
                }
            )
    except Exception as e:
        # Không để 1 feed lỗi làm crash toàn bộ pipeline
        print(f"[WARN] Lỗi khi fetch '{source_name}' ({rss_url}): {e}")
    return items


def collect_news():
    """Entry point — duyệt qua toàn bộ tier trong sources.yaml, fetch từng feed,
    rồi lọc bớt item đã xuất hiện trong report của những ngày gần đây."""
    sources = load_sources()
    all_items = []

    for tier_key in ["tier_0", "tier_1", "tier_2", "tier_3", "tier_4"]:
        tier_num = int(tier_key.split("_")[1])
        tier_data = sources.get(tier_key, {})

        for source in tier_data.get("sources", []):
            rss_url = source.get("rss")
            if not rss_url:
                # Nguồn chưa có RSS verified - bỏ qua, không đoán URL
                continue
            scope = source.get("scope", "team")
            items = fetch_feed(source["name"], rss_url, tier_num, scope)
            all_items.extend(items)

    seen_state = load_seen_state()
    today_str = datetime.now(timezone.utc).date().isoformat()

    new_items = []
    for item in all_items:
        if item["url"] in seen_state:
            continue
        new_items.append(item)
        seen_state[item["url"]] = today_str

    save_seen_state(prune_seen_state(seen_state))

    return {
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "items": new_items,
    }


if __name__ == "__main__":
    result = collect_news()
    print(f"Thu thập được {len(result['items'])} tin mới (đã lọc thời gian/độ liên quan/trùng ngày trước).")
    print(json.dumps(result, indent=2, ensure_ascii=False)[:2000])
