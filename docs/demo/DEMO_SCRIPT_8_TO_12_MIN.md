# Kịch bản demo 8–12 phút

Mục tiêu: cho thấy web chạy đúng **các use case trong báo cáo**, theo đúng thứ tự tác nhân của sơ đồ use case và đúng các luồng chính/thay thế/ngoại lệ của 5 use case chi tiết (UC-02, UC-04, UC-09, UC-15, UC-17). Kịch bản này được phát lại tự động mỗi lần chạy `tests/e2e/browser_acceptance.py` (S12).

**Chuẩn bị:** mở `http://127.0.0.1:5173/`, bấm **Đặt lại dữ liệu**, tắt *Tự động*. Không bắt đầu vào 2 phút cuối của một giờ (khung giờ sạc theo giờ đồng hồ).

| # | Thời lượng | Trang | Use case |
|---|---|---|---|
| 0 | 0:30 | (thanh bên) | Tổng quan tác nhân |
| 1 | 1:30 | Tìm Hub / phương tiện | UC-02 |
| 2 | 2:00 | Đặt giữ xe dùng chung | UC-04, UC-06, UC-07 |
| 3 | 1:30 | Đặt lịch sạc xe cá nhân | UC-09 |
| 4 | 1:00 | Quản lý sạc thông minh | UC-16 |
| 5 | 1:30 | Giám sát mạng lưới → Điều phối xe → Thực hiện điều chuyển | UC-11..UC-14, Dispatch Staff |
| 6 | 1:30 | Xử lý sự cố vận hành → Xử lý sự cố được giao | UC-15, Maintenance Staff |
| 7 | 1:30 | Mô phỏng What-if | UC-17, UC-18 |
| 8 | 0:30 | Thanh trên | UC-20, UC-10/19 |

## 0. Tổng quan (30 giây)

- Thanh bên là **sơ đồ use case** của nhóm: Cổng sinh viên (Shared Vehicle User, Private EV Owner), Cổng vận hành (Operator), Nhân viên hiện trường (Vehicle Dispatch Staff, Maintenance Staff). Tên tiếng Anh (đổi *EN*) trùng tên use case trong báo cáo.
- 12 Mobility Hub, dữ liệu mô phỏng; thanh trạng thái hiện cập nhật mới nhất của Data Simulator.

## 1. UC-02 Find Suitable Hub / Vehicle (1 phút 30)

1. Vị trí mặc định **Ga Metro ĐHQG**, bán kính 1 km → 5 Hub, gần nhất trước, có khoảng cách và thời gian đi bộ, chỗ trống, xe sẵn sàng, cổng trống.
2. *Điểm đến*: **KTX Khu A** → dòng "Chỗ trả xe gần điểm đến" (A2).
3. *Loại xe* **Xe đạp điện**, *Pin tối thiểu* **50** → chỉ còn **EB-101** (A1). Trả bộ lọc về *Tất cả*, 0.
4. E1: *Vị trí* **Khoa Y - ĐHQG-HCM** → "Không có Mobility Hub nào trong 1 km. Hãy tăng bán kính." Chọn lại **Ga Metro ĐHQG**.
5. (Nói) E2: bỏ trống vị trí sẽ báo "Chưa xác định được vị trí…"; E3: dữ liệu quá 5 phút chưa cập nhật có cảnh báo.

## 2. UC-04 Reserve Shared Vehicle → UC-06 → UC-07 (2 phút)

1. Ở xe **EM-203**, bấm **Đặt xe** → màn hình *Xác nhận đặt xe* (Hub, trạng thái, pin, quãng đường).
2. Mở *Mô phỏng ngoại lệ (demo)* → **Người khác đặt xe này trước (E3)** → bấm **Xác nhận đặt xe** → "EM-203 vừa được người khác đặt. Hãy chọn xe khác." (không tạo lượt đặt cho mình).
3. **Chọn xe khác** → ở **EB-101** bấm **Đặt xe** → **Xác nhận đặt xe** → *Đặt xe thành công*: Sẵn sàng → Đã giữ, **RSV-002**, tạo lúc, hết hạn giữ, giữ cho STUDENT-DEMO, đồng hồ 15:00.
4. (Nói) A1 *Hủy* trước khi xác nhận thì xe vẫn Sẵn sàng; A3 hết hạn: mở `?holdSeconds=20` để xem tự hết hạn; E2 có nút mô phỏng tương tự.
5. **Nhận xe** → "Đã nhận EB-101 tại Ga Metro ĐHQG." → *Trả xe tại* **Thư viện Trung tâm** → **Trả xe** → *Lịch sử đặt xe* có RSV-002 Hoàn tất.

## 3. UC-09 Schedule Private EV Charging (1 phút 30)

1. *Mobility Hub* **KTX Khu A**, *Hôm nay*, khung giờ hiện tại (đang "hết chỗ" vì EM-201 đang sạc) → **Kiểm tra & xem chi tiết** → "… đã kín lịch …" kèm **khung giờ khác** và **Hub khác** (A1).
2. Bấm khung giờ kế tiếp → *Chi tiết đặt lịch* (Hub, ngày, khung giờ, xe, pin, mức ưu tiên) → **Xác nhận đặt lịch** → *Đặt lịch sạc thành công*, trạng thái *Đã đặt lịch* (như mockup).
3. **Đặt lịch khác** → Hub **Ga Metro ĐHQG**, khung giờ hiện tại, biển số **51A-678.90**, pin **15** → chi tiết hiện **Ưu tiên cao** (ADR-05) → xác nhận → "Đã đặt lịch: 51A-678.90 đang sạc tại CP-01."
4. (Nói) A3 *Hủy* không tạo lịch; E1 Hub không còn cổng hoạt động; E2 có nút mô phỏng "Không đọc được trạng thái cổng sạc".

## 4. Manage Smart Charging (1 phút)

1. Trang *Quản lý sạc thông minh*, Hub **Ga Metro ĐHQG**: CP-01 đang sạc 51A-678.90.
2. *Thêm xe dùng chung vào lịch sạc*: **EB-102** → **Xếp lịch sạc** → "EB-102 đang sạc tại CP-02." (nhãn *Ưu tiên* vì xe cần dùng sớm).
3. Bảng *Lịch sạc & hàng đợi ưu tiên*: khung giờ, nguồn, pin, điểm ưu tiên; có *Dời khung sau*, *Hủy*, *Tối ưu lịch*.
4. CP-01 → **Sạc xong** → "51A-678.90 đã sạc xong tại CP-01." (Có thể mở lại *Đặt lịch sạc xe cá nhân* để thấy dòng *Thông báo* gửi sinh viên.)

## 5. Monitor → Redistribute → Execute Redistribution Task (1 phút 30)

1. *Giám sát mạng lưới*: KPI; **Cảnh báo vận hành** theo ngưỡng cấu hình (≥ 85 %): *ĐH Kinh tế - Luật* quá tải, *Nhà Văn hóa Sinh viên* thiếu xe (lúc này *Ga Metro ĐHQG* cũng thiếu xe vì xe ở đó đang được giữ hoặc đang sạc); ngưỡng đổi được ngay trên trang.
2. *Điều phối xe*: đề xuất **ĐH Kinh tế - Luật → Nhà Văn hóa Sinh viên** → **Tạo lệnh theo đề xuất** → DSP-001 *Đã phân công* cho DISPATCH-DEMO.
3. *Thực hiện điều chuyển* (thanh trên đổi sang DISPATCH-DEMO): **Bắt đầu** → **Hoàn tất** → "EM-208 đã đến Nhà Văn hóa Sinh viên (DSP-001)."

## 6. UC-15 Handle Operational Incident → Resolve Assigned Incident (1 phút 30)

1. *Xử lý sự cố vận hành*: *Cổng sạc* **CP-02** → **Ghi nhận sự cố cổng sạc** → INC-001 *Mới ghi nhận*.
2. Bước 1: loại **Mất điện / quá tải cổng sạc**, mức độ **Cao** → **Xác nhận và tiếp nhận sự cố**.
3. Bước 2 "Cần sửa chữa kỹ thuật?": **Có — giao MAINT-DEMO** → *Đã phân công*, CP-02 *Ngừng phục vụ*; phiên của EB-102 tự chuyển sang CP-01.
4. *Xử lý sự cố được giao* (MAINT-DEMO): **Bắt đầu xử lý** → **Hoàn tất & khôi phục** → "CP-02 đã hoạt động trở lại." → quay lại trang sự cố: *Đã giải quyết*.
5. (Nói) Nhánh không cần sửa: **Không — khôi phục vận hành ngay**; nút **Xác nhận không khả dụng** như mockup.

## 7. UC-17 Run What-if Simulation (1 phút 30)

1. Biểu mẫu như mockup: *Lượng người đến ga Metro tăng đột biến*, Hub **Ga Metro ĐHQG**, **+150 %**, **0** cổng ngừng, **2 giờ tới** → **Chạy mô phỏng**.
2. Thẻ *Ga Metro ĐHQG* **ĐIỂM NGHẼN NGHIÊM TRỌNG** (chỗ đỗ vượt ngưỡng, thiếu xe), *KTX Khu B* **DƯ THỪA**; nhãn *Dữ liệu thật không đổi*.
3. Đề xuất: **[Điều phối xe]**, **[Điều hướng người dùng]** (và **[Sạc thông minh]** ở các kịch bản sạc).
4. **Lưu kịch bản** → danh sách *Kịch bản đã lưu*. **Áp dụng đề xuất** → tạo lệnh điều chuyển cho nhân viên điều phối.
5. (Nói) Tham số sai (ví dụ −1 %, số cổng vượt tổng) bị từ chối; mô phỏng có giới hạn thời gian.

## 8. Data Simulator và giao diện (30 giây)

1. **Cập nhật dữ liệu** → thanh trạng thái "Telemetry: pin … còn …%"; *Tự động* cập nhật mỗi 15 giây.
2. **EN** → tên trang là tên use case tiếng Anh; **Chế độ tối**.
3. **Đặt lại dữ liệu** để kết thúc.

## Nếu có sự cố khi demo

- Kết quả khác dự kiến: tắt *Tự động*, **Đặt lại dữ liệu**, làm lại từ bước đang dở.
- Mất mạng không ảnh hưởng: ứng dụng chạy hoàn toàn trên máy.
