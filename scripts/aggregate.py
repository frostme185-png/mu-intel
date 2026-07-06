"""
Tổng hợp & khử trùng lặp (dedup) giữa các tin từ nhiều nguồn.

Ý tưởng chính: nhóm các item có tiêu đề tương tự nhau lại thành 1 "story",
đếm số nguồn ĐỘC LẬP nhắc đến story đó (corroboration_count). Đây là tín hiệu
quan trọng hơn cả tier — 3 nguồn tier 2 độc lập cùng nói 1 tin đáng chú ý hơn
1 nguồn tier 3 đơn lẻ.

Trạng thái: FUNCTIONAL SKELETON — dùng difflib (built-in, không cần cài thêm)
để so khớp tiêu đề. Đây là cách tiếp cận đơn giản, đủ dùng ở quy mô nhỏ.
Nếu sau này thấy match không chính xác, Claude Code có thể nâng cấp lên
rapidfuzz hoặc so khớp bằng embedding.
"""

from difflib import SequenceMatcher

SIMILARITY_THRESHOLD = 0.6  # ngưỡng để coi 2 tiêu đề là "cùng 1 story"


def title_similarity(title_a, title_b):
    return SequenceMatcher(None, title_a.lower(), title_b.lower()).ratio()


def group_into_stories(items):
    """
    Nhóm list item (đã có tier) thành các "story" dựa trên độ tương đồng tiêu đề.
    Trả về list story, mỗi story gồm:
      - representative_title: tiêu đề đại diện (item đầu tiên trong nhóm)
      - items: toàn bộ item thuộc story này
      - sources: set tên nguồn (để tính corroboration)
      - min_tier: tier thấp nhất (đáng tin nhất) trong nhóm
      - corroboration_count: số nguồn ĐỘC LẬP khác nhau nhắc đến story này
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

    # Tính corroboration_count sau khi đã nhóm xong
    for story in stories:
        story["corroboration_count"] = len(story["sources"])
        story["sources"] = list(story["sources"])  # để JSON serialize được

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
        print(f"Tier {story['min_tier']} | {story['corroboration_count']} nguồn | {story['representative_title']}")
