# Checklist kiểm tra trước demo

Đánh dấu khi đã tự bấm thử trên máy trình chiếu. Mỗi mục ghi trang, thao tác và kết quả mong đợi (giao diện tiếng Việt, sau **Đặt lại dữ liệu**).

## A. Chuẩn bị

- [ ] `npm test` → `tests 73, pass 73, fail 0`.
- [ ] (Tùy chọn) `python tests/e2e/browser_acceptance.py --no-screenshots` → `130 PASS / 0 FAIL`.
- [ ] Máy chủ: `python -m http.server 5173 --bind 127.0.0.1`; mở `http://127.0.0.1:5173/`; thấy 11 trang ở thanh bên.
- [ ] Không bắt đầu vào 2 phút cuối của một giờ (khung giờ sạc).

## B. Cổng sinh viên

| Mã | Trang | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| AT-01/02 | Tìm Hub / phương tiện | Mở trang | Vị trí Ga Metro ĐHQG, bán kính 1 → 5 Hub gần nhất trước |
| AT-02 | 〃 | Loại xe Xe đạp điện, pin ≥ 50 | Chỉ EB-101 |
| AT-02 E1 | 〃 | Vị trí Khoa Y - ĐHQG-HCM | "Không có Mobility Hub nào trong 1 km…" |
| AT-02 E2 | 〃 | Bỏ chọn vị trí | "Chưa xác định được vị trí. Hãy chọn vị trí thủ công." |
| AT-03 | 〃 | Xem bảng xe | Loại xe, pin, quãng đường ước tính |
| AT-04 | Đặt giữ xe dùng chung | *Đặt xe* EB-101 → *Hủy* | "Chưa tạo lượt đặt; EB-101 vẫn Sẵn sàng." (A1) |
| AT-04 | 〃 | *Đặt xe* EB-101 → *Xác nhận đặt xe* | *Đặt xe thành công*, mã RSV-001, hết hạn sau 15 phút, đếm ngược |
| AT-04 E3 | 〃 | Xe khác → *Mô phỏng ngoại lệ* → E3 → xác nhận | "… vừa được người khác đặt. Hãy chọn xe khác." |
| AT-04 E2 | 〃 | *Mô phỏng ngoại lệ* → E2 → xác nhận; chờ 10 giây → xác nhận | Lần đầu báo thử lại; lần sau thành công |
| AT-04 A3 | `?holdSeconds=20` | Đặt xe, chờ 20 giây | Toast hết hạn, màn hình *Lượt đặt đã hết hạn* |
| AT-06 | 〃 | *Nhận xe* | "Đã nhận EB-101 tại Ga Metro ĐHQG." |
| AT-07 | 〃 | Trả tại Thư viện Trung tâm | "Đã trả EB-101 tại Thư viện Trung tâm."; lịch sử Hoàn tất |
| AT-05 | Đặt chỗ đỗ xe | Nhà Văn hóa Sinh viên ×5 | 4 lần thành công, lần 5 "… đã hết chỗ đỗ."; *Hủy* giải phóng |
| AT-08/09 | Đặt lịch sạc xe cá nhân | Ga Metro, khung hiện tại → Kiểm tra → Xác nhận | Chi tiết để xác nhận; "Đã đặt lịch: … đang sạc tại CP-01." |
| AT-09 A1 | 〃 | KTX Khu A, khung hiện tại → Kiểm tra | "… đã kín lịch …" + khung/Hub khác |
| AT-09 A3 | 〃 | Kiểm tra → *Hủy* | "Đã hủy; chưa đặt lịch sạc nào." |
| AT-09 E2 | 〃 | *Mô phỏng ngoại lệ* → E2 → Kiểm tra | "Không đọc được trạng thái cổng sạc …" |

## C. Cổng vận hành và nhân viên

| Mã | Trang | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| AT-10/11 | Giám sát mạng lưới | Mở trang | 12 Hub, xe 22/23, cổng 13/14; đội xe có loại, pin, trạng thái |
| AT-12 | 〃 | Xem cảnh báo; đổi ngưỡng 90 / 0 → *Lưu ngưỡng* | ĐH Kinh tế - Luật quá tải, Nhà Văn hóa Sinh viên thiếu xe; sau khi đổi: không còn cảnh báo |
| AT-15 | Quản lý sạc thông minh | KTX Khu A: thêm EB-103 | Xếp vào khung giờ kế tiếp; *Dời khung sau*, *Hủy* hoạt động |
| AT-15 | 〃 | CP-03 → *Sạc xong* | "EM-201 đã sạc xong tại CP-03." |
| AT-13 | Điều phối xe | *Tạo lệnh theo đề xuất* | DSP-001: EM-208 ĐH Kinh tế - Luật → Nhà Văn hóa Sinh viên, *Đã phân công* |
| AT-21 | Thực hiện điều chuyển | *Bắt đầu* → *Hoàn tất* | "EM-208 đã đến Nhà Văn hóa Sinh viên (DSP-001)."; cảnh báo biến mất |
| AT-14 | Xử lý sự cố vận hành | CP-02 → ghi nhận → phân loại → *Có — giao MAINT-DEMO* | INC-001 *Đã phân công*, CP-02 *Ngừng phục vụ* |
| AT-22 | Xử lý sự cố được giao | *Bắt đầu xử lý* → *Hoàn tất & khôi phục* | "CP-02 đã hoạt động trở lại."; sự cố *Đã giải quyết* |
| AT-14 | Xử lý sự cố vận hành | Xe → ghi nhận → phân loại → *Không — khôi phục vận hành ngay* | Sự cố giải quyết, "Xử lý vận hành (không cần sửa)" |
| AT-16/17 | Mô phỏng What-if | Mặc định → *Chạy mô phỏng* | Ga Metro ĐHQG ĐIỂM NGHẼN NGHIÊM TRỌNG, KTX Khu B DƯ THỪA, *Dữ liệu thật không đổi* |
| AT-18 | 〃 | *Lưu kịch bản*, *Áp dụng đề xuất* | SCN-001 trong danh sách; "Đã áp dụng: 3 lệnh điều chuyển …" |
| AT-16 | 〃 | Mức tăng −1 → chạy | "Mức tăng nhu cầu phải là số nguyên từ 0 đến 500 %." |

## D. Chung

| Mã | Thao tác | Kết quả mong đợi |
|---|---|---|
| AT-19 | *Cập nhật dữ liệu* ×4 | Pin EB-101 81 %, chỗ đỗ Ga Metro 5/8, CP-01 bận, làm mới định kỳ |
| AT-19 | *Tự động* | Cập nhật sau ≤ 15 giây |
| AT-20 | *Chế độ tối*, *EN* | Màu tối; tên trang = tên use case tiếng Anh |
| — | *Đặt lại dữ liệu* | Về dữ liệu gốc, giữ ngôn ngữ/chế độ |
