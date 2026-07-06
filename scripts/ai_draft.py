"""
AI draft (OPTIONAL) — sinh bản draft bài viết cá nhân từ 1 daily report.

Đây KHÔNG phải core feature — chỉ chạy khi Kiến chủ động trigger bằng tay,
không chạy tự động theo lịch. Core value của project là aggregation +
classification, không phải viết bài.

Cần STYLE.md ở root project (chưa tạo) chứa văn phong cá nhân để feed vào
prompt — xem docs/ROADMAP.md Layer 4.

Chạy thử: python scripts/ai_draft.py reports/2026-07-06.json
"""

import os
import sys
import json
from dotenv import load_dotenv

load_dotenv()

try:
    import anthropic
except ImportError:
    anthropic = None

STYLE_GUIDE_PATH = os.path.join(os.path.dirname(__file__), "..", "STYLE.md")

DRAFT_SYSTEM_PROMPT = """Bạn đang giúp viết draft bài phân tích bóng đá cá nhân về Manchester United,
dựa trên report tổng hợp tin tức đã được phân loại độ tin cậy sẵn.

Yêu cầu:
- Diễn giải lại bằng phân tích riêng, KHÔNG paraphrase sát nguyên văn bài báo gốc.
- Phải phân biệt rõ tin đã xác nhận (tier 0-1) với rumor/speculation (tier 2-4).
- Viết theo văn phong mô tả trong STYLE.md nếu file này tồn tại.
- Đây là DRAFT để người dùng tự chỉnh sửa tiếp, không phải bản final.
"""


def load_style_guide():
    if os.path.exists(STYLE_GUIDE_PATH):
        with open(STYLE_GUIDE_PATH, "r", encoding="utf-8") as f:
            return f.read()
    return "(Chưa có STYLE.md - viết theo văn phong phân tích trung lập, súc tích.)"


def generate_draft(report_path):
    if anthropic is None:
        raise ImportError(
            "Thiếu thư viện 'anthropic'. Cài bằng: pip install anthropic --break-system-packages"
        )

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise EnvironmentError("Thiếu ANTHROPIC_API_KEY trong biến môi trường.")

    with open(report_path, "r", encoding="utf-8") as f:
        report = json.load(f)

    style_guide = load_style_guide()
    client = anthropic.Anthropic(api_key=api_key)

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        system=DRAFT_SYSTEM_PROMPT + "\n\nSTYLE.md:\n" + style_guide,
        messages=[
            {
                "role": "user",
                "content": f"Viết draft bài phân tích từ report sau:\n\n{json.dumps(report, ensure_ascii=False)}",
            }
        ],
    )

    return message.content[0].text


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Cách dùng: python scripts/ai_draft.py reports/YYYY-MM-DD.json")
        sys.exit(1)

    draft = generate_draft(sys.argv[1])
    print(draft)
