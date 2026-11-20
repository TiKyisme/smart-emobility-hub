# Kịch bản demo 8–12 phút

Kịch bản chạy **liên tục trên một lần tải trang** (tab 1), riêng phần hết hạn giữ xe dùng tab 2. Mọi thông báo trong ô "Kỳ vọng" là chữ thật trên màn hình (giao diện English mặc định) và đã được phát lại tự động: kịch bản S11 trong `tests/e2e/browser_acceptance.py` (xem [DEMO_EVIDENCE.md](DEMO_EVIDENCE.md)). Giờ (`hh:mm:ss AM`) tùy lúc bạn bấm.

**Chuẩn bị:** máy chủ đang chạy ([START_HERE.md](START_HERE.md)), tab 1 mở `http://127.0.0.1:5173/` vừa tải lại (F5), zoom trình duyệt 80–90% nếu màn chiếu nhỏ, **không** bật *Start auto updates* trước bước 8.

| Bản rút gọn 8 phút | Bỏ bước 3, ở bước 6 chỉ làm 6.1–6.3, ở bước 7 chỉ chạy 1 kịch bản. |
|---|---|

---

## Bước 0 — Mở đầu (0:00–0:40)

> **Nói:** "Đây là MVP của Smart E-Mobility Hub: một trang web tĩnh HTML/CSS/JavaScript, dữ liệu mô phỏng trong bộ nhớ, kiến trúc phân lớp UI → Services → Domain/State → Simulated Data. Trang có hai không gian: Student và Operator."

- Chỉ vào 4 thẻ Hub: **Metro Hub 4/8 occupied**, **Dormitory Hub 7/10**, **University Hub 5/12**, **Service Area Hub 3/6**.
- **Ý nghĩa nghiệp vụ (FR-01):** sinh viên thấy ngay trạng thái chỗ đỗ, xe sẵn sàng và trụ sạc của từng Hub.

## Bước 1 — Tìm xe/Hub phù hợp (0:40–1:30) · FR-02, FR-03

| Thao tác | Kỳ vọng |
|---|---|
| Ô **Find a suitable vehicle / Hub**: **Hub** = `Metro Hub`, **Minimum battery (%)** = `80` | Chỉ còn **EV-01 · Metro Hub · 82% battery** với nút **Reserve** |
| *(tùy chọn)* **Hub** = `All Hubs`, **Minimum battery** = `0`, **Minimum parking spaces** = `5`, tick **Charging point required** | **Matching Hubs**: chỉ `University Hub · 7 parking · 1 charging`; xe **EV-05** |
| Trả bộ lọc về `All Hubs`, `0`, `0`, bỏ tick | Danh sách đầy đủ |

- **Ý nghĩa:** tìm kiếm dùng trạng thái hiện tại (xe *available*, mức pin, chỗ đỗ còn cấp phát, trụ sạc trống).

## Bước 2 — Giữ xe → nhận xe → trả xe (1:30–3:00) · FR-04, FR-06, FR-07

Bảng **Shared vehicles**, hàng **EV-01**:

| Thao tác | Kỳ vọng |
|---|---|
| **Reserve** | Thông báo xanh: `EV-01 reserved for STUDENT-DEMO until hh:mm:ss AM. Pick it up before the hold expires.` · Status **Reserved** · cột hold **Active / Hold expiry: …** (15 phút sau) |
| **Pick up** | `EV-01 picked up from Metro Hub. Return it to a Hub with free parking.` · Status **In use** · thẻ Metro **3/8 occupied** |
| Ô chọn cạnh nút Return = `Dormitory Hub` → **Return** | `EV-01 returned to Dormitory Hub; the reservation is completed.` · EV-01 ở **Dormitory Hub**, **Available**, hold **Completed** · thẻ Dormitory **8/10 occupied** |

- **Ý nghĩa:** lượt giữ tạm thời ngăn hai người cùng lấy một xe (NFR-02); chỉ người đang giữ mới nhận được xe; trả xe cập nhật vị trí và chỗ đỗ.
- Có thể nói thêm: ô chọn Hub trả xe **giữ nguyên lựa chọn** kể cả khi trang tự cập nhật (lỗi cũ đã sửa).

## Bước 3 — Hết hạn giữ xe (3:00–3:50) · FR-04 luồng thay thế · *bỏ qua ở bản 8 phút*

| Thao tác | Kỳ vọng |
|---|---|
| Mở **tab 2**: `http://127.0.0.1:5173/?holdSeconds=20` | Dòng phụ dưới "Shared vehicles": `Hold duration: 20 seconds (demo setting from the page URL).` |
| **Reserve** EV-01, nói tiếp ~20 giây, không bấm gì | Thông báo đỏ tự xuất hiện: `Reservation hold expired before pickup: EV-01 is available again.` · Status **Available** · hold **Expired** |
| Đóng tab 2, quay lại tab 1 | Tab 1 không bị ảnh hưởng (mỗi tab có trạng thái riêng) |

- **Ý nghĩa:** hết hạn trước khi nhận xe → hệ thống tự giải phóng xe. Thời lượng 20 giây chỉ là tham số demo hiển thị công khai trên trang; mặc định vẫn là 15 phút (D-007, D-012).

## Bước 4 — Sức chứa chỗ đỗ và từ chối trả xe (3:50–5:10) · FR-05, FR-07 (ngoại lệ), FR-12

| Thao tác | Kỳ vọng |
|---|---|
| Hàng **EV-05**: **Reserve** rồi **Pick up** | `EV-05 picked up from University Hub. Return it to a Hub with free parking.` |
| Ô **Reserve parking**: **Selected Hub** = `Dormitory Hub` → **Reserve one parking space** 2 lần | `Parking space reserved at Dormitory Hub; 1 space left.` rồi `…; 0 spaces left.` |
| Bấm lần 3 | Đỏ: `No parking capacity available at Dormitory Hub.` |
| EV-05: chọn `Dormitory Hub` → **Return** | Đỏ: `Dormitory Hub has no free parking space; choose another Hub.` · EV-05 vẫn **In use** |
| Kéo xuống bảng **Mobility Hub network and capacity risk** | Dòng đầu **Dormitory Hub · 10/10 used · 0 free · #1 · at capacity** |
| EV-05: chọn `University Hub` → **Return** | `EV-05 returned to University Hub; the reservation is completed.` |

- **Ý nghĩa:** sức chứa = xe đang đỗ + chỗ đã giữ (D-004), nên hệ thống không bao giờ xác nhận vượt sức chứa (NFR-03); Hub đầy tự lên đầu bảng rủi ro.

## Bước 5 — Yêu cầu sạc và lịch sạc thông minh (5:10–6:50) · FR-08, FR-09, FR-15

Ô **Charging requests** (**Request type** = `Shared vehicle`, **Hub** = `Metro Hub`):

| Thao tác | Kỳ vọng |
|---|---|
| **Shared vehicle** = `EV-02 · 28% · Available` (ô pin khóa ở 28 — lấy từ dữ liệu xe) → **Submit charging request** | `Charging request for EV-02 added to the queue at Metro Hub.` |
| Bấm **Submit charging request** lần nữa | Đỏ: `EV-02 already has a charging request in the queue.` |
| **Request type** = `Private EV`, **Private EV label** = `Private EV A`, xóa trống **Battery level (%)** → **Reserve parking & schedule private EV** | Đỏ: `Enter a battery level from 0 to 100.` |
| **Battery level** = `35` → bấm lại | `Parking held at Metro Hub and charging request for Private EV A queued. Apply the schedule to assign a charging point.` |
| Label = `Private EV B`, battery = `70` → bấm | Tương tự cho `Private EV B` |
| Xem **Current charging queue** | `3 queued · 0 scheduled`: EV-02 *priority 1072* (upcoming use), Private EV A *65*, Private EV B *30* |
| Phần Operator → **Smart charging schedule** → **Apply schedule** của `Metro Hub` | `Charging schedule applied at Metro Hub: 2 newly assigned, 1 waiting, 0 on hold.` · **EV-02 → Assigned CP-01**, **Private EV A → Assigned CP-02**, **Private EV B → Waiting** · EV-02 thành **Charging** |

- **Ý nghĩa:** ưu tiên = nhu cầu sử dụng sắp tới trước, sau đó pin thấp hơn; Metro chỉ có 2 trụ trống nên chỉ 2 yêu cầu được phân (không vượt công suất). Xe cá nhân giữ chỗ đỗ ngay khi đăng ký.

## Bước 6 — Giám sát, điều phối và sự cố (6:50–8:40) · FR-10, FR-11, FR-13, FR-14

| # | Thao tác | Kỳ vọng |
|---|---|---|
| 6.1 | Chỉ các chỉ số Operator | `Hubs monitored 4` · `Vehicles available 4/6` · `Charging points available 2/5` · `Open incidents 0` · `Queued charging 1` |
| 6.2 | Khung đề xuất: "Consider redistributing vehicles from Dormitory Hub to University Hub. Move up to 2 vehicles based on current capacity." → **Coordinate one vehicle** | `EV-01 coordinated from Dormitory Hub to University Hub.` |
| 6.3 | **Vehicle failure** = `EV-02` → **Mark vehicle failed** | `EV-02 marked failed and incident opened.` · lịch Metro: EV-02 **On hold: vehicle failed**, Private EV B **Plan CP-01** (CP-01 được giải phóng) |
| 6.4 | **Apply schedule** (Metro) | `Charging schedule applied at Metro Hub: 1 newly assigned, 0 waiting, 1 on hold.` |
| 6.5 | **Charging point unavailable** = `CP-02` → **Mark point unavailable** | `CP-02 marked unavailable and incident opened.` |
| 6.6 | **Apply schedule** (Metro) | `No queued charging request can be assigned at Metro Hub now (1 waiting, 1 on hold).` · danh sách sự cố có 2 mục **Open**, chỉ số `Open incidents 2` |

- **Ý nghĩa:** sự cố xe/trụ sạc tự động giải phóng trụ, đưa yêu cầu về hàng đợi; lịch sạc không bao giờ phân trụ cho xe đang hỏng/đang được giữ và không vượt số trụ còn hoạt động.

## Bước 7 — What-if (8:40–10:00) · FR-16, FR-17, FR-18

Ô **What-if simulation**, **Focus Hub** = `Metro Hub`:

| Thao tác | Kỳ vọng |
|---|---|
| **Scenario** = `Mobility Hub reaches full parking capacity` → **Run hypothetical scenario** | `Live state unchanged: yes` · `Parking occupied 19 → 24` · `Top capacity risk Dormitory Hub → Metro Hub` · đề xuất: `Redirect arrivals or parking requests from Metro Hub while capacity is constrained.` + đề xuất điều phối xe · thông báo `Hypothetical scenario evaluated. Live network state was not changed.` |
| Chỉ lên thẻ Metro Hub | Vẫn **3/8 occupied · 2 reserved** — trạng thái thật không đổi |
| *(bản 12 phút)* **Scenario** = `Surge in charging demand` → Run | `Charging queue 2 → 5` · đề xuất `Rebuild the smart charging schedule so low-battery and upcoming-usage requests are served first.` |

- Ba kịch bản còn lại có sẵn trong danh sách: `Sudden Metro arrival surge`, `Partial charging-point failures`, `Excessive vehicle concentration`.
- **Ý nghĩa:** mô phỏng chạy trên bản sao sâu của trạng thái hiện tại; dòng "Live state unchanged" được kiểm chứng bằng so sánh ảnh chụp trạng thái trước/sau, không phải hằng số (D-013).

## Bước 8 — Cập nhật mô phỏng và tùy chỉnh giao diện (10:00–11:20) · FR-19, FR-20

| Thao tác | Kỳ vọng |
|---|---|
| **Update simulated state** (góc phải trên) | Dải trạng thái: `Telemetry update: EV-01 battery is now 81%. · hh:mm:ss AM`; bảng xe EV-01 **81%** |
| **Start auto updates** | `Automatic simulated updates started; the next update arrives in 15 seconds.` · ~15 giây sau dải trạng thái đổi sang `Parking sensor update: Metro Hub occupancy is now 4/8.` |
| **Stop auto updates** | `Automatic simulated updates paused.` |
| **Use dark mode** | Giao diện tối; nút đổi thành **Use light mode** |
| **VI / EN** = `Tiếng Việt` | Toàn bộ nhãn, trạng thái và thông báo chuyển sang tiếng Việt (vd. tiêu đề "Tìm tài nguyên và hoàn thành chuyến đi"); dữ liệu giữ nguyên |
| Chọn lại `English`, **Use light mode** | Trở về như cũ |

- **Ý nghĩa:** bộ mô phỏng thay cho cảm biến/IoT thật (được đề bài cho phép); chế độ giao diện gồm sáng/tối và VI/EN theo làm rõ của giảng viên ở Submission #2.

## Bước 9 — Kết (11:20–12:00)

> **Nói:** "Chúng em có 47 kiểm thử đơn vị chạy bằng `npm test` (không cần thư viện) và một bộ kiểm thử trình duyệt thật 93 kiểm tra trên Chrome và Edge, gồm cả việc phát lại đúng kịch bản vừa demo. Phạm vi MVP không có đăng nhập, thanh toán, CSDL hay IoT thật — đúng ràng buộc đề bài."

---

## Khi có sự cố trong lúc demo

| Tình huống | Xử lý |
|---|---|
| Số liệu khác kịch bản (bấm thừa) | Nói "em tải lại dữ liệu gốc", bấm **F5**, làm lại **bước đang dở**. Mỗi bước vẫn chạy được từ trang mới; khác biệt: bước 4 cần giữ **3** chỗ ở Dormitory (7/10); bước 5 danh sách xe Metro có thêm EV-01; bước 6.2 đề xuất chuyển **EV-03** từ Dormitory sang University. |
| Lỡ bật auto updates | Bấm **Stop auto updates**; nếu số liệu đã lệch thì F5. |
| Hết hạn giữ không hiện sau 20 giây | Tab 2 phải có `?holdSeconds=20`; dòng "Hold duration" phải ghi 20 seconds. Nếu vẫn lỗi: bỏ bước 3, nói về kiểm thử `FR-04 expiry boundary` trong `tests/unit/reservationService.test.js`. |
| Giảng viên hỏi "hai sinh viên cùng giữ một xe?" | UI dùng một danh tính demo (D-003) nên ẩn thao tác của người khác; quy tắc được kiểm thử tự động: `NFR-02: a second student cannot reserve…`, `AT-06: pickup requires the same student's…`. |
| Trang trắng | Xem [START_HERE.md mục 6](START_HERE.md#6-xử-lý-sự-cố). |
