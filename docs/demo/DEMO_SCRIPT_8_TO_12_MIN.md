# Kịch bản demo 8–12 phút

Chạy **liên tục trên một lần tải trang** (tab 1); riêng phần hết hạn giữ xe dùng tab 2. Giao diện mặc định tiếng Việt. Mọi câu trong cột "Kỳ vọng" là thông báo thật trên màn hình (góc phải dưới) và đã được phát lại tự động bằng kịch bản S11 trong `tests/e2e/browser_acceptance.py` ([DEMO_EVIDENCE.md](DEMO_EVIDENCE.md)). Giờ `hh:mm:ss` tùy lúc bấm.

**Chuẩn bị:** máy chủ đang chạy ([START_HERE.md](START_HERE.md)); tab 1 mở `http://127.0.0.1:5173/`, bấm **Đặt lại dữ liệu** (góc trái dưới) nếu đã thao tác trước đó; **không** bật *Tự động* trước bước 8.

Bản rút gọn 8 phút: bỏ bước 3; ở bước 6 bỏ phần điều phối xe; ở bước 7 chỉ chạy 1 kịch bản.

---

## Bước 0 — Giới thiệu (0:00–0:40)

> "Đây là MVP Smart E-Mobility Hub: web tĩnh HTML/CSS/JavaScript, dữ liệu mô phỏng trong bộ nhớ, kiến trúc phân lớp UI → Services → Domain/State → Data. Thanh bên có hai cổng: **Cổng sinh viên** (2 trang) và **Cổng vận hành** (4 trang); thanh trên có cập nhật dữ liệu, chế độ tối và VI/EN."

Trang **Tìm & đặt xe**: 4 ô Hub — Metro Hub **4/8**, Dormitory Hub **7/10**, University Hub **5/12**, Service Area Hub **3/6** (FR-01).

## Bước 1 — Tìm xe phù hợp (0:40–1:20) · FR-02, FR-03

| Thao tác | Kỳ vọng |
|---|---|
| **Hub** = `Metro Hub`, **Pin tối thiểu (%)** = `80` | Bảng chỉ còn **EV-01 · 82% · Sẵn sàng** |
| *(tùy chọn)* bỏ tick **Chỉ xe sẵn sàng** | Hiện đủ xe kèm trạng thái (EV-04 *Đang sạc*) |
| Trả bộ lọc: `Tất cả Hub`, `0`, tick lại **Chỉ xe sẵn sàng** | Danh sách đầy đủ |

**Ý nghĩa:** tìm kiếm dựa trên trạng thái hiện tại; các ô *Có trụ trống / Còn chỗ đỗ* làm mờ Hub không phù hợp.

## Bước 2 — Giữ → nhận → trả xe (1:20–2:40) · FR-04, FR-06, FR-07

| Thao tác | Kỳ vọng |
|---|---|
| **Đặt giữ** ở dòng EV-01 | `Đã giữ EV-01 đến hh:mm:ss.` · thẻ **Chuyến đi của tôi**: *Đã giữ*, đồng hồ **15:00** đếm ngược · các nút Đặt giữ khác bị khóa (mỗi sinh viên một chuyến) |
| **Nhận xe** | `Đã nhận EV-01 tại Metro Hub.` · ô Metro **3/8** |
| **Trả xe tại** = `Dormitory Hub · trống 3` → **Trả xe** | `Đã trả EV-01 tại Dormitory Hub.` · ô Dormitory **8/10** · dòng *Chuyến trước: EV-01 → Dormitory Hub · Hoàn tất* |

**Ý nghĩa:** lượt giữ tạm thời ngăn hai người cùng lấy một xe (NFR-02); chỉ người giữ mới nhận được xe; trả xe cập nhật vị trí và chỗ đỗ.

## Bước 3 — Hết hạn giữ và hủy giữ (2:40–3:30) · FR-04 luồng thay thế · *bỏ ở bản 8 phút*

| Thao tác | Kỳ vọng |
|---|---|
| Tab 2: `http://127.0.0.1:5173/?holdSeconds=20` | Chân thẻ: `Thời gian giữ xe: 20 giây (thiết lập demo).` |
| **Đặt giữ** EV-01, nói tiếp ~20 giây | Tự hiện thông báo đỏ `Hết thời gian giữ: EV-01 đã sẵn sàng trở lại.` · *Chuyến trước: EV-01 · Hết hạn* |
| *(tùy chọn)* **Đặt giữ** EV-02 → **Hủy giữ** | `Đã hủy giữ EV-02.` |
| Đóng tab 2 | Tab 1 không bị ảnh hưởng (mỗi tab có dữ liệu riêng) |

**Ý nghĩa:** hết hạn trước khi nhận xe thì hệ thống tự trả xe về trạng thái sẵn sàng; 20 giây chỉ là tham số demo hiển thị công khai, mặc định 15 phút (D-007, D-012).

## Bước 4 — Sức chứa chỗ đỗ (3:30–4:50) · FR-05, FR-07 (ngoại lệ), FR-12

| Thao tác | Kỳ vọng |
|---|---|
| **Đặt giữ** EV-05 → **Nhận xe** | `Đã nhận EV-05 tại University Hub.` |
| Trang **Đỗ xe & sạc** → **Hub** = `Dormitory Hub · trống 2` → **Giữ chỗ** 2 lần | `Đã giữ chỗ tại Dormitory Hub; còn 1 chỗ.` rồi `…; còn 0 chỗ.` |
| **Giữ chỗ** lần 3 | Đỏ: `Dormitory Hub đã hết chỗ đỗ.` |
| Trang **Tìm & đặt xe** → **Trả xe tại** `Dormitory Hub · hết chỗ` → **Trả xe** | Đỏ: `Dormitory Hub đã hết chỗ; hãy chọn Hub khác.` · chuyến vẫn *Đang sử dụng* |
| Trang **Giám sát mạng lưới** | Dòng đầu **Dormitory Hub · 10/10 · giữ 2 · 100% · #1 · Hết chỗ** |
| Về **Tìm & đặt xe** → trả tại `University Hub` | `Đã trả EV-05 tại University Hub.` |

**Ý nghĩa:** sức chứa = xe đang đỗ + chỗ đang giữ (D-004); hệ thống không bao giờ xác nhận vượt sức chứa (NFR-03).

## Bước 5 — Yêu cầu sạc và sạc thông minh (4:50–6:40) · FR-08, FR-09, FR-15

Trang **Đỗ xe & sạc**, thẻ **Yêu cầu sạc**:

| Thao tác | Kỳ vọng |
|---|---|
| **Xe dùng chung** · Hub `Metro Hub · trụ trống 2` · Xe `EV-02 · 28%` → **Gửi yêu cầu sạc** | `EV-02 đang sạc tại CP-01.` (trụ trống được cấp ngay) |
| **Xe cá nhân** · Biển số `51A-111.11` · Pin `35` → **Giữ chỗ & đặt lịch sạc** | `Đã giữ chỗ tại Metro Hub; 51A-111.11 đang sạc tại CP-02.` |
| Biển số `51B-222.22` · Pin `60` → gửi | `Đã giữ chỗ tại Metro Hub; 51B-222.22 đang chờ sạc (#1).` (hết trụ) |
| Biển số `51C-333.33` · Pin `10` · tick **Cần dùng sớm** → gửi | `Đã giữ chỗ tại Metro Hub; 51C-333.33 đang chờ sạc (#1).` — **vượt lên trước** 51B |
| Trang **Sạc thông minh** | Hàng đợi: **51C-333.33** (ưu tiên 1090, #1) rồi **51B-222.22** (40, #2) |
| **Sạc xong** ở dòng CP-01 | `EV-02 đã sạc xong; 51C-333.33 được chuyển vào CP-01.` |

**Ý nghĩa:** điểm ưu tiên = cần dùng sớm (+1000) + (100 − % pin); trụ trống luôn được cấp cho yêu cầu ưu tiên nhất, không bao giờ vượt số trụ (D-015). Xe dùng chung lấy pin từ dữ liệu xe, chỉ hiện xe đủ điều kiện (D-008, D-009).

## Bước 6 — Giám sát, điều phối và xử lý sự cố (6:40–8:40) · FR-10, FR-11, FR-13, FR-14

| Thao tác | Kỳ vọng |
|---|---|
| Trang **Giám sát mạng lưới**: các chỉ số | Hub `4` · Xe sẵn sàng `5/6` · Trụ trống `2/5` · Sự cố đang mở `0` · Chờ sạc `1` |
| Thẻ **Điều phối xe** (`Dormitory Hub → University Hub`, tối đa 2 xe) → **Điều phối 1 xe** | `Đã điều phối EV-01 từ Dormitory Hub đến University Hub.` |
| Trang **Sự cố** → Trụ sạc `CP-02` → **Báo trụ ngừng hoạt động** | `Đã báo CP-02 ngừng hoạt động (INC-001).` (51A-111.11 bị đưa lại hàng đợi) |
| Phương tiện `EV-03` → **Báo xe hỏng** | `Đã báo hỏng EV-03 (INC-002).` · danh sách: 2 sự cố *Đang mở* |
| INC-001 → **Khôi phục trụ** | `CP-02 hoạt động trở lại; 51A-111.11 được chuyển vào sạc.` |
| INC-002 → **Đã sửa xong** | `EV-03 đã sửa xong, sẵn sàng tại Dormitory Hub.` · `0 đang mở · 2 đã xử lý` |

**Ý nghĩa:** sự cố được ghi nhận **và xử lý xong**: xe/trụ quay lại phục vụ, trụ được cấp ngay cho yêu cầu đang chờ (D-016).

## Bước 7 — Mô phỏng What-if (8:40–9:50) · FR-16, FR-17, FR-18

Trang **Mô phỏng What-if**, **Hub trọng tâm** = `Metro Hub`:

| Thao tác | Kỳ vọng |
|---|---|
| **Kịch bản** = `Mobility Hub đầy chỗ đỗ` → **Chạy mô phỏng** | Nhãn **Dữ liệu thật không đổi** · bảng *Trước/Sau*: Xe đang đỗ `19 → 24`, Hub rủi ro cao nhất `Dormitory Hub → Metro Hub` (dòng thay đổi được tô màu) · đề xuất `Điều hướng xe đến khỏi Metro Hub.` |
| *(bản 12 phút)* `Nhu cầu sạc tăng đột biến` → chạy | Chờ sạc `1 → 4` · đề xuất `Ưu tiên sạc xe pin thấp và xe cần dùng sớm.` |

Ba kịch bản còn lại có trong danh sách. **Ý nghĩa:** mô phỏng chạy trên bản sao, áp dụng cùng quy tắc như hệ thống thật; "Dữ liệu thật không đổi" được kiểm chứng bằng so sánh ảnh chụp trạng thái (D-013).

## Bước 8 — Cập nhật mô phỏng và chế độ giao diện (9:50–11:10) · FR-19, FR-20

| Thao tác | Kỳ vọng |
|---|---|
| **Cập nhật dữ liệu** | Dải trạng thái: `Telemetry: pin EV-01 còn 81%. · hh:mm:ss` |
| **Tự động: tắt** → bấm | `Đã bật cập nhật tự động: mỗi 15 giây.` · ~15 giây sau dải trạng thái đổi (`Cảm biến chỗ đỗ: Metro Hub 4/8.`) |
| **Tự động: bật** → bấm | `Đã tắt cập nhật tự động.` |
| **Chế độ tối**, rồi **VI / EN** = `EN` | Giao diện tối, toàn bộ chữ sang tiếng Anh, dữ liệu giữ nguyên |
| Chọn lại `VI`, bấm **Chế độ sáng** | Trở lại như cũ |

## Bước 9 — Kết (11:10–12:00)

> "Nhóm có 60 kiểm thử đơn vị (`npm test`, không cần thư viện) và 101 kiểm tra trên trình duyệt thật Chrome/Edge, gồm phát lại đúng kịch bản này. MVP không có đăng nhập, thanh toán, CSDL hay IoT thật — đúng ràng buộc đề bài."

---

## Khi có sự cố trong lúc demo

| Tình huống | Xử lý |
|---|---|
| Số liệu lệch kịch bản (bấm thừa) | Bấm **Đặt lại dữ liệu** rồi làm lại **bước đang dở**. Từ dữ liệu gốc: bước 4 cần giữ **3** chỗ ở Dormitory (7/10); bước 5 ô Xe có thêm EV-01; bước 6 điều phối **EV-03**. |
| Lỡ bật tự động | Bấm **Tự động: bật** để tắt; nếu số liệu đã lệch thì **Đặt lại dữ liệu**. |
| Thông báo biến mất trước khi kịp đọc | Thông báo tự ẩn sau 8 giây; kết quả vẫn thể hiện ở bảng/thẻ tương ứng. |
| Giảng viên hỏi "hai sinh viên cùng giữ một xe?" | UI dùng một danh tính demo (D-003); quy tắc có kiểm thử: `NFR-02: a second student cannot reserve…`, `AT-06: pickup requires the same student's…`. |
| Trang trắng | Xem [START_HERE.md mục 6](START_HERE.md#6-xử-lý-sự-cố). |
