# Bắt đầu nhanh — chạy demo Smart E-Mobility Hub

Ứng dụng là một trang web tĩnh (HTML/CSS/JavaScript ES Modules), dữ liệu mô phỏng nằm trong bộ nhớ trình duyệt. **Không cần cài thư viện, không cần cơ sở dữ liệu, không cần tài khoản.**

## 1. Yêu cầu

| Thành phần | Dùng để | Kiểm tra |
|---|---|---|
| Windows 10/11 + PowerShell | chạy lệnh | — |
| Python 3 (bất kỳ bản 3.x) | máy chủ tĩnh `http.server` | `python --version` (hoặc `py --version`) |
| Chrome hoặc Edge bản mới | mở ứng dụng | — |
| Node.js ≥ 18 *(chỉ để chạy test)* | `npm test` | `node --version` |
| Playwright cho Python *(tùy chọn)* | test trình duyệt tự động | `pip install playwright` |

## 2. Lấy đúng mã nguồn

```powershell
git clone https://github.com/TiKyisme/smart-emobility-hub.git
cd smart-emobility-hub
```

Nếu đã có thư mục repo: `git switch main` rồi `git pull`. Nếu PR giao diện mới chưa được merge, dùng nhánh của PR đó (`git switch feature/ui-redesign`).

## 3. Khởi động

Mở PowerShell **tại thư mục gốc của repo** (thư mục có `index.html`):

```powershell
python -m http.server 5173 --bind 127.0.0.1
```

Mở trình duyệt: **http://127.0.0.1:5173/** — giao diện mặc định tiếng Việt, chế độ sáng.

- Thanh bên trái có **Cổng sinh viên** (*Tìm & đặt xe*, *Đỗ xe & sạc*) và **Cổng vận hành** (*Giám sát mạng lưới*, *Sạc thông minh*, *Sự cố*, *Mô phỏng What-if*). Mỗi trang có địa chỉ riêng, ví dụ `http://127.0.0.1:5173/#incidents`.
- Chỉ nghe trên `127.0.0.1` nên không lộ ra mạng Wi-Fi trường và thường không bật hộp thoại tường lửa. Cách khác: `npm start`.
- **Không** mở `index.html` bằng cách nhấp đúp (`file://`): trình duyệt chặn ES Modules và trang trống.

URL cho phần demo hết hạn giữ xe (giữ 20 giây; trang hiển thị thời lượng đang dùng):
**http://127.0.0.1:5173/?holdSeconds=20** (chấp nhận 10–3600 giây; giá trị khác bị bỏ qua, dùng mặc định 15 phút).

## 4. Dừng và đặt lại

- Dừng máy chủ: **Ctrl+C** trong cửa sổ PowerShell.
- **Đặt lại dữ liệu demo:** nút **Đặt lại dữ liệu** ở góc trái dưới (giữ nguyên ngôn ngữ và chế độ sáng/tối), hoặc tải lại trang (F5).
- Mỗi tab có dữ liệu riêng: thao tác ở tab này không ảnh hưởng tab kia.

## 5. Kiểm tra nhanh trước giờ demo (2 phút)

```powershell
npm test                                   # kỳ vọng: tests 60, pass 60, fail 0
python tests/e2e/browser_acceptance.py     # tùy chọn; kỳ vọng: SUMMARY: 101 PASS / 0 FAIL / 101 checks
```

Script trình duyệt tự khởi động máy chủ ở một cổng trống, tự tắt khi xong và ghi ảnh vào `docs/demo/screenshots/`. Thêm `--headed` để xem trình duyệt chạy, `--no-screenshots` để không ghi đè ảnh.

## 6. Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| `OSError: [WinError 10048]` / cổng 5173 bận | Xem tiến trình: `Get-NetTCPConnection -LocalPort 5173 \| Select-Object OwningProcess` rồi `Get-Process -Id <PID>`. Đóng máy chủ cũ, hoặc dùng cổng khác: `python -m http.server 5174 --bind 127.0.0.1` và mở `http://127.0.0.1:5174/`. |
| `python` không được nhận diện | Dùng `py -m http.server 5173 --bind 127.0.0.1`. |
| Trang trắng / không có dữ liệu | Địa chỉ phải là `http://127.0.0.1:5173/` (không phải `file://`), máy chủ chạy **từ thư mục gốc repo**; mở F12 → Console xem lỗi. |
| Vẫn thấy giao diện cũ (không có thanh bên) | Sai nhánh hoặc bộ nhớ đệm: `git branch --show-current`, `git pull`, rồi tải lại cứng **Ctrl+F5**. |
| Số liệu khác kịch bản | Có thao tác thừa hoặc đang bật *Tự động* → tắt *Tự động*, bấm **Đặt lại dữ liệu**, làm lại bước đang dở. |
| `npm test` báo lỗi `node` | Cài Node.js LTS; ứng dụng vẫn chạy được mà không cần Node. |

Tài liệu liên quan: [kịch bản demo](DEMO_SCRIPT_8_TO_12_MIN.md) · [checklist](DEMO_CHECKLIST.md) · [bằng chứng kiểm thử](DEMO_EVIDENCE.md) · [FAQ cho giảng viên](FAQ_FOR_LECTURER.md)
