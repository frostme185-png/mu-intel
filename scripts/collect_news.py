"""
Thu thập tin tức/rumor từ RSS feeds đa tier (config/sources.yaml).

Trạng thái: FUNCTIONAL SKELETON — logic fetch + parse RSS đã chạy được,
cần Claude Code mở rộng:
  - Verify và điền các RSS URL còn để null trong sources.yaml
  - Xử lý feed lỗi/timeout mà không làm crash toàn bộ pipeline
  - Lọc item theo khoảng thời gian (VD chỉ lấy tin trong 48h qua)
"""

import os
import yaml
import feedparser
from datetime import datetime, timezone

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "sources.yaml")


def load_sources():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def fetch_feed(source_name, rss_url, tier):
    """Fetch và parse 1 RSS feed, trả về list item đã chuẩn hoá."""
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
            items.append(
                {
                    "title": entry.get("title", ""),
                    "summary": entry.get("summary", ""),
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
    """Entry point — duyệt qua toàn bộ tier trong sources.yaml, fetch từng feed."""
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
            items = fetch_feed(source["name"], rss_url, tier_num)
            all_items.extend(items)

    return {
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "items": all_items,
    }


if __name__ == "__main__":
    import json

    result = collect_news()
    print(f"Thu thập được {len(result['items'])} tin.")
    print(json.dumps(result, indent=2, ensure_ascii=False)[:2000])
