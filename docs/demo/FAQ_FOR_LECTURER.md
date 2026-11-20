# FAQ — câu hỏi giảng viên có thể đặt khi demo

Trả lời ngắn gọn, khớp với mã thực thi hiện tại. Đường dẫn trong ngoặc là nơi chỉ cho giảng viên xem.

## 1. Kiến trúc của hệ thống là gì?

Kiến trúc **phân lớp** (layered) theo slide Architectural Design, chạy hoàn toàn trong trình duyệt:

| Lớp | Tệp | Vai trò |
|---|---|---|
| Presentation | `index.html`, `src/main.js`, `src/ui/render.js`, `src/ui/views/student.js`, `src/ui/views/operator.js`, `src/ui/i18n.js` | Thanh bên 2 cổng/6 trang, nhận thao tác, vẽ giao diện, VI/EN |
| Business services | `src/services/*.js` (6 module) | Quy tắc nghiệp vụ: tìm kiếm, giữ xe, sạc, vận hành, what-if, mô phỏng |
| Domain / State | `src/domain/*.js`, `src/state/store.js` | Trạng thái, kết quả `{ok, code, params, message}`, kho trạng thái trong bộ nhớ |
| Simulated data | `src/data/simulatedData.js` | Dữ liệu gốc: 4 Hub, 6 xe, 5 trụ sạc, 1 phiên sạc (EV-04 trên CP-03) |

Luồng một chiều: **click → `main.js` gọi service → service kiểm tra điều kiện rồi sửa store → store báo cho subscriber → trang đang mở được vẽ lại từ trạng thái.** Tương đương MVC: store là Model, `ui/` là View, `main.js` là Controller. Bố cục thanh bên + thanh trên bám theo mockup Figma ở Submission #2.

## 2. Vì sao dùng dữ liệu trong bộ nhớ, không dùng cơ sở dữ liệu?

- Đề bài cho phép "real IoT data or simulated data" (tr. 1–2) và ghi "is not required to implement a database in the backend. Data can be hard coded" (tr. 5, HK261_Assignment_Desc); trọng tâm là điều phối trạng thái, đặt chỗ, sạc, sự cố, mô phỏng (D-001, NFR-04).
- Demo tái lập được: nút **Đặt lại dữ liệu** (hoặc F5) đưa mọi thứ về dữ liệu gốc.
- Đánh đổi: không lưu lâu dài, mỗi tab có dữ liệu riêng, không có tranh chấp đa người dùng thật. Ở sản phẩm thật, lớp `NetworkDatabase` trong sơ đồ lớp sẽ là CSDL có giao dịch phía máy chủ.

## 3. Giữ xe, hết hạn, hủy giữ hoạt động thế nào? (FR-04, FR-06)

1. `reserveVehicle` xử lý hết hạn trước, chỉ nhận xe **sẵn sàng**, mỗi sinh viên tối đa **một chuyến** (D-014); tạo lượt giữ `RSV-00x` với `expiresAt = createdAt + 15 phút` (`src/services/reservationService.js`).
2. Bộ hẹn giờ 1 giây hết hạn các lượt giữ quá giờ → xe về *Sẵn sàng*, giao diện báo ngay; thẻ *Chuyến đi của tôi* đếm ngược từng giây.
3. Sinh viên có thể **Hủy giữ** trước khi nhận (UC-04 A1, D-017).
4. `pickUpVehicle` yêu cầu đúng sinh viên + lượt giữ còn hiệu lực; báo lỗi riêng cho "người khác đang giữ" và "đã hết hạn".
5. Biên thời gian được kiểm thử: còn hiệu lực ở `expiresAt − 1 ms`, hết hạn đúng tại `expiresAt`. Khi demo có thể rút ngắn bằng `?holdSeconds=20` (trang hiển thị công khai, D-012).

**"Hai người bấm cùng lúc thì sao?"** Trong một tab, JavaScript đơn luồng: kiểm tra và ghi nằm trong cùng một lời gọi đồng bộ nên người thứ hai nhận `vehicle_not_available` (kiểm thử `NFR-02`). Giữa nhiều máy thì cần máy chủ với thao tác nguyên tử — ngoài phạm vi MVP.

## 4. Sạc thông minh ưu tiên thế nào? (FR-08, FR-09, FR-15)

- **Tự động cấp trụ (D-015, khớp ADR-05 của Submission #3):** khi có yêu cầu mới, khi một phiên **Sạc xong**, khi trụ được **khôi phục**, xe được **sửa xong**, lượt giữ hết hạn/bị hủy, hệ thống giao trụ trống cho yêu cầu ưu tiên cao nhất (`allocateChargingPoints` trong `src/services/chargingService.js`).
- **Điểm ưu tiên** = `(cần dùng sớm ? 1000 : 0) + (100 − % pin)`; bằng điểm thì ai đến trước được trước.
- Xe dùng chung lấy pin và cờ "cần dùng sớm" **từ dữ liệu xe** (`Vehicle.getBatteryLevel()` trong thiết kế); xe cá nhân nhập pin 0–100 và được giữ 1 chỗ đỗ (D-008).
- Không bao giờ chạy quá số trụ đang hoạt động (NFR-03). Yêu cầu của xe đang được giữ/hỏng được giữ trong hàng đợi với nhãn **Tạm hoãn** và lý do (D-009). Mỗi xe tối đa một yêu cầu mở; ô chọn xe chỉ hiện xe đủ điều kiện.
- Không ngắt phiên đang sạc: yêu cầu ưu tiên cao hơn đến sau sẽ chờ trụ kế tiếp.
- **Sạc xong:** xe dùng chung lên 100% và sẵn sàng; xe cá nhân rời đi, giải phóng chỗ đỗ.

## 5. Sức chứa chỗ đỗ được tính thế nào? (FR-05, FR-07, FR-12)

`đã dùng = xe đang đỗ + chỗ đang giữ` (D-004); `còn cấp phát = sức chứa − đã dùng`. Mọi thao tác chiếm chỗ đều kiểm tra con số này: giữ chỗ, trả xe, xe cá nhân, điều phối xe, xe sửa xong sau khi hỏng giữa chuyến, và cả xe đến do bộ mô phỏng (D-010). Bảng *Mạng lưới Hub* xếp theo `đã dùng / sức chứa` và gắn nhãn **Hết chỗ** khi đầy. Đề bài không cho ngưỡng "sắp đầy" nên nhóm chỉ xếp hạng và cảnh báo khi đầy.

## 6. Sự cố được xử lý thế nào? (FR-14)

- **Báo xe hỏng:** xe → *Hỏng*; hủy lượt giữ/chuyến đang dùng; nếu đang sạc thì trả trụ (trụ được cấp ngay cho yêu cầu khác) và đưa yêu cầu về hàng đợi (*Tạm hoãn: xe hỏng*); mở sự cố `INC-00x`.
- **Báo trụ ngừng hoạt động:** trụ → *Ngừng hoạt động*; phiên đang sạc ở đó quay lại hàng đợi và tự chuyển sang trụ trống khác nếu có.
- **Xử lý xong (D-016):** *Đã sửa xong* đưa xe về *Sẵn sàng* (xe hỏng giữa chuyến cần chỗ trống ở Hub của nó); *Khôi phục trụ* đưa trụ về hoạt động và cấp ngay cho yêu cầu ưu tiên nhất. Danh sách lưu giờ mở/giờ xử lý.
- Phần giao việc cho kỹ thuật viên trong mockup là thiết kế, chưa hiện thực.

## 7. What-if có làm thay đổi dữ liệu thật không? (FR-16..FR-18)

Không. `runWhatIf` sao chép sâu trạng thái hiện tại, áp kịch bản lên **bản sao**, cho bản sao phản ứng theo đúng quy tắc thật (tự cấp trụ), rồi so sánh trước/sau và đưa đề xuất theo luật (điều hướng khi Hub ≥ 100%, ưu tiên sạc khi hàng chờ tăng hoặc trụ giảm, điều phối xe). Nhãn **Dữ liệu thật không đổi** được tính bằng so sánh ảnh chụp JSON trạng thái thật trước/sau (D-013). Nút áp dụng/lưu kịch bản trong sơ đồ tuần tự chưa hiện thực.

## 8. Lớp trong sơ đồ lớp tương ứng với mã nào?

| Lớp thiết kế (báo cáo) | Mã thực thi |
|---|---|
| `SearchUI`, `HubSearchController`, `HubSearchService` | `ui/views/student.js` (trang Tìm & đặt xe), `services/hubService.js` (`findSuitableVehicles`, `findSuitableHubs`) |
| `StudentUI`, `ReservationManager`, `Reservation` | `ui/views/student.js` (Chuyến đi của tôi), `services/reservationService.js` (`reserveVehicle`, `cancelReservation`, `expireReservations`, `pickUpVehicle`, `returnVehicle`, `reserveParking`, `cancelParkingReservation`) |
| `ChargingScheduleUI`, `ChargingScheduler`, `ChargingSessionController`, `ChargingPort` | `ui/views/student.js` (Đỗ xe & sạc), `ui/views/operator.js` (Sạc thông minh), `services/chargingService.js` (`submitChargingRequest`, `schedulePrivateEvCharging`, `allocateChargingPoints`, `finishCharging`, `cancelChargingRequest`, `priorityScore`) |
| `TimeSlot` (chọn khung giờ sạc) | **Chỉ ở thiết kế** — MVP cấp trụ theo ưu tiên khi trụ trống |
| `OperatorDashboardUI`, `IncidentManager`, `IncidentController` | `ui/views/operator.js` (Giám sát mạng lưới, Sự cố), `services/operatorService.js` (`getNetworkMetrics`, `getCapacityRisks`, `reportVehicleFailure`, `reportChargingPointUnavailable`, `resolveIncident`, `suggestRedistribution`, `coordinateRedistribution`) |
| `SimulationEngine`, `SimulationController`, `Recommendation` | `services/simulationService.js` (`runWhatIf`), `ui/views/operator.js` (Mô phỏng What-if) |
| `DataSimulator` | `services/simulatorService.js` (`applySimulatedUpdate`) |
| `NetworkDatabase` | `state/store.js` (kho trong bộ nhớ) + `data/simulatedData.js` — **không có CSDL** |
| `Vehicle`, `MobilityHub`, `ChargingPoint` | Đối tượng JS thuần trong state; trạng thái ở `domain/status.js` |
| `setInterfaceMode()` | `main.js` (sự kiện), `ui/render.js` (`renderApp`), `ui/i18n.js` (VI/EN) |

Không phải phương thức UML nào cũng tồn tại đúng tên trong mã; bảng trên là ánh xạ trách nhiệm.

## 9. Nhóm kiểm thử như thế nào?

- **60 kiểm thử đơn vị** (`npm test`, không cần thư viện): biên hết hạn, chống cấp phát trùng, sức chứa, tự cấp trụ theo ưu tiên, sạc xong, hủy, sự cố và xử lý xong, what-if không đổi dữ liệu thật, đủ bản dịch VI/EN, mọi id DOM tồn tại, CSS không bo góc.
- **101 kiểm tra trình duyệt thật** (`tests/e2e/browser_acceptance.py`) trên Chrome và Edge, gồm phát lại nguyên kịch bản demo, Console không lỗi, màn hình 390 px không cuộn ngang.
- **Checklist thủ công** AT-01..AT-20: [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md); kết quả: [DEMO_EVIDENCE.md](DEMO_EVIDENCE.md).

## 10. Hạn chế và đánh đổi đã biết

- Không đăng nhập: danh tính demo cố định `STUDENT-DEMO` / `OPERATOR-DEMO` (D-003); luồng "sai người" kiểm thử ở mức service.
- Không lưu dữ liệu, không chia sẻ giữa tab/máy; **Đặt lại dữ liệu** hoặc F5 đưa về gốc.
- Xe cá nhân chưa chọn được khung giờ sạc (`TimeSlot` chỉ có trong thiết kế); phiên sạc kết thúc khi vận hành bấm *Sạc xong* (không mô phỏng % pin tăng dần).
- Chưa có giao việc kỹ thuật viên cho sự cố, chưa lưu/áp dụng kịch bản What-if.
- Mã xe mô phỏng (EV-01…) khác mockup Figma (EB-101); tên Hub là dữ liệu nên không dịch khi đổi VI/EN.
- Bộ mô phỏng có chu kỳ 4 pha cố định để demo tái lập được, không phải mô hình dự báo.
