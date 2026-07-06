# mu-intel

Công cụ cá nhân thu thập, phân loại độ tin cậy, và tổng hợp tin tức + số liệu trận đấu Manchester United thành daily report — làm nguyên liệu cho phân tích cá nhân, không tự viết bài hay tự đăng.

## Vì sao có project này

Theo dõi tin tức MUFC (báo lớn, journalist, tabloid, forum) mỗi ngày tốn thời gian và dễ bỏ sót. Tool này tự động gom hết lại, gắn nhãn độ tin cậy (tier 0-4) theo khung tham khảo phổ biến trong cộng đồng transfer rumor, và đối chiếu xem tin nào được nhiều nguồn độc lập xác nhận — để việc đọc tin mỗi ngày nhanh và có cơ sở hơn.

## Kiến trúc

Xem chi tiết đầy đủ trong [`CLAUDE.md`](./CLAUDE.md). Tóm tắt:

1. GitHub Actions chạy theo lịch → thu thập match data (API-Football) + tin tức đa tier (RSS)
2. Phân loại độ tin cậy theo tier (0-4)
3. Tổng hợp & khử trùng lặp giữa các nguồn
4. Gen ra daily report dạng JSON, commit vào repo
5. Cloudflare Pages tự build lại dashboard mỗi khi có report mới
6. Xem dashboard trên bất kỳ thiết bị nào qua trình duyệt

## Setup nhanh

```bash
# Cài dependencies
pip install -r requirements.txt --break-system-packages

# Copy file env mẫu và điền API key
cp .env.example .env

# Chạy thử thu thập data (local, không qua GitHub Actions)
python scripts/generate_report.py
```

> `reports/2026-07-06.json` hiện tại là **dữ liệu mẫu** để test dashboard — xoá file này
> khi đã chạy pipeline thật và có report đầu tiên.

Xem [`docs/ROADMAP.md`](./docs/ROADMAP.md) để biết thứ tự triển khai từng phần.
