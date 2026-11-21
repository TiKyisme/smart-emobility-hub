# FAQ — câu hỏi giảng viên có thể đặt khi demo

Trả lời ngắn gọn, khớp với mã thực thi hiện tại. Đường dẫn trong ngoặc là nơi chỉ cho giảng viên xem. Đối chiếu đầy đủ giữa use case, web và báo cáo: [UC_UI_PDF_SYNC.md](../UC_UI_PDF_SYNC.md).

## 1. Web có đúng với use case trong báo cáo không?

Có. Thanh bên là sơ đồ use case toàn hệ thống của Submission #1: mỗi use case một trang, nhóm theo tác nhân (Sinh viên — Shared Vehicle User / Private EV Owner, Operator, Vehicle Dispatch Staff, Maintenance Staff); Data Simulator là nút *Cập nhật dữ liệu* / *Tự động*. Đổi sang **EN** thì tên trang trùng chữ với tên use case (có kiểm thử tự động cho điều này). Năm use case chi tiết (UC-02, UC-04, UC-09, UC-15, UC-17) có đủ luồng chính, luồng thay thế và ngoại lệ như activity diagram của Submission #2; tên hàm theo Bảng 12 của Submission #3.

## 2. Kiến trúc của hệ thống là gì?

Kiến trúc **phân lớp** chạy hoàn toàn trong trình duyệt (ADR-01, ADR-02 của Submission #3):

| Lớp | Tệp | Vai trò |
|---|---|---|
| Presentation | `index.html`, `src/main.js`, `src/ui/render.js`, `src/ui/views/*.js`, `src/ui/i18n.js` | 11 trang theo use case, nhận thao tác, vẽ giao diện, VI/EN |
| Business services | `src/services/*.js` (6 module) | Tìm Hub, đặt xe/chỗ đỗ, sạc theo khung giờ, vận hành và sự cố, what-if, Data Simulator |
| Domain / State | `src/domain/*.js`, `src/state/store.js` | Trạng thái, khung giờ, khoảng cách, tác nhân demo, kho trạng thái trong bộ nhớ (ADR-03) |
| Simulated data | `src/data/simulatedData.js` | 12 Mobility Hub, 4 địa điểm khác, 23 xe (E-Bike/E-Scooter), 14 cổng sạc, 1 phiên sạc (EM-201 trên CP-03) |

Luồng một chiều: **click → `main.js` gọi service → service kiểm tra rồi sửa store → store báo subscriber → trang đang mở được vẽ lại.** Tương đương MVC: store là Model, `ui/` là View, `main.js` là Controller.

## 3. Vì sao dùng dữ liệu trong bộ nhớ, không dùng cơ sở dữ liệu?

- Đề bài cho phép dữ liệu mô phỏng và không bắt buộc CSDL phía máy chủ (HK261_Assignment_Desc); ADR-01 của nhóm chọn kiến trúc client-side in-memory (D-001, NFR-04).
- Demo tái lập được: **Đặt lại dữ liệu** (hoặc F5) đưa mọi thứ về dữ liệu gốc.
- Đánh đổi: không lưu lâu dài, mỗi tab có dữ liệu riêng. Ở sản phẩm thật, lớp `NetworkDatabase` sẽ là CSDL có giao dịch.

## 4. UC-02: tìm theo vị trí thế nào khi không có GPS?

Sinh viên chọn **vị trí** từ danh sách địa điểm (các Hub và vài địa điểm khác trong khu ĐHQG có tọa độ mô phỏng). `validateLocation` kiểm tra vị trí và bán kính 0.1–5 km; `fetchHubsInRadius` tính khoảng cách Haversine và xếp Hub gần nhất trước; `fetchAvailableVehicles` lọc xe sẵn sàng theo loại và pin tối thiểu (`src/services/hubService.js`, D-022). E1/E2/E3 của UC-02 đều có trên trang. GPS thật và bản đồ nằm ngoài phạm vi đề bài.

## 5. UC-04: giữ xe, hết hạn, xung đột hoạt động thế nào? (FR-04, FR-06)

1. Chọn xe → **bước xác nhận** (Hub, trạng thái, pin). *Hủy* không tạo gì (A1); *Chọn xe khác* quay lại tìm kiếm (A2).
2. `reserveVehicle` đọc trạng thái hiện tại (`getCurrentStatus`, lỗi → E2), từ chối nếu người khác đang giữ (E3) hoặc xe không còn sẵn sàng (E1), rồi `createIfFree` tạo lượt giữ `RSV-00x` với `expiresAt = createdAt + 15 phút` (ADR-04) và `changeStatus(Reserved)`.
3. Bộ hẹn giờ 1 giây gọi `expireReservations`: quá giờ thì lượt giữ *Hết hạn*, xe về *Sẵn sàng* (A3). Có thể rút ngắn bằng `?holdSeconds=20` (D-012).
4. 11 ca TC-UC04-01..11 trong phụ lục Submission #3 đều có kiểm thử tự động cùng tên (`tests/unit/reservationService.test.js`).

**"Hai người bấm cùng lúc thì sao?"** Trong một tab JavaScript đơn luồng nên người thứ hai luôn bị từ chối (TC-UC04-06). Để trình diễn E2/E3 trên một máy, mục *Mô phỏng ngoại lệ (demo)* cho Data Simulator làm "người khác đặt trước" hoặc "mất tín hiệu trạng thái 10 giây"; xử lý vẫn đi qua đúng service (D-025).

## 6. UC-09 và sạc thông minh hoạt động thế nào? (FR-08, FR-09, FR-15)

- Sinh viên đặt lịch cho **xe cá nhân** theo **Hub + ngày + khung giờ 1 tiếng** (hôm nay/ngày mai). `checkAvailability` đọc trạng thái cổng (lỗi → E2), không còn cổng hoạt động → E1, khung đầy → gợi ý khung khác và Hub khác (A1). Xem chi tiết rồi mới xác nhận; `createChargingSession` kiểm tra lại trước khi tạo phiên *Đã đặt lịch* (D-019).
- Sức chứa một khung = số cổng đang hoạt động của Hub. Khi khung bắt đầu, `updateChargingAllocation` giao cổng theo **ưu tiên ADR-05**: khởi hành sớm hoặc pin dưới 20 % trước, rồi pin thấp hơn, rồi ai đăng ký trước (FR-CHG-2). Phiên kết thúc khi hết khung hoặc khi vận hành bấm *Sạc xong*; chủ xe cá nhân nhận thông báo (FR-PEV-5).
- Xe dùng chung do **Operator** đưa vào lịch ở trang *Quản lý sạc thông minh* (FR-CHG-1), lấy pin từ dữ liệu xe (D-008); xe đang được giữ/hỏng/đang điều chuyển thì *Tạm hoãn* (D-009). Operator có *Dời khung sau*, *Hủy*, *Tối ưu lịch* (`optimizeQueue`, khi cổng hỏng làm khung bị vượt công suất).

## 7. Sức chứa và cảnh báo được tính thế nào? (FR-05, FR-07, FR-12)

`đã dùng = xe đang đỗ + chỗ đang giữ` (D-004) — kể cả chỗ giữ cho xe đang được điều chuyển đến. Mọi thao tác chiếm chỗ đều kiểm tra con số này. Cảnh báo theo **ngưỡng cấu hình** (Submission #1 FR-OPT-4..6): quá tải khi ≥ 85 % (ngưỡng trong mockup what-if), thiếu xe khi dưới 1 xe sẵn sàng; Operator đổi ngưỡng ngay trên trang (D-023).

## 8. Điều phối xe và nhân viên điều phối? (FR-13)

`planRedistribution` đề xuất đưa xe tới Hub thiếu xe từ Hub dư (ưu tiên Hub quá tải). Operator tạo **lệnh điều chuyển** (theo đề xuất hoặc tự chọn xe/Hub đích): xe chuyển *Đang điều chuyển* và Hub đích được giữ 1 chỗ. **Vehicle Dispatch Staff** bấm *Bắt đầu* (xe rời Hub nguồn) và *Hoàn tất* (xe tới Hub đích, cập nhật cả hai Hub) — FR-DIS-1..8, D-020.

## 9. UC-15: sự cố được xử lý thế nào? (FR-14)

Theo activity diagram Submission #2 (D-021): ghi nhận → *Mới ghi nhận*; Operator **xác nhận và phân loại** (loại, mức độ); "Cần sửa chữa kỹ thuật?" — **Có**: giao **Maintenance Staff** (`assignMaintenance`), tài nguyên *Ngừng phục vụ*, phiên sạc trên cổng hỏng tự chuyển sang cổng khác; nhân viên *Bắt đầu xử lý* (*Đang xử lý*) rồi *Hoàn tất & khôi phục* (*Đã giải quyết*, tài nguyên hoạt động lại; xe hỏng giữa chuyến cần chỗ trống). **Không**: *khôi phục vận hành ngay* (`applyOperationalAction`). Nút *Xác nhận không khả dụng* và 4 thẻ đếm trạng thái như mockup.

## 10. What-if có làm thay đổi dữ liệu thật không? (FR-16..FR-18)

Không. `requestSimulation` kiểm tra tham số (`validateParams`: % không âm và nguyên, số cổng ngừng ≤ tổng cổng của Hub, khoảng thời gian hợp lệ), `runSimulationAlgorithm` chạy trên **bản sao sâu** (ADR-06), `calculateMetrics` / `evaluateScenarioImpact` cho thẻ *ĐIỂM NGHẼN NGHIÊM TRỌNG / CẢNH BÁO / DƯ THỪA*, `generateRecommendations` đưa đề xuất có nhãn. Nhãn *Dữ liệu thật không đổi* được kiểm chứng bằng so sánh ảnh chụp JSON (D-013). Chỉ khi Operator bấm **Áp dụng đề xuất** thì `applyCoordination` mới tạo lệnh điều chuyển/lịch sạc thật; **Lưu kịch bản** chỉ lưu tham số. Công thức mô phỏng là quyết định của nhóm (D-024).

## 11. Lớp trong sơ đồ lớp tương ứng với mã nào?

| Lớp thiết kế (Submission #3) | Mã thực thi |
|---|---|
| `SearchUI`, `HubSearchController`, `MobilityHubDatabase` | `ui/views/search.js` (`displayNearbyHubs`, `displayVehicleResults`), `services/hubService.js` (`requestNearbyHubs`, `validateLocation`, `fetchHubsInRadius`, `fetchAvailableVehicles`) |
| `StudentUI`, `ReservationService`, `Reservation`, `Vehicle` | `ui/views/trip.js` (`showVehicleDetails`, `showReservationResult`), `services/reservationService.js` (`reserveVehicle`, `getCurrentStatus`, `createIfFree`, `expireReservations`, `pickUpVehicle`, `returnVehicle`, `reserveParkingSpace`), `domain/vehicle.js` (`changeStatus`, `getBatteryLevel`) |
| `ChargingScheduleUI`, `ChargingSessionController`, `TimeSlot`, `ChargingPort` | `ui/views/studentServices.js` (`renderScheduleForm`, `displayBookingDetails`), `services/chargingService.js` (`checkAvailability`, `createChargingSession`, `updateChargingAllocation`, `getAvailableSlots`, `buildChargingSchedule`, `optimizeQueue`), `domain/time.js` |
| `OperatorDashboardUI`, `IncidentController`, `OperationalIncident`, `MaintenanceTask` | `ui/views/operator.js` (`renderDashboard`), `ui/views/incidents.js` (`displayIncidentDetails`), `services/operatorService.js` (`detectCapacityRisks`, `identifyBottlenecks`, `planRedistribution`, `classifyIncident`, `assignMaintenance`, `markResourceUnavailable`, `applyOperationalAction`, `startMaintenanceTask`, `completeMaintenanceTask`) |
| `SimulationController`, `SimulationScenario`, `Recommendation` | `ui/views/whatif.js` (`renderSetupForm`, `displayResultsAndRecommendations`), `services/simulationService.js` (`requestSimulation`, `validateParams`, `runSimulationAlgorithm`, `saveToLibrary`, `applyCoordination`) |
| `DataSimulator` | `services/simulatorService.js` (`tickSimulator`, `updateResourceStatus`) |
| `NetworkDatabase` | `state/store.js` + `data/simulatedData.js` — **không có CSDL** |

Lớp UML là đối tượng có phương thức; trong MVP là bản ghi JS thuần + hàm dịch vụ thuần (đúng như mục 5.3 của Submission #3).

## 12. Nhóm kiểm thử như thế nào?

- **73 kiểm thử đơn vị** (`npm test`, không cần thư viện): luồng chính/thay thế/ngoại lệ của từng use case, TC-UC04-01..11, khung giờ và ưu tiên sạc, lệnh điều chuyển, vòng đời sự cố, what-if không đổi dữ liệu thật, đủ bản dịch VI/EN, tên trang = tên use case, mọi id/thao tác trên giao diện đều có xử lý, CSS không bo góc.
- **130 kiểm tra trình duyệt thật** (`tests/e2e/browser_acceptance.py`) trên Chrome và Edge, gồm phát lại nguyên kịch bản demo, Console không lỗi, màn hình 390 px không cuộn ngang.
- **Checklist thủ công** AT-01..AT-22: [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md); kết quả: [DEMO_EVIDENCE.md](DEMO_EVIDENCE.md).

## 13. Hạn chế và đánh đổi đã biết

- Không đăng nhập: mỗi tác nhân một danh tính demo cố định (D-003); một nhân viên điều phối và một nhân viên bảo trì.
- Không lưu dữ liệu, không chia sẻ giữa tab/máy; E2/E3 được tạo bằng mô phỏng (D-025).
- Khung giờ sạc 1 tiếng; pin xe không tăng dần trong phiên (hoàn tất thì lên 100 %).
- Mô hình what-if và các ngưỡng là quyết định của nhóm (D-023, D-024), không phải mô hình dự báo.
- Số liệu trong mockup Figma (ví dụ 32 xe/Hub, tên người dùng thật) là minh họa; web dùng dữ liệu mô phỏng nhỏ hơn và danh tính demo.
- Một số điểm lệch nằm trong chính PDF đã nộp (UC-12/UC-15 ở Submission #2, mã UC ở Bảng 12) — xem [UC_UI_PDF_SYNC.md mục 5](../UC_UI_PDF_SYNC.md#5-lỗi-hoặc-điểm-lệch-nằm-trong-pdf-không-sửa-được-vì-đã-nộp).
