# CLAUDE.md — mu-intel

Đây là living source of truth cho project. Cập nhật file này sau mỗi session lớn hoặc mỗi khi có quyết định kiến trúc mới. Claude Code nên đọc file này đầu tiên trước khi implement bất kỳ phần nào.

## Mục tiêu project

Công cụ cá nhân thu thập, phân loại độ tin cậy, và tổng hợp tin tức/rumor/số liệu trận đấu về Manchester United thành daily report. Trọng tâm là **thu thập & phân loại**, không phải viết bài — AI draft chỉ là bước optional ở cuối. Người dùng (Kiến) tự viết phân tích cá nhân và tự đăng lên Facebook/Threads, không tự động hóa bước đăng.

## Vai trò của người dùng

Kiến là Technical Producer / Architecture Owner — không tự viết code, điều hành Claude Code implement toàn bộ. Workflow: viết prompt cho Claude Code → review output → playtest/kiểm tra → cập nhật CLAUDE.md. Giữ thói quen audit định kỳ để tránh data drift.

## Kiến trúc tổng thể

```
Match data (API-Football) ─┐
                            ├─→ Phân loại độ tin cậy (tier 0-4) ─→ Tổng hợp & khử trùng lặp ─→ Daily report (JSON)
Tin tức đa tier (RSS)      ─┘                                                                        │
                                                                                                       ▼
                                                                                    Commit vào GitHub repo
                                                                                                       │
                                                                                                       ▼
                                                                                   Cloudflare Pages tự build dashboard
                                                                                                       │
                                                                              ┌────────────────────────┴──────────────────┐
                                                                              ▼                                            ▼
                                                                    Kiến xem dashboard, tự viết & đăng          AI draft (optional, Claude API)
```

## Quyết định kiến trúc quan trọng (đã chốt)

1. **AI draft là optional, không phải core.** Core value của tool là aggregation + classification + report, không phải viết bài. Đừng để AI draft phình to thành trọng tâm chính khi implement.
2. **Không tự động đăng bài.** Không tích hợp Facebook/Threads API. Kiến tự tay đăng sau khi đọc dashboard.
3. **Giữ cả nguồn tier thấp (forum, tabloid).** Tín hiệu quan trọng nhất không phải "nguồn có đáng tin không" mà là "bao nhiêu nguồn độc lập cùng đưa 1 tin" — đây là lý do bước dedup/cross-reference quan trọng hơn bước lọc bỏ nguồn kém.
4. **Hosting = GitHub Actions + Cloudflare Pages, không tự dựng backend server.** Vì đây là tool cá nhân, 1 người dùng, không cần real-time — server riêng là overkill, tốn maintenance/chi phí không cần thiết.
5. **Report lưu dạng JSON, commit thẳng vào repo** (không dùng database riêng) — tận dụng git làm nơi lưu trữ + version history có sẵn.
6. **State xuyên ngày (cross-day dedup) cũng commit vào repo**, không dùng cache bên ngoài. `reports/.state/seen_items.json` lưu URL đã thu thập trong `SEEN_RETENTION_DAYS` (7 ngày) gần nhất, để `collect_news.py` không lặp lại tin đã có trong report ngày trước. Vì GitHub Actions runner không có state riêng giữa các lần chạy, mọi state cần persist đều phải nằm trong file commit vào repo (giống report) — workflow `daily-report.yml` đã `git add reports/` nên tự động bắt được luôn.
7. **Dedup dùng `rapidfuzz.fuzz.token_set_ratio`, không dùng difflib.** Các báo đặt tiêu đề khác nhau cho cùng 1 tin (khác thứ tự từ, thêm tiền tố "Man Utd news:"...) nên cần thuật toán bỏ qua thứ tự từ. Ngưỡng `SIMILARITY_THRESHOLD = 70` (thang 0-100) được calibrate bằng cách so sánh cặp tiêu đề thật/giả trong report — xem comment đầu file `scripts/aggregate.py`. Nếu vẫn miss nhiều cặp trùng, cân nhắc lên embedding.
8. **Category (transfer/match/off_pitch) là heuristic keyword, không phải AI.** Chỉ cần đủ tốt để nhóm hiển thị trên dashboard, không cần chính xác tuyệt đối — tránh phình to thành NLP pipeline riêng.

## Hệ thống phân loại độ tin cậy (tier)

Dựa theo khung phổ biến trong cộng đồng transfer rumor (The False 9 / manutdupdates.com), điều chỉnh cho MUFC. Xem chi tiết tại `config/sources.yaml`.

- **Tier 0** — Nguồn chính thức tuyệt đối (club, @ManUtd, manutd.com). Luôn đúng, không cần cross-reference.
- **Tier 1** — Gần như không thể tranh cãi (Fabrizio Romano, David Ornstein/The Athletic, BBC Sport). Nếu họ nói thì gần như chắc chắn đúng, dù chưa chắc là người đưa tin đầu tiên.
- **Tier 2** — Có nguồn tin thật nhưng vẫn có thể sai (Manchester Evening News, Mirror, các báo lớn khác). Nếu ≥2 nguồn tier này độc lập cùng đưa 1 tin, khả năng đúng tăng đáng kể — đây là tín hiệu dedup quan trọng nhất.
- **Tier 3** — Không đáng tin nếu đứng một mình, thiên clickbait (Caught Offside, Football Insider, TEAMtalk).
- **Tier 4** — Không đáng tin, tồn tại chủ yếu để câu traffic (fan forum, tweet vô danh, satire account). Vẫn thu thập vì đôi khi là nơi rumor xuất hiện sớm nhất, nhưng luôn gắn nhãn rõ ràng.

Nguồn mới/chưa biết mặc định vào Tier 4 cho đến khi được review và thêm vào bảng lookup thủ công.

## Tech stack

| Thành phần | Công nghệ | Lý do |
|---|---|---|
| Thu thập dữ liệu | Python (`requests`, `feedparser`) | Đơn giản, thư viện RSS tốt |
| Match data | API-Football (api-sports.io), free tier 100 req/ngày | Đủ cho 1 team, 1 giải |
| Tin tức/rumor | RSS feeds đa tier | Miễn phí, ổn định, tránh chi phí X API (~$0.005/read, không còn free tier từ 2/2026) |
| Lịch chạy | GitHub Actions (scheduled workflow) | Free 2.000 phút/tháng cho repo private, đủ dùng |
| Lưu trữ report | JSON file, commit vào repo dưới `reports/YYYY-MM-DD.json` | Tận dụng git, không cần DB riêng |
| Dashboard | React (Vite) | Nhẹ, dễ build static |
| Hosting dashboard | Cloudflare Pages | Free, unlimited bandwidth, hỗ trợ build từ private repo, auto-deploy khi có commit mới |
| AI draft (optional) | Claude API | Chỉ dùng khi Kiến chủ động trigger, không chạy tự động |

## Cấu hình quan trọng (đừng đoán lại, xem trực tiếp)

- API-Football team ID cho Manchester United: **33**
- API-Football league ID cho Premier League: **39**
- Season parameter dùng năm bắt đầu mùa giải (VD mùa 2025-26 → `season=2025`). **Cần cập nhật giá trị này trong `config/team.yaml` khi mùa giải mới bắt đầu** (thường đầu tháng 8).

## Việc CHƯA làm / cần Claude Code implement tiếp

- [x] Viết logic thật cho `scripts/collect_match_data.py` — lọc fixture recent/upcoming, chuẩn hoá player stats, retry/backoff + cache local
- [x] Viết logic thật cho `scripts/collect_news.py` — fetch RSS, parse, chuẩn hoá, lọc thời gian (48h), lọc độ liên quan cho feed tổng, dedup xuyên ngày
- [ ] Hoàn thiện `scripts/classify_sources.py` — vẫn chỉ là tool phụ để review domain lạ thủ công, chưa wire vào pipeline chính (không bắt buộc)
- [x] Hoàn thiện `scripts/aggregate.py` — dùng `rapidfuzz.fuzz.token_set_ratio` thay difflib, thêm phân loại category (transfer/match/off_pitch)
- [x] Verify RSS URL trong `config/sources.yaml` — đã xác nhận thật cho BBC, MEN, Mirror, Caught Offside, Football Insider, r/reddevils. Xác nhận KHÔNG có RSS công khai cho club official, Fabrizio Romano, David Ornstein, TEAMtalk (đã thử nhiều path, xem comment trong file)
- [x] Build dashboard React — list theo ngày, filter tier, search, group theo category, link nguồn click được, đánh dấu đã đọc (localStorage)
- [ ] Set up GitHub Secrets: `API_FOOTBALL_KEY`, (optional) `ANTHROPIC_API_KEY`
- [ ] Kết nối repo với Cloudflare Pages (làm thủ công qua dashboard Cloudflare, không thể tự động qua Claude Code)

## Quy ước code

- Comment và tên biến bằng tiếng Anh (chuẩn code convention), tài liệu (CLAUDE.md, README) bằng tiếng Việt có chú thích thuật ngữ tiếng Anh.
- Mọi script trong `scripts/` phải chạy độc lập được qua CLI để dễ test (`python scripts/collect_news.py`) trước khi ráp vào GitHub Actions.
- Không hardcode API key — luôn đọc từ biến môi trường (`.env` khi chạy local, GitHub Secrets khi chạy Actions).

## Bản quyền & đạo đức nội dung

- Report chỉ lưu **tóm tắt ngắn + link nguồn gốc**, không copy nguyên văn bài báo.
- Mỗi item trong report phải có field `source_url` và `tier` rõ ràng để Kiến tự đánh giá độ tin cậy khi đọc.
- Khi build tính năng AI draft (optional), draft phải diễn giải lại bằng phân tích riêng, không paraphrase sát bản gốc.