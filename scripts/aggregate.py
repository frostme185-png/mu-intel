"""
Tổng hợp & khử trùng lặp (dedup) giữa các tin từ nhiều nguồn.

Ý tưởng chính: nhóm các item có tiêu đề tương tự nhau lại thành 1 "story",
đếm số nguồn ĐỘC LẬP nhắc đến story đó (corroboration_count). Đây là tín hiệu
quan trọng hơn cả tier — 3 nguồn tier 2 độc lập cùng nói 1 tin đáng chú ý hơn
1 nguồn tier 3 đơn lẻ.

So khớp tiêu đề dùng rapidfuzz.fuzz.token_set_ratio thay vì difflib thuần —
token_set_ratio bỏ qua thứ tự từ và phần thừa (VD tiền tố "Man Utd news:"),
nên bắt được nhiều cặp tin trùng giữa các báo hơn khi mỗi báo đặt tít khác
kiểu (đã kiểm chứng: các cặp trùng thật đạt ~75-100 điểm, cặp không liên quan
chỉ ~40-55 điểm — xem lịch sử commit để biết cách calibrate SIMILARITY_THRESHOLD).

Mỗi story còn được gắn "category" (transfer/match/off_pitch) bằng keyword
heuristic đơn giản, phục vụ nhóm hiển thị trên dashboard. Đây chỉ là phân loại
thô — không cần chính xác tuyệt đối, chỉ cần đủ tốt để nhóm nội dung khi đọc.
"""

from rapidfuzz import fuzz

SIMILARITY_THRESHOLD = 70  # thang điểm 0-100 của rapidfuzz

TRANSFER_KEYWORDS = [
    "transfer", "sign", "signing", "signed", "deal", "move to", "loan",
    "medical", "contract", "£", "bid", "target", "linked", "exit", "fee",
    "wishlist", "swap", "release clause", "here we go", "here we go",
    "green light", "asking price",
]

MATCH_KEYWORDS = [
    " vs ", "vs.", "match", "kick off", "kicks off", "full-time", "half-time",
    "line-up", "lineup", "player ratings", "world cup", "premier league",
    "friendly", "pre-season", "fixture", "starts for", "started for",
    "round of 16",
]


def classify_category(text):
    """Phân loại thô 1 story vào transfer / match / off_pitch dựa trên keyword."""
    text_lower = text.lower()
    if any(keyword in text_lower for keyword in TRANSFER_KEYWORDS):
        return "transfer"
    if any(keyword in text_lower for keyword in MATCH_KEYWORDS):
        return "match"
    return "off_pitch"


def title_similarity(title_a, title_b):
    return fuzz.token_set_ratio(title_a, title_b)


def group_into_stories(items):
    """
    Nhóm list item (đã có tier) thành các "story" dựa trên độ tương đồng tiêu đề.
    Trả về list story, mỗi story gồm:
      - representative_title: tiêu đề đại diện (item đầu tiên trong nhóm)
      - items: toàn bộ item thuộc story này
      - sources: set tên nguồn (để tính corroboration)
      - min_tier: tier thấp nhất (đáng tin nhất) trong nhóm
      - corroboration_count: số nguồn ĐỘC LẬP khác nhau nhắc đến story này
      - category: transfer / match / off_pitch (heuristic, xem classify_category)
    """
    stories = []

    for item in items:
        matched_story = None
        for story in stories:
            if title_similarity(item["title"], story["representative_title"]) >= SIMILARITY_THRESHOLD:
                matched_story = story
                break

        if matched_story:
            matched_story["items"].append(item)
            matched_story["sources"].add(item["source"])
            matched_story["min_tier"] = min(matched_story["min_tier"], item["tier"])
        else:
            stories.append(
                {
                    "representative_title": item["title"],
                    "items": [item],
                    "sources": {item["source"]},
                    "min_tier": item["tier"],
                }
            )

    # Tính corroboration_count + category sau khi đã nhóm xong
    for story in stories:
        story["corroboration_count"] = len(story["sources"])
        story["sources"] = list(story["sources"])  # để JSON serialize được

        combined_text = " ".join(
            f"{i['title']} {i.get('summary', '')}" for i in story["items"][:3]
        )
        story["category"] = classify_category(combined_text)

    # Sắp xếp: tier thấp (đáng tin hơn) lên trước, sau đó theo corroboration_count giảm dần
    stories.sort(key=lambda s: (s["min_tier"], -s["corroboration_count"]))

    return stories


if __name__ == "__main__":
    # Test nhanh với data giả lập
    sample_items = [
        {"title": "United close to signing new striker", "source": "BBC Sport", "tier": 1},
        {"title": "Man United closing in on striker deal", "source": "Manchester Evening News", "tier": 2},
        {"title": "Totally unrelated transfer news", "source": "Caught Offside", "tier": 3},
    ]
    result = group_into_stories(sample_items)
    for story in result:
        print(f"Tier {story['min_tier']} | {story['corroboration_count']} nguon | [{story['category']}] {story['representative_title']}")
