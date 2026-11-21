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

Nếu đã có thư mục repo: `git switch main` rồi `git pull`. Nếu PR đồng bộ use case chưa được merge, dùng nhánh của PR đó (`git switch feature/uc-ui-sync`).

## 3. Khởi động

Mở PowerShell **tại thư mục gốc của repo** (thư mục có `index.html`):

```powershell
python -m http.server 5173 --bind 127.0.0.1
```

Mở trình duyệt: **http://127.0.0.1:5173/** — giao diện mặc định tiếng Việt, chế độ sáng.

Thanh bên trái có 11 trang, **mỗi trang là một use case trong sơ đồ use case của báo cáo**, nhóm theo tác nhân:

| Nhóm | Trang (VI) | Tên use case (EN) | Địa chỉ |
|---|---|---|---|
| Cổng sinh viên | Tìm Hub / phương tiện | Find Suitable Hub / Vehicle | `#find` |
| | Đặt giữ xe dùng chung | Reserve Shared Vehicle | `#reserve` |
| | Đặt chỗ đỗ xe | Reserve Parking Space | `#parking` |
| | Đặt lịch sạc xe cá nhân | Schedule Private EV Charging | `#evcharge` |
| Cổng vận hành | Giám sát mạng lưới | Monitor Network Status | `#network` |
| | Quản lý sạc thông minh | Manage Smart Charging | `#charging` |
| | Điều phối xe | Redistribute Vehicles | `#redistribution` |
| | Xử lý sự cố vận hành | Handle Operational Incident | `#incidents` |
| | Mô phỏng What-if | Run What-if Simulation | `#whatif` |
| Nhân viên hiện trường | Thực hiện điều chuyển | Execute Redistribution Task | `#dispatch` |
| | Xử lý sự cố được giao | Resolve Assigned Incident | `#maintenance` |

- Nút *Cập nhật dữ liệu* / *Tự động* ở thanh trên là tác nhân **Data Simulator** (Synchronize Resource State).
- Chỉ nghe trên `127.0.0.1` nên không lộ ra mạng Wi-Fi trường. Cách khác: `npm start`.
- **Không** mở `index.html` bằng cách nhấp đúp (`file://`): trình duyệt chặn ES Modules và trang trống.

URL cho phần demo hết hạn giữ xe (giữ 20 giây; trang hiển thị thời lượng đang dùng):
**http://127.0.0.1:5173/?holdSeconds=20** (chấp nhận 10–3600 giây; giá trị khác bị bỏ qua, dùng mặc định 15 phút).

## 4. Dừng và đặt lại

- Dừng máy chủ: **Ctrl+C** trong cửa sổ PowerShell.
- **Đặt lại dữ liệu demo:** nút **Đặt lại dữ liệu** ở góc trái dưới (giữ nguyên ngôn ngữ và chế độ sáng/tối), hoặc tải lại trang (F5).
- Mỗi tab có dữ liệu riêng: thao tác ở tab này không ảnh hưởng tab kia.
- Lịch sạc theo **khung giờ đồng hồ**: phiên sạc đang chạy kết thúc khi hết giờ (ví dụ 15:00). Tránh bắt đầu demo vào 1–2 phút cuối của một giờ.

## 5. Kiểm tra nhanh trước giờ demo (3 phút)

```powershell
npm test                                   # kỳ vọng: tests 73, pass 73, fail 0
python tests/e2e/browser_acceptance.py     # tùy chọn; kỳ vọng: SUMMARY: 130 PASS / 0 FAIL / 130 checks
```

Script trình duyệt tự khởi động máy chủ ở một cổng trống, tự tắt khi xong và ghi ảnh vào `docs/demo/screenshots/`. Thêm `--headed` để xem trình duyệt chạy, `--no-screenshots` để không ghi đè ảnh.

## 6. Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| `OSError: [WinError 10048]` / cổng 5173 bận | Xem tiến trình: `Get-NetTCPConnection -LocalPort 5173 \| Select-Object OwningProcess` rồi `Get-Process -Id <PID>`. Đóng máy chủ cũ, hoặc dùng cổng khác: `python -m http.server 5174 --bind 127.0.0.1` và mở `http://127.0.0.1:5174/`. |
| `python` không được nhận diện | Dùng `py -m http.server 5173 --bind 127.0.0.1`. |
| Trang trắng / không có dữ liệu | Địa chỉ phải là `http://127.0.0.1:5173/` (không phải `file://`), máy chủ chạy **từ thư mục gốc repo**; mở F12 → Console xem lỗi. |
| Vẫn thấy giao diện cũ (6 trang) | Sai nhánh hoặc bộ nhớ đệm: `git branch --show-current`, `git pull`, rồi tải lại cứng **Ctrl+F5**. |
| Số liệu khác kịch bản | Có thao tác thừa hoặc đang bật *Tự động* → tắt *Tự động*, bấm **Đặt lại dữ liệu**, làm lại bước đang dở. |
| `npm test` báo lỗi `node` | Cài Node.js LTS; ứng dụng vẫn chạy được mà không cần Node. |

Tài liệu liên quan: [kịch bản demo](DEMO_SCRIPT_8_TO_12_MIN.md) · [checklist](DEMO_CHECKLIST.md) · [bằng chứng kiểm thử](DEMO_EVIDENCE.md) · [FAQ cho giảng viên](FAQ_FOR_LECTURER.md) · [đối chiếu UC ↔ web ↔ báo cáo](../UC_UI_PDF_SYNC.md)
