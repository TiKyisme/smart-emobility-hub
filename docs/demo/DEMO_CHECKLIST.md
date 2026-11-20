# Checklist demo (đánh dấu khi tập dượt)

Mỗi mục: **thao tác → điều kiện thành công chính xác**. Trừ khi ghi khác, bắt đầu từ dữ liệu gốc tại `http://127.0.0.1:5173/` (giao diện tiếng Việt). Mã AT/FR theo [tests/ACCEPTANCE_TESTS.md](../../tests/ACCEPTANCE_TESTS.md).

**Đặt lại giữa các nhóm mục:** tắt *Tự động* nếu đang bật → bấm **Đặt lại dữ liệu** (hoặc F5) → 4 ô Hub về `4/8`, `7/10`, `5/12`, `3/6`.

## 0. Trước giờ demo

- [ ] `git branch --show-current` → `main` (sau khi merge) hoặc nhánh demo đang dùng
- [ ] `npm test` → `tests 60`, `pass 60`, `fail 0`
- [ ] *(tùy chọn)* `python tests/e2e/browser_acceptance.py` → `SUMMARY: 101 PASS / 0 FAIL / 101 checks`
- [ ] `python -m http.server 5173 --bind 127.0.0.1` đang chạy; F12 → Console không có lỗi đỏ
- [ ] Tab 2 sẵn sàng cho phần hết hạn: `http://127.0.0.1:5173/?holdSeconds=20`

## 1. Cổng sinh viên

- [ ] **AT-01** Trang *Tìm & đặt xe* có 4 ô Hub, mỗi ô có thanh chỗ đỗ, *Chỗ đỗ x/y*, *Xe sẵn sàng*, *Trụ trống*
- [ ] **AT-02** Hub `Metro Hub` + Pin tối thiểu `80` → chỉ **EV-01 (82%)**; tick *Có trụ trống* → ô Dormitory bị làm mờ
- [ ] **AT-03** Bỏ tick *Chỉ xe sẵn sàng* → đủ 6 xe với cột Pin và Trạng thái (EV-04 *Đang sạc*)
- [ ] **AT-04** **Đặt giữ** EV-01 → `Đã giữ EV-01 đến …`, thẻ *Chuyến đi của tôi* đếm ngược từ `15:00`, các nút Đặt giữ khác bị khóa
- [ ] **AT-04 (hết hạn)** Tab `?holdSeconds=20` → Đặt giữ EV-01, chờ 20 giây → `Hết thời gian giữ: EV-01 đã sẵn sàng trở lại.`
- [ ] **AT-04 (hủy)** Đặt giữ → **Hủy giữ** → `Đã hủy giữ EV-0x.`, xe về *Sẵn sàng*
- [ ] **AT-06** **Nhận xe** → `Đã nhận EV-01 tại Metro Hub.`, ô Metro `3/8`
- [ ] **AT-07** Chọn *Trả xe tại* `Dormitory Hub` → bấm **Cập nhật dữ liệu** (ô chọn vẫn giữ Dormitory) → **Trả xe** → `Đã trả EV-01 tại Dormitory Hub.`, ô Dormitory `8/10`
- [ ] **AT-05** Trang *Đỗ xe & sạc*: giữ chỗ `Service Area Hub` 3 lần → lần 3 `còn 0 chỗ`; lần 4 đỏ `Service Area Hub đã hết chỗ đỗ.`; **Hủy** một chỗ → `Đã hủy giữ chỗ tại Service Area Hub.`
- [ ] **AT-08** *Xe dùng chung*, Metro, `EV-02 · 28%` → `EV-02 đang sạc tại CP-01.`; ô Xe chỉ còn xe đủ điều kiện
- [ ] **AT-09** *Xe cá nhân* `51A-111.11`, pin `35` → `Đã giữ chỗ tại Metro Hub; 51A-111.11 đang sạc tại CP-02.`; xuất hiện trong *Chỗ đỗ đang giữ* và *Yêu cầu sạc của tôi*

## 2. Cổng vận hành

- [ ] **AT-10** *Giám sát mạng lưới* (dữ liệu gốc): Hub `4`, Xe sẵn sàng `5/6`, Trụ trống `4/5`, Sự cố đang mở `0`, Chờ sạc `0`
- [ ] **AT-11** Bảng *Đội xe* có pin + trạng thái từng xe; trang *Sạc thông minh* có trạng thái từng trụ và phiên sạc (CP-03: EV-04)
- [ ] **AT-12** Giữ 3 chỗ ở Dormitory → bảng *Mạng lưới Hub* dòng 1 **Dormitory Hub · 10/10 · 100% · #1 · Hết chỗ**
- [ ] **AT-13** Dữ liệu gốc: *Điều phối xe* `Dormitory Hub → University Hub` → **Điều phối 1 xe** → `Đã điều phối EV-03 từ Dormitory Hub đến University Hub.`
- [ ] **AT-14** Trang *Sự cố*: `EV-02` → **Báo xe hỏng** → `Đã báo hỏng EV-02 (INC-001).`; `CP-01` → **Báo trụ ngừng hoạt động** → `(INC-002)`; danh sách `2 đang mở`
- [ ] **AT-14 (xử lý xong)** INC-001 **Đã sửa xong** → `EV-02 đã sửa xong, sẵn sàng tại Metro Hub.`; INC-002 **Khôi phục trụ** → `CP-01 đã hoạt động trở lại.`; `0 đang mở · 2 đã xử lý`
- [ ] **AT-15** Metro: EV-02 + `51A-111.11` (35%) chiếm 2 trụ; thêm `51B-222.22` (60%) rồi `51C-333.33` (10%, cần dùng sớm) → hàng đợi 51C `#1`, 51B `#2`; **Sạc xong** CP-01 → `EV-02 đã sạc xong; 51C-333.33 được chuyển vào CP-01.`

## 3. Mô phỏng

- [ ] **AT-16/17/18** Chạy đủ 5 kịch bản (Hub trọng tâm `Metro Hub`) → mỗi lần nhãn **Dữ liệu thật không đổi**, bảng *Trước/Sau*, ít nhất 1 đề xuất; bảng *Mạng lưới Hub* không đổi
- [ ] **AT-19** Dữ liệu gốc: **Cập nhật dữ liệu** 4 lần → `Telemetry: pin EV-01 còn 81%.` → `Cảm biến chỗ đỗ: Metro Hub 5/8.` → `Telemetry trụ: CP-01 đang bận.` → `Làm mới mạng lưới định kỳ.`
- [ ] **AT-19 (tự động)** **Tự động: tắt** → bật; trong ~15 giây dải trạng thái đổi; bấm lại → `Đã tắt cập nhật tự động.`
- [ ] **AT-20** **Chế độ tối** → nền tối; **VI / EN** = `EN` → toàn bộ chữ và thông báo tiếng Anh; về `VI` dữ liệu vẫn giữ nguyên
- [ ] **Đặt lại dữ liệu** → `Đã đặt lại dữ liệu mô phỏng.`, dữ liệu về gốc, ngôn ngữ/giao diện giữ nguyên

## 4. Phi chức năng

- [ ] **NFR-01 / D-005** Cập nhật thủ công hiện ngay; tự động mỗi 15 giây
- [ ] **NFR-02** Không có 2 lượt giữ còn hiệu lực cho một xe (kiểm thử `NFR-02: a second student cannot reserve…`)
- [ ] **NFR-03** Không vượt sức chứa: chỗ đỗ (AT-05, AT-12), trả xe (AT-07 ngoại lệ), trụ sạc (`AT-15 / FR-15: a freed point goes to…`), bộ mô phỏng (`GUARD (D-004)`)
- [ ] **NFR-04** Chỉ cần máy chủ tĩnh, không backend/CSDL
- [ ] **NFR-05 / D-006** Mọi thao tác có thông báo xanh/đỏ và bảng/thẻ cập nhật ngay
- [ ] Console không lỗi; màn hình 390 px không cuộn ngang; mọi khung đều góc vuông

## 5. Luồng lỗi

- [ ] Gửi yêu cầu sạc khi Hub không còn xe đủ điều kiện → nút gửi bị khóa, gợi ý `Hub này không còn xe sẵn sàng chưa có yêu cầu sạc.`
- [ ] Xe cá nhân với ô pin trống → `Mức pin phải từ 0 đến 100.`; biển số trống → `Hãy nhập biển số hoặc tên xe.`
- [ ] Yêu cầu sạc của EV-01 đang chờ, rồi **Đặt giữ** EV-01 → *Sạc thông minh* ghi `Tạm hoãn: xe đang được giữ`; **Sạc xong** một trụ Metro → trụ đó *Sẵn sàng*, không cấp cho EV-01
- [ ] Trả xe về Hub đầy → `… đã hết chỗ; hãy chọn Hub khác.`, chuyến vẫn *Đang sử dụng*
- [ ] Xe hỏng giữa chuyến không thể "Đã sửa xong" khi Hub của nó đầy → `… không còn chỗ cho EV-0x.` (kiểm thử `D-016: a vehicle that failed during a trip…`)
- [ ] `?holdSeconds=5` (ngoài khoảng 10–3600) → chân thẻ vẫn ghi `Thời gian giữ xe: 15 phút.`
