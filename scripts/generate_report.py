"""
Orchestrator chính — chạy toàn bộ pipeline và xuất ra reports/YYYY-MM-DD.json

Chạy thử: python scripts/generate_report.py
"""

import os
import json
from datetime import datetime, timezone

from collect_match_data import collect_match_data
from collect_news import collect_news
from aggregate import group_into_stories

REPORTS_DIR = os.path.join(os.path.dirname(__file__), "..", "reports")


def build_report():
    print("Thu thập match data...")
    match_data = collect_match_data()

    print("Thu thập tin tức đa tier...")
    news_data = collect_news()

    print(f"Tổng hợp & khử trùng lặp ({len(news_data['items'])} tin thô)...")
    stories = group_into_stories(news_data["items"])

    report = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "match_data": match_data,
        "stories": stories,
        "meta": {
            "raw_item_count": len(news_data["items"]),
            "story_count": len(stories),
        },
    }
    return report


def save_report(report):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    filename = f"{report['date']}.json"
    filepath = os.path.join(REPORTS_DIR, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"Đã lưu report: {filepath}")
    return filepath


if __name__ == "__main__":
    report = build_report()
    save_report(report)
    print(f"\nTổng kết: {report['meta']['story_count']} story từ {report['meta']['raw_item_count']} tin thô.")
