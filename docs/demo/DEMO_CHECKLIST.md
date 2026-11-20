# Checklist demo (đánh dấu khi tập dượt)

Mỗi mục: **thao tác → điều kiện thành công chính xác**. Trừ khi ghi khác, bắt đầu từ trang vừa tải lại (F5) tại `http://127.0.0.1:5173/`, giao diện English. Ghi chú AT/FR theo [tests/ACCEPTANCE_TESTS.md](../../tests/ACCEPTANCE_TESTS.md).

**Quy trình đặt lại (dùng giữa các nhóm mục):** bấm *Stop auto updates* nếu đang bật → **F5** → kiểm tra 4 thẻ Hub về `4/8`, `7/10`, `5/12`, `3/6` và ô thông báo trống.

## 0. Trước giờ demo

- [ ] `git branch --show-current` → `release/demo-readiness` (hoặc `main` sau khi merge)
- [ ] `npm test` → `tests 47`, `pass 47`, `fail 0`
- [ ] *(tùy chọn)* `python tests/e2e/browser_acceptance.py` → `SUMMARY: 93 PASS / 0 FAIL / 93 checks`
- [ ] `python -m http.server 5173 --bind 127.0.0.1` đang chạy; trang mở được, DevTools Console không có lỗi đỏ
- [ ] Có sẵn tab 2 cho bước hết hạn: `http://127.0.0.1:5173/?holdSeconds=20`

## 1. Student

- [ ] **AT-01** Mở trang → 4 thẻ Hub, mỗi thẻ có *Parking x/y occupied · n reserved*, *Vehicles n available*, *Charging n points available*
- [ ] **AT-02** Hub `Metro Hub` + Minimum battery `80` → chỉ **EV-01 (82%)**
- [ ] **AT-02** Minimum parking `5` + *Charging point required* → Matching Hubs chỉ **University Hub**
- [ ] **AT-03** Bảng *Shared vehicles* có 6 xe, mỗi xe có Battery và Status (EV-04 = *Charging*)
- [ ] **AT-04** EV-01 **Reserve** → thông báo `EV-01 reserved for STUDENT-DEMO until …`, Status *Reserved*, hold *Active* + giờ hết hạn (≈ 15 phút sau)
- [ ] **AT-04 (hết hạn)** Tab `?holdSeconds=20` → Reserve EV-01, chờ 20 giây → *Available*, hold *Expired*, thông báo đỏ `Reservation hold expired before pickup: EV-01 is available again.`
- [ ] **AT-06** **Pick up** EV-01 → *In use*, thẻ Metro `3/8 occupied`
- [ ] **AT-07** Chọn `Dormitory Hub` → (bấm *Update simulated state* để trang vẽ lại, ô chọn vẫn là Dormitory) → **Return** → `EV-01 returned to Dormitory Hub; the reservation is completed.`, thẻ Dormitory `8/10`
- [ ] **AT-05** Reserve parking tại `Service Area Hub` 3 lần → lần 3 báo `…; 0 spaces left.`; lần 4 báo đỏ `No parking capacity available at Service Area Hub.`
- [ ] **AT-08** Charging requests: `Metro Hub`, `EV-02` → **Submit** → `Charging request for EV-02 added to the queue at Metro Hub.`; ô pin bị khóa ở giá trị pin thật (28)
- [ ] **AT-09** Private EV `Private EV A`, pin `35` → `Parking held at Metro Hub and charging request for Private EV A queued. …`; thẻ Metro tăng *1 reserved*

## 2. Operator

- [ ] **AT-10** Chỉ số: `Hubs monitored 4`, `Vehicles available 5/6`, `Charging points available 4/5`, `Open incidents 0`, `Queued charging 0` (trang mới)
- [ ] **AT-11** Ô chọn *Vehicle failure* / *Charging point unavailable* hiện trạng thái từng xe/trụ (vd. `EV-04 · Charging`, `CP-03 · Dormitory Hub · Occupied`)
- [ ] **AT-12** Giữ 3 chỗ ở Dormitory → bảng rủi ro dòng 1 **Dormitory Hub · 10/10 used · 0 free · #1 · at capacity**
- [ ] **AT-13** Trang mới → đề xuất `Consider redistributing vehicles from Dormitory Hub to University Hub.` → **Coordinate one vehicle** → `EV-03 coordinated from Dormitory Hub to University Hub.`
- [ ] **AT-14** `EV-02` → **Mark vehicle failed** → `EV-02 marked failed and incident opened.`; `CP-01` → **Mark point unavailable** → `CP-01 marked unavailable and incident opened.`; danh sách sự cố có 2 mục *Open*
- [ ] **AT-15** Xếp hàng EV-02 (28%, upcoming), Private EV A (35%), Private EV B (70%) tại Metro → **Apply schedule** Metro → `2 newly assigned, 1 waiting, 0 on hold`; EV-02→CP-01, A→CP-02, B *Waiting*

## 3. Mô phỏng

- [ ] **AT-16/17/18** Lần lượt chạy đủ 5 kịch bản (Focus Hub `Metro Hub`) → mỗi lần có `Live state unchanged: yes`, 5 ô tác động "trước → sau", ít nhất 1 đề xuất; thẻ Hub và bảng rủi ro **không đổi**
- [ ] **AT-19** **Update simulated state** 4 lần (trang mới) → lần lượt: `Telemetry update: EV-01 battery is now 81%.` → `Parking sensor update: Metro Hub occupancy is now 5/8.` → `Charging telemetry update: CP-01 is temporarily occupied.` → `Operational event update: …`
- [ ] **AT-19 (tự động)** **Start auto updates** → trong ~15 giây dải trạng thái đổi → **Stop auto updates** → `Automatic simulated updates paused.`
- [ ] **AT-20** **Use dark mode** → nền tối; **VI / EN** = `Tiếng Việt` → toàn bộ chữ và thông báo tiếng Việt; đổi lại `English` → dữ liệu và thao tác vẫn giữ nguyên

## 4. Phi chức năng

- [ ] **NFR-01 / D-005** Cập nhật thủ công hiện **ngay**; tự động mỗi 15 giây
- [ ] **NFR-02** Không thể có 2 lượt giữ *Active* cho một xe (kiểm thử `NFR-02: a second student cannot reserve…`)
- [ ] **NFR-03** Không xác nhận vượt sức chứa: chỗ đỗ (AT-05, AT-12), trả xe (AT-07 ngoại lệ), trụ sạc (`schedule … never more assignments than free points`), bộ mô phỏng (`GUARD (D-004)`)
- [ ] **NFR-04** Chạy chỉ với máy chủ tĩnh, không backend/CSDL; F5 đặt lại dữ liệu
- [ ] **NFR-05 / D-006** Mọi thao tác có thông báo xanh/đỏ và trạng thái được vẽ lại ngay
- [ ] DevTools Console không có lỗi/cảnh báo; màn hình hẹp (≈ 390 px) không cuộn ngang

## 5. Kiểm thử luồng lỗi

- [ ] Bấm **Submit charging request** 2 lần cho cùng xe → lần 2 đỏ `… already has a charging request in the queue.`
- [ ] Private EV với ô pin trống → đỏ `Enter a battery level from 0 to 100.`; nhãn trống → `Enter a label for the private EV.`
- [ ] Xếp hàng sạc EV-01, rồi **Reserve** EV-01, **Apply schedule** Metro → `No queued charging request can be assigned at Metro Hub now (0 waiting, 1 on hold).`, lịch ghi **On hold: vehicle is reserved**, Metro vẫn `2 free points`
- [ ] Trả xe về Hub đầy → đỏ `… has no free parking space; choose another Hub.`, xe vẫn *In use*
- [ ] Đánh dấu hỏng lại cùng một xe → đỏ `EV-02 is already marked as failed.`
- [ ] Xe đã giữ: dịch vụ chặn sinh viên khác nhận/giữ xe (kiểm thử `AT-06 …`, `NFR-02 …` trong `tests/unit/reservationService.test.js`)
- [ ] `?holdSeconds=5` (ngoài khoảng 10–3600) → trang vẫn ghi `Hold duration: 15 minutes.`
