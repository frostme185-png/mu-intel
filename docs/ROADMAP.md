# Roadmap

Không áp lực deadline — làm theo layer, mỗi layer phải chạy được thật trước khi qua layer tiếp theo.

## Layer 1 — Core data pipeline (chạy local)

- [ ] `scripts/collect_match_data.py` — gọi API-Football, lấy fixture gần nhất/sắp tới của Man United, lineup, player ratings sau trận
- [ ] `scripts/collect_news.py` — fetch toàn bộ RSS trong `config/sources.yaml`, chuẩn hoá thành list item {title, summary, url, source, published_at}
- [ ] `scripts/classify_sources.py` — map mỗi item vào tier dựa trên domain/tên nguồn
- [ ] `scripts/aggregate.py` — nhóm các item có nội dung trùng/gần giống nhau giữa nhiều nguồn, tính "corroboration count"
- [ ] `scripts/generate_report.py` — orchestrator, chạy toàn bộ pipeline trên, xuất ra `reports/YYYY-MM-DD.json`
- [ ] Test chạy toàn bộ pipeline local bằng tay, đọc report JSON xem có hợp lý không

**Done khi:** chạy `python scripts/generate_report.py` ra 1 file JSON report đọc được, có phân tier rõ ràng, có ít nhất vài tin từ mỗi tier.

## Layer 2 — Automation

- [ ] Set up GitHub Secrets (`API_FOOTBALL_KEY`)
- [ ] Viết `.github/workflows/daily-report.yml` — chạy `generate_report.py` theo lịch, commit report mới vào repo
- [ ] Test chạy thử workflow bằng `workflow_dispatch` (trigger tay) trước khi bật lịch tự động
- [ ] Xác nhận workflow chạy đúng giờ, không lỗi, không vượt free minutes

**Done khi:** report tự sinh ra hàng ngày mà không cần đụng tay vào máy.

## Layer 3 — Dashboard

- [ ] Build React (Vite) dashboard đọc report JSON từ `reports/`
- [ ] Tính năng tối thiểu: list report theo ngày, filter theo tier, search keyword
- [ ] Kết nối repo với Cloudflare Pages (làm thủ công trên Cloudflare dashboard)
- [ ] Xác nhận auto-deploy hoạt động khi có commit report mới

**Done khi:** mở được dashboard qua URL trên điện thoại và xem report mới nhất.

## Layer 4 — AI draft (optional, làm sau cùng)

- [ ] Viết `scripts/ai_draft.py` — nhận 1 report JSON, gọi Claude API, sinh draft bài viết
- [ ] Tạo `STYLE.md` chứa văn phong cá nhân (bài mẫu, tone, cụm từ hay dùng, thứ cần tránh) để feed vào prompt
- [ ] Trigger thủ công (CLI hoặc `workflow_dispatch`), không chạy tự động theo lịch

**Done khi:** có thể chạy tay để lấy 1 bản draft khi cần, không bắt buộc phải dùng mỗi ngày.

## Audit định kỳ

Cuối mỗi layer, hoặc cuối tuần: yêu cầu Claude Code liệt kê toàn bộ field trong report JSON và cấu hình, kiểm tra trùng lặp/chức năng chồng chéo trước khi thêm mới — giữ thói quen này để tránh data drift qua nhiều session, giống cách đang làm với Pawthority.
