"""
Phân loại độ tin cậy (tier) cho các nguồn tin.

Lưu ý: collect_news.py đã gắn tier sẵn cho các nguồn có trong sources.yaml.
Module này xử lý riêng cho trường hợp phát hiện nguồn MỚI không có trong bảng
(VD khi mở rộng thêm domain ngoài danh sách gốc) — mặc định xếp vào
default_tier_for_unknown_source (tier 4) và log lại để Kiến review thủ công.

Trạng thái: SKELETON — cần Claude Code hoàn thiện logic match domain
khi danh sách nguồn được mở rộng thêm.
"""

import os
import yaml
from urllib.parse import urlparse

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "sources.yaml")


def load_sources():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_domain_tier_map(sources):
    """Xây map domain -> tier từ sources.yaml để tra cứu nhanh."""
    domain_map = {}
    for tier_key in ["tier_0", "tier_1", "tier_2", "tier_3", "tier_4"]:
        tier_num = int(tier_key.split("_")[1])
        for source in sources.get(tier_key, {}).get("sources", []):
            website = source.get("website", "")
            if website:
                domain = urlparse(website).netloc.replace("www.", "")
                domain_map[domain] = tier_num
    return domain_map


def classify_url(url, domain_map, default_tier=4):
    """Trả về tier cho 1 URL bất kỳ, dựa trên domain map. Log nếu không nhận diện được."""
    domain = urlparse(url).netloc.replace("www.", "")
    tier = domain_map.get(domain)
    if tier is None:
        print(f"[INFO] Nguồn mới chưa phân loại: {domain} -> mặc định tier {default_tier}")
        return default_tier
    return tier


if __name__ == "__main__":
    sources = load_sources()
    domain_map = build_domain_tier_map(sources)
    print("Domain -> tier map hiện tại:")
    for domain, tier in domain_map.items():
        print(f"  {domain}: tier {tier}")
