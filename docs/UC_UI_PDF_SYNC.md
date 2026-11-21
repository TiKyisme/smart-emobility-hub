# Đối chiếu Use Case ↔ giao diện web ↔ báo cáo đã nộp

Cập nhật 2026-11-21. Tài liệu này ghi lại kết quả kiểm tra và đồng bộ giữa:

- **Báo cáo Submission #1** (bản cuối, có sơ đồ use case toàn hệ thống, danh sách tác nhân và yêu cầu FR-STU/SVU/PEV/OPT/DIS/MNT/CHG/SIM/UI);
- **Báo cáo Submission #2** — [submission2/Phase2_L03_13.pdf](../submission2/Phase2_L03_13.pdf) (mockup Figma, activity/sequence của UC-02, UC-04, UC-09, UC-12/15, UC-17);
- **Báo cáo Submission #3** — [submission3/L03_13 (1).pdf](<../submission3/L03_13 (1).pdf>) (kiến trúc, ADR-01..06, class diagram, mô tả phương thức, Bảng 12 truy vết, phụ lục TC-UC04);
- **ứng dụng web** trong repo.

Các PDF đã nộp **không bị sửa**. Đồng bộ được thực hiện bằng cách sửa web và tài liệu repo cho khớp với báo cáo; các chỗ không thể khớp được ghi ở mục 5 và 6.

## 1. Kết quả tổng quát

| Hạng mục | Trước khi đồng bộ | Sau khi đồng bộ |
|---|---|---|
| Tác nhân | Web chỉ có Sinh viên và Vận hành | Đủ tác nhân của sơ đồ use case: Sinh viên (Shared Vehicle User, Private EV Owner), Operator, **Vehicle Dispatch Staff**, **Maintenance Staff**, Data Simulator |
| Điều hướng | 6 trang tự đặt tên | **11 trang mang đúng tên use case** (tiếng Anh trùng chữ với sơ đồ), nhóm theo tác nhân |
| UC-02 | Lọc theo Hub và pin | Vị trí xuất phát, điểm đến, bán kính 0.1–5 km (Haversine), danh sách Hub theo khoảng cách, lọc loại xe + pin, E1/E2/E3 |
| UC-04 | Bấm "Đặt giữ" là xong | Bước **xác nhận**, màn hình "Đặt xe thành công" với mã đặt chỗ/tạo lúc/hết hạn/giữ cho, A1/A2/A3, E1/E2/E3, lịch sử đặt xe |
| UC-09 | Gửi yêu cầu sạc theo hàng đợi | Chọn **Hub + ngày + khung giờ**, kiểm tra cổng sạc, xem chi tiết rồi xác nhận, gợi ý khung/Hub khác khi hết chỗ, E1/E2, thông báo khi sạc xong |
| UC-15 | Báo hỏng → "Đã sửa xong" | Vòng đời **Mới ghi nhận → Đã phân công → Đang xử lý → Đã giải quyết**, phân loại (loại, mức độ), giao Maintenance Staff hoặc xử lý vận hành, "Xác nhận không khả dụng" |
| UC-17 | Chọn kịch bản + Hub | Mẫu kịch bản, Hub mục tiêu, **% tăng nhu cầu, số cổng sạc ngừng, khoảng thời gian**, kiểm tra tham số, thẻ ĐIỂM NGHẼN/CẢNH BÁO/DƯ THỪA, đề xuất có nhãn, **Lưu kịch bản**, **Áp dụng đề xuất** |
| Redistribute Vehicles | Nút "Điều phối 1 xe" chuyển xe ngay | Kế hoạch điều phối → **lệnh điều chuyển** giao Vehicle Dispatch Staff → bắt đầu/hoàn tất |
| Dữ liệu | 4 Hub, 6 xe | **12 Mobility Hub** (quyết định của nhóm ở Submission #1), 23 xe có loại E-Bike/E-Scooter, 14 cổng sạc, tọa độ mô phỏng |
| Ưu tiên sạc | Cần dùng sớm trước, rồi pin thấp | Theo **ADR-05**: pin dưới 20 % hoặc khởi hành sớm được ưu tiên, rồi pin thấp hơn, rồi thời điểm đăng ký (FR-CHG-2) |
| Truy vết phương thức | Tên hàm khác Bảng 12 | Mã có các tên hàm của Bảng 12 (mục 4) |
| Ca kiểm thử TC-UC04-01..11 | "PROPOSED" trong PDF | Có test tự động tương ứng trong `tests/unit/reservationService.test.js` |

## 2. Ma trận use case ↔ báo cáo ↔ web

Mã UC theo [USE_CASE_CATALOG.md](USE_CASE_CATALOG.md) (Submission #3 dùng cùng bộ mã). "Trang" là mục trên thanh bên.

| Use case (tên trong sơ đồ) | Tác nhân | Nguồn trong báo cáo | Trang / điều khiển trên web | Trạng thái |
|---|---|---|---|---|
| UC-01, UC-02, UC-03 Find Suitable Hub / Vehicle («include» Check Resource Availability) | Shared Vehicle User | S#1 bảng UC; S#2 Hình 1, 9, 18; S#3 Bảng 5 | Tìm Hub / phương tiện | Đã sửa trên web |
| UC-04 Reserve Shared Vehicle | Shared Vehicle User | S#1 bảng UC; S#2 Hình 2–4, 10–12, 19–21; S#3 Bảng 6, phụ lục A | Đặt giữ xe dùng chung | Đã sửa trên web |
| UC-05 Reserve Parking Space («include» Check Resource Availability) | Student | S#1 FR-SVU-11, FR-PEV-1 | Đặt chỗ đỗ xe | Khớp (tách trang riêng) |
| UC-06 Pick Up Shared Vehicle | Shared Vehicle User | S#1 FR-SVU-5..7 | Đặt giữ xe dùng chung → Nhận xe | Khớp |
| UC-07 Return Shared Vehicle | Shared Vehicle User | S#1 FR-SVU-8..10 | Đặt giữ xe dùng chung → Trả xe; Lịch sử đặt xe (FR-STU-3/4) | Khớp, bổ sung lịch sử |
| UC-08, UC-09 Schedule Private EV Charging | Private EV Owner | S#1 FR-PEV-2..5; S#2 Hình 5, 13, 22–24; S#3 Bảng 7 | Đặt lịch sạc xe cá nhân | Đã sửa trên web |
| UC-10, UC-19 Customize Interface Mode | Student, Operator | S#1 FR-UI-1; S#2 Bảng 1 (VI/EN) | Thanh trên: Chế độ tối, VI/EN | Khớp |
| UC-11, UC-12, UC-13 Monitor Network Status | Operator | S#1 FR-OPT-1..6 | Giám sát mạng lưới (KPI, cảnh báo theo ngưỡng cấu hình, Hub, đội xe) | Đã sửa (thêm ngưỡng cảnh báo) |
| UC-14 Redistribute Vehicles | Operator | S#1 FR-OPT-7..9 | Điều phối xe (đề xuất, tạo lệnh, theo dõi lệnh) | Đã sửa trên web |
| Execute Redistribution Task | Vehicle Dispatch Staff | S#1 FR-DIS-1..8 | Thực hiện điều chuyển | **Mới** |
| UC-15 Handle Operational Incident | Operator | S#1 FR-OPT-10..14; S#2 Hình 6–7, 14–16, 25; S#3 Bảng 8 | Xử lý sự cố vận hành | Đã sửa trên web |
| Resolve Assigned Incident | Maintenance Staff | S#1 FR-MNT-1..6 | Xử lý sự cố được giao | **Mới** |
| UC-16 Manage Smart Charging | Operator | S#1 FR-OPT-15..18, FR-CHG-1..5; S#3 ADR-05 | Quản lý sạc thông minh (cổng, lịch theo khung giờ, hàng đợi ưu tiên, dời/hủy, tối ưu lịch) | Đã sửa trên web |
| UC-17, UC-18 Run What-if Simulation | Operator | S#1 FR-SIM-1..6; S#2 Hình 8, 17, 26; S#3 Bảng 9, ADR-06 | Mô phỏng What-if | Đã sửa trên web |
| UC-20 Synchronize Resource State | Data Simulator | S#1 FR-STA-1..5; S#3 mục 2.3 | Thanh trên: Cập nhật dữ liệu, Tự động | Khớp |

## 3. Các bước của 5 use case chi tiết

### UC-02 Find Suitable Hub / Vehicle (activity S#2 Hình 9)

| Bước / nhánh trong báo cáo | Trên web |
|---|---|
| Mở tìm kiếm, cung cấp vị trí / điểm đến | Ô *Vị trí của bạn* (mặc định Ga Metro ĐHQG), *Điểm đến (tùy chọn)*, *Bán kính (km)* |
| Xác định các Hub phù hợp trong phạm vi (validateLocation, fetchHubsInRadius) | Bảng Hub trong bán kính, gần nhất trước, có khoảng cách và thời gian đi bộ |
| Tổng hợp tài nguyên Hub | Mỗi Hub: chỗ trống, xe sẵn sàng, cổng trống; nhãn *Quá tải* |
| Chọn một Hub, áp dụng bộ lọc loại xe và pin | Nút *Chọn* + bộ lọc *Loại xe*, *Pin tối thiểu (%)* |
| Hết xe → quay lại danh sách Hub | "Hết xe phù hợp tại Hub này — hãy chọn Hub khác." |
| Chọn phương tiện → chuyển sang Reserve Shared Vehicle | Nút *Đặt xe* mở trang Đặt giữ xe dùng chung ở bước xác nhận |
| A1 thêm bộ lọc | Loại xe, pin tối thiểu |
| A2 có điểm đến | Dòng "Chỗ trả xe gần điểm đến" |
| E1 không tìm thấy | Chọn vị trí *Khoa Y - ĐHQG-HCM*, bán kính 1 km → "Không có Mobility Hub nào trong 1 km…" |
| E2 không xác định được vị trí | Bỏ chọn vị trí → "Chưa xác định được vị trí. Hãy chọn vị trí thủ công." |
| E3 dữ liệu trễ | Cảnh báo "Dữ liệu … có thể đã cũ" khi quá 5 phút chưa cập nhật |
| E4 xe hết khả dụng trước khi đặt | Xử lý ở UC-04 (E1/E3) |

### UC-04 Reserve Shared Vehicle (activity S#2 Hình 10–12, sequence Hình 19–21)

| Bước / nhánh | Trên web |
|---|---|
| selectVehicle → displayVehicleDetails (Hub, trạng thái, pin) | Màn hình *Xác nhận đặt xe* |
| Xác nhận → recheck → createIfFree → changeStatus(Reserved) | *Xác nhận đặt xe* → màn hình *Đặt xe thành công*: Sẵn sàng → Đã giữ, mã đặt chỗ, trạng thái, tạo lúc, hết hạn giữ, giữ cho |
| Tiếp tục nhận xe (UC-06) | *Nhận xe*, đồng hồ đếm ngược |
| A1 hủy trước khi xác nhận | *Hủy* → "Chưa tạo lượt đặt; … vẫn Sẵn sàng." (TC-UC04-09) |
| A2 chọn xe khác | *Chọn xe khác* → về trang tìm kiếm |
| A3 hết hạn trước khi nhận | Tự hết hạn, xe về Sẵn sàng, màn hình *Lượt đặt đã hết hạn* (demo: `?holdSeconds=10`) |
| E1 xe không còn khả dụng | "… không còn khả dụng. Hãy chọn xe khác." |
| E2 không đọc được trạng thái | Mục *Mô phỏng ngoại lệ (demo)* → "Không đọc được trạng thái xe (E2)" → xác nhận báo thử lại; sau 10 giây đặt được (TC-UC04-10) |
| E3 xung đột đặt đồng thời | *Mô phỏng ngoại lệ* → "Người khác đặt xe này trước (E3)" → "… vừa được người khác đặt." (TC-UC04-02/06) |

### UC-09 Schedule Private EV Charging (activity S#2 Hình 13, sequence Hình 22–24)

| Bước / nhánh | Trên web |
|---|---|
| Hiển thị Hub và khung giờ còn trống | Ô *Mobility Hub*, *Ngày sạc* (hôm nay/ngày mai), *Khung giờ* kèm số cổng trống |
| Chọn Hub + khung giờ, kiểm tra trạng thái cổng (checkAvailability) | *Kiểm tra & xem chi tiết* |
| Hiển thị thông tin để xác nhận (displayBookingDetails) | Khung *Chi tiết đặt lịch*: Hub, ngày, khung giờ, xe, pin, mức ưu tiên |
| Xác nhận → tạo phiên sạc → cập nhật phân bổ | *Xác nhận đặt lịch* → "Đặt lịch sạc thành công", trạng thái *Đã đặt lịch* (giống mockup Hình 5) |
| A1 khung giờ đầy → hiển thị khung khác | "… đã kín lịch …" + nút khung giờ khác và Hub khác |
| A2 đổi Hub | Đổi ô Hub hoặc chọn nút Hub khác |
| A3 hủy | *Hủy* → "Đã hủy; chưa đặt lịch sạc nào." |
| E1 cổng sạc hỏng | Hub không còn cổng hoạt động → "… không còn cổng sạc hoạt động. Hãy chọn Hub hoặc khung giờ khác." |
| E2 không đọc được trạng thái cổng | *Mô phỏng ngoại lệ* → "Không đọc được trạng thái cổng sạc (E2)" → báo thử lại |
| Theo dõi trạng thái, thông báo hoàn tất (FR-PEV-4/5) | Bảng *Lịch sạc của tôi* (Đã đặt lịch / Chờ cổng / Đang sạc / Hoàn tất) và dòng *Thông báo* |

### UC-15 Handle Operational Incident (activity S#2 Hình 14–16)

| Bước / nhánh | Trên web |
|---|---|
| Ghi nhận / mở sự cố, hệ thống hiển thị thông tin | *Ghi nhận sự cố xe / cổng sạc*; danh sách; khung *Chi tiết sự cố* |
| Xác nhận và phân loại | Bước 1: loại sự cố, mức độ → *Xác nhận và tiếp nhận sự cố* |
| Cần sửa chữa kỹ thuật? — Có: giao Maintenance Staff, đánh dấu tài nguyên không khả dụng, lưu và thông báo | *Có — giao MAINT-DEMO*: tài nguyên *Ngừng phục vụ*, trạng thái *Đã phân công* |
| Maintenance Staff mở sự cố được giao, sửa, cập nhật | Trang *Xử lý sự cố được giao*: *Bắt đầu xử lý* (Đang xử lý) |
| Hoàn tất → Resolved, khôi phục tài nguyên; chưa xong → In Progress | *Hoàn tất & khôi phục* → *Đã giải quyết*; xe hỏng giữa chuyến cần chỗ trống ở Hub |
| Không cần sửa: chọn hành động vận hành, áp dụng điều chỉnh | *Không — khôi phục vận hành ngay* → tài nguyên hoạt động lại, phân bổ sạc được tính lại |
| Thẻ đếm theo trạng thái, "Xác nhận không khả dụng" (mockup Hình 6–7) | 4 thẻ KPI; nút *Xác nhận không khả dụng* |

### UC-17 Run What-if Simulation (activity S#2 Hình 17, mockup Hình 8)

| Bước / nhánh | Trên web |
|---|---|
| Nhập tham số kịch bản (renderSetupForm) | *Mẫu kịch bản*, *Hub mục tiêu*, *Mức tăng nhu cầu dự kiến (%)*, *Số cổng sạc giả lập ngừng*, *Khoảng thời gian* |
| Kiểm tra tham số (validateParams) — sai thì quay lại | % âm hoặc không nguyên, số cổng vượt tổng của Hub → thông báo lỗi |
| Sao chép trạng thái hiện tại, chạy mô phỏng | Chạy trên bản sao; nhãn *Dữ liệu thật không đổi* được kiểm chứng mỗi lần chạy |
| Quá thời gian → quay lại | Giới hạn 2 giây (`simulation_timeout`) |
| Hiển thị tác động và đề xuất | Thẻ Hub ĐIỂM NGHẼN NGHIÊM TRỌNG / CẢNH BÁO / DƯ THỪA (hiện tại → mô phỏng, ngưỡng); đề xuất [Điều phối xe] [Sạc thông minh] [Điều hướng người dùng] |
| Đổi tham số / Lưu kịch bản / Áp dụng đề xuất | *Đặt lại tham số*, *Lưu kịch bản* (danh sách có nút *Nạp*), *Áp dụng đề xuất (tạo lệnh điều chuyển & lịch sạc)* |

## 4. Tên phương thức trong Bảng 12 (S#3) ↔ mã nguồn

| FR | Phương thức trong báo cáo | Vị trí trong mã |
|---|---|---|
| FR-01 | displayNearbyHubs, getAvailableSlotsCount | `src/ui/views/search.js`, `src/services/hubService.js` |
| FR-02 | requestNearbyHubs, fetchAvailableVehicles (validateLocation, fetchHubsInRadius) | `src/services/hubService.js` |
| FR-03 | displayVehicleResults, getBatteryLevel | `src/ui/views/search.js`, `src/domain/vehicle.js` |
| FR-04 | reserveVehicle, expireReservations, createIfFree (getCurrentStatus) | `src/services/reservationService.js` |
| FR-05 | reserveParkingSpace, getAvailableSlotsCount | `src/services/reservationService.js`, `src/services/hubService.js` |
| FR-06, FR-07 | pickUpVehicle, returnVehicle, changeStatus | `src/services/reservationService.js`, `src/domain/vehicle.js` |
| FR-08 | createChargingSession | `src/services/chargingService.js` |
| FR-09 | checkAvailability, updateChargingAllocation (getAvailableSlots, getChargingPorts) | `src/services/chargingService.js` |
| FR-10 | renderDashboard, summarizeHub | `src/ui/views/operator.js`, `src/services/hubService.js` |
| FR-11 | getBatteryLevel, isOperational | `src/domain/vehicle.js` (dùng lại trong `operatorService.js`) |
| FR-12 | detectCapacityRisks, identifyBottlenecks | `src/services/operatorService.js` |
| FR-13 | planRedistribution, applyCoordination | `src/services/operatorService.js` |
| FR-14 | classifyIncident, assignMaintenance, resolveIncident (markResourceUnavailable, applyOperationalAction) | `src/services/operatorService.js` |
| FR-15 | buildChargingSchedule, optimizeQueue | `src/services/chargingService.js` |
| FR-16 | requestSimulation, runSimulationAlgorithm (validateParams) | `src/services/simulationService.js` |
| FR-17 | evaluateScenarioImpact, calculateMetrics | `src/services/simulationService.js` |
| FR-18 | generateRecommendations, applyCoordination, saveToLibrary | `src/services/simulationService.js` |
| FR-19 | tickSimulator, updateResourceStatus | `src/services/simulatorService.js` |
| FR-20 | setInterfaceMode, renderApp | `src/main.js`, `src/ui/render.js` |

Lớp biên của các use case khác cũng mang tên trong báo cáo: `showVehicleDetails`, `showReservationResult` (`src/ui/views/trip.js`); `renderScheduleForm`, `displayBookingDetails` (`src/ui/views/studentServices.js`); `displayIncidentDetails` (`src/ui/views/incidents.js`); `renderSetupForm`, `displayResultsAndRecommendations` (`src/ui/views/whatif.js`).

## 5. Lỗi hoặc điểm lệch nằm trong PDF (không sửa được vì đã nộp)

| Vị trí | Nội dung trong PDF | Cách hiểu đúng / cách repo xử lý |
|---|---|---|
| S#2 (toàn bộ phần UC xử lý sự cố) | Dùng mã **UC-12** cho Handle Operational Incident | S#3 mục 1.2 đã chuẩn hóa thành **UC-15**; repo dùng UC-15 |
| S#3 Bảng 12, dòng FR-10..FR-13 | Ghi UC-10, UC-11, UC-12, UC-13 | Đúng theo danh mục: FR-10 → UC-11, FR-11 → UC-12, FR-12 → UC-13, FR-13 → UC-14 (UC-10 là Customize Interface Mode của sinh viên) |
| S#3 mục 6.3 | `docs/DECISIONS.md` chứa "ADR-01 đến ADR-06" | Repo ghi quyết định dạng D-001..; nay có thêm bảng ánh xạ ADR-01..06 → D-xxx trong [DECISIONS.md](DECISIONS.md) |
| S#3 mục 6.3 | `submission3/report_source_manifest.md`, `submission3/METHOD_COVERAGE_AUDIT.md` là tài liệu của repo | Hai tệp có trên máy chủ repo nhưng **chưa đưa lên GitHub** (chờ chủ repo quyết định, xem [RELEASE_MANIFEST.md](RELEASE_MANIFEST.md)) |
| S#3 các ô "Đối chiếu mã: DESIGN ONLY" | Ví dụ getAvailableSlotsCount, getAvailableVehicles, fetchAvailableSlots, saveChargingSession, createIfFree chưa có trong mã | Nay đã có hàm tương ứng (mục 4); ghi chú "DESIGN ONLY" trong PDF phản ánh mã lúc nộp |
| S#3 mục 2.3, VehicleReservationUI | "chọn khoảng thời gian" khi giữ xe | Thời gian giữ cố định 15 phút theo ADR-04/D-007 (S#2 Bảng 1 cũng ghi 15 phút) |
| Mockup S#2 | Số liệu mẫu (Hub #12, 18–32 xe/Hub, "EcoBike Pro", "VNU-HCM Urban Area - Central Hub") | Là dữ liệu minh họa của Figma; web dùng 12 Hub với số xe nhỏ hơn để demo gọn |

## 6. Khác biệt có chủ đích (giữ nguyên, có lý do)

| Nội dung trong báo cáo | Trên web | Lý do |
|---|---|---|
| Tên người dùng thật trên mockup (ví dụ tên thành viên) | Danh tính demo cố định: STUDENT-DEMO, OPERATOR-DEMO, DISPATCH-DEMO, MAINT-DEMO | Không làm đăng nhập/tài khoản (ngoài phạm vi, D-003) |
| SearchUI hiển thị "trên bản đồ", GPS | Danh sách địa điểm + bảng Hub có khoảng cách | Đề bài không yêu cầu bản đồ/GPS; tọa độ là dữ liệu mô phỏng |
| NetworkDatabase / CSDL | Kho trạng thái trong bộ nhớ `src/state/store.js` | ADR-01: không cần CSDL thật |
| Nhãn "AI Coordination Recommendations" (mockup UC-17) | "Đề xuất điều phối" sinh theo quy tắc | S#2 đã ghi rõ yêu cầu không đòi hỏi AI/ML |
| E2/E3 (lỗi đọc trạng thái, đặt đồng thời) | Tạo bằng mục *Mô phỏng ngoại lệ (demo)* | Một trình duyệt, dữ liệu trong bộ nhớ nên không tự xảy ra; vẫn dùng đúng luồng dịch vụ |
| Nhiều nhân viên bảo trì / điều phối | Mỗi vai trò một danh tính demo | Đủ để thể hiện use case; không quản lý nhân sự |
| Ngưỡng cảnh báo, độ dài khung giờ, mô hình what-if | Giá trị do nhóm quyết định, có thể đổi (D-019..D-026) | Đề bài không cho số liệu; báo cáo chỉ nêu "ngưỡng được cấu hình" và mockup "> 85 %" |

## 7. Cách kiểm chứng

- `npm test` — 73 kiểm tra tự động, gồm TC-UC04-01..11 và kiểm tra tên mục điều hướng tiếng Anh trùng tên use case.
- `python tests/e2e/browser_acceptance.py` — 130 kiểm tra trên Chrome/Edge thật, đi qua từng bước và nhánh ở mục 3 và phát lại kịch bản demo.
- Kết quả lần chạy gần nhất: [demo/DEMO_EVIDENCE.md](demo/DEMO_EVIDENCE.md).
