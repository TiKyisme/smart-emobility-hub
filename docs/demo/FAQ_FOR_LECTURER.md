# FAQ — câu hỏi giảng viên có thể đặt khi demo

Trả lời ngắn gọn, khớp với mã thực thi ở nhánh `release/demo-readiness`. Đường dẫn trong ngoặc là nơi chỉ cho giảng viên xem.

## 1. Kiến trúc của hệ thống là gì?

Kiến trúc **phân lớp** (layered) theo slide Architectural Design, chạy hoàn toàn trong trình duyệt:

| Lớp | Tệp | Vai trò |
|---|---|---|
| Presentation | `index.html`, `src/main.js`, `src/ui/render.js`, `src/ui/i18n.js` | Nhận thao tác, gọi service, vẽ lại giao diện, VI/EN |
| Business services | `src/services/*.js` (6 module) | Quy tắc nghiệp vụ: tìm kiếm, giữ xe, sạc, vận hành, what-if, mô phỏng |
| Domain / State | `src/domain/*.js`, `src/state/store.js` | Trạng thái (status), kết quả `{ok, code, params, message}`, kho trạng thái trong bộ nhớ |
| Simulated data | `src/data/simulatedData.js` | Dữ liệu gốc: 4 Hub, 6 xe, 5 trụ sạc |

Luồng dữ liệu một chiều: **click → `main.js` gọi service → service kiểm tra điều kiện rồi sửa store qua `store.update` → store báo cho subscriber → `renderApp` vẽ lại toàn trang từ trạng thái.** Có thể xem như MVC: store là Model, `render.js` là View, `main.js` là Controller.

## 2. Vì sao dùng dữ liệu trong bộ nhớ, không dùng cơ sở dữ liệu?

- Đề bài ghi rõ hệ thống có thể dùng "real IoT data or simulated data" (tr. 1–2) và "is not required to implement a database in the backend. Data can be hard coded" (tr. 5, HK261_Assignment_Desc); trọng tâm là điều phối trạng thái, đặt chỗ, sạc, sự cố và mô phỏng (D-001, NFR-04).
- Demo tái lập được: **F5 là đặt lại** về dữ liệu gốc, không phụ thuộc mạng hay máy chủ.
- Đánh đổi: không lưu lâu dài, mỗi tab có trạng thái riêng, không có tranh chấp đa người dùng thật. Ở sản phẩm thật, lớp `NetworkDatabase` trong sơ đồ lớp sẽ được hiện thực bằng CSDL có giao dịch (transaction) phía máy chủ.

## 3. Cơ chế giữ xe (hold) và hết hạn hoạt động thế nào? (FR-04, FR-06)

1. `reserveVehicle` xử lý hết hạn trước, rồi chỉ chấp nhận xe đang **available**; tạo reservation `{createdAt, expiresAt = createdAt + 15 phút}` và đổi xe sang **reserved** (`src/services/reservationService.js`).
2. Một bộ hẹn giờ 1 giây gọi `expireReservations`: hold *active* có `expiresAt ≤ now` → **expired**, xe về **available**, giao diện báo ngay.
3. `pickUpVehicle` yêu cầu **đúng sinh viên + hold còn active + chưa quá hạn**; báo lỗi riêng cho "người khác đang giữ" và "đã hết hạn". Hold đang *in use* không bao giờ bị hết hạn.
4. Biên thời gian được kiểm thử: còn hiệu lực ở `expiresAt − 1 ms`, hết hạn đúng tại `expiresAt`.
5. Thời lượng là quyết định của nhóm (D-007); khi demo có thể rút ngắn bằng `?holdSeconds=20` — trang luôn hiển thị thời lượng đang dùng (D-012).

**"Hai người bấm cùng lúc thì sao?"** Trong một tab, JavaScript chạy đơn luồng: kiểm tra và ghi trạng thái nằm trong cùng một lời gọi đồng bộ nên không thể xen kẽ; người thứ hai nhận `vehicle_not_available` (kiểm thử `NFR-02`). Giữa nhiều tab/máy thì không có trạng thái chung — cần máy chủ với thao tác nguyên tử, nằm ngoài phạm vi MVP.

## 4. Lịch sạc thông minh ưu tiên thế nào? (FR-15)

- Điểm ưu tiên: `(sắp cần dùng ? 1000 : 0) + (100 − % pin)` (`priorityScore` trong `src/services/chargingService.js`). Nhu cầu sắp tới luôn đứng trước; cùng loại thì pin thấp hơn trước; bằng điểm thì ai đến trước được trước.
- Xe dùng chung lấy % pin và cờ "sắp dùng" **từ dữ liệu xe** (giống `Vehicle.getBatteryLevel()` trong thiết kế); xe cá nhân do sinh viên nhập 0–100 (D-008).
- Chỉ phân vào trụ **available** tại đúng Hub; **số yêu cầu được phân ≤ số trụ trống** (NFR-03).
- Yêu cầu của xe đang được giữ/đang dùng/hỏng/đã chuyển Hub được giữ trong hàng đợi với nhãn **On hold** và lý do, không chiếm trụ (D-009). Mỗi xe tối đa một yêu cầu đang mở.
- Không ngắt (preempt) phiên đang sạc: nên sau sự cố, một yêu cầu ưu tiên cao hơn có thể phải chờ trụ tiếp theo.

## 5. Sức chứa chỗ đỗ được tính thế nào? (FR-05, FR-07, FR-12)

`đã dùng = xe đang đỗ (physical) + chỗ đang được giữ (held)` (D-004); `còn cấp phát = sức chứa − đã dùng`. Mọi thao tác chiếm chỗ đều kiểm tra con số này: giữ chỗ đỗ, trả xe, xe cá nhân, điều phối xe, và cả **xe đến do bộ mô phỏng** (D-010). Bảng rủi ro xếp Hub theo `đã dùng / sức chứa` giảm dần và gắn nhãn **at capacity** khi hết chỗ. Đề bài không cho ngưỡng "sắp đầy" (ví dụ 80%) nên nhóm không tự đặt ngưỡng; chỉ xếp hạng và cảnh báo khi đầy.

## 6. Xử lý sự cố làm gì với trạng thái? (FR-14)

- **Xe hỏng:** xe → *failed*; hủy hold/đang dùng của xe; nếu đang sạc thì trả trụ và đưa yêu cầu về hàng đợi (On hold: vehicle failed); mở sự cố *Open*.
- **Trụ ngừng hoạt động:** trụ → *unavailable*; yêu cầu đang sạc ở trụ đó quay lại hàng đợi và xe trở về *available* để được xếp sang trụ khác; mở sự cố.
- Quy trình giao việc bảo trì/đóng sự cố có trong sơ đồ thiết kế nhưng **chưa hiện thực** trong MVP.

## 7. What-if có làm thay đổi dữ liệu thật không? (FR-16..FR-18)

Không. `runWhatIf` sao chép sâu trạng thái hiện tại (`structuredClone`), áp kịch bản lên **bản sao**, tính tác động trước/sau, xếp hạng rủi ro và đề xuất theo luật (chuyển hướng khi Hub ≥ 100%, lập lại lịch sạc khi hàng đợi tăng/trụ giảm, điều phối xe). Dòng **"Live state unchanged: yes"** được tính bằng so sánh ảnh chụp JSON của trạng thái thật trước và sau khi chạy (D-013), không phải hằng số. Nút áp dụng/lưu kịch bản trong sơ đồ tuần tự là phần thiết kế, chưa hiện thực.

## 8. Lớp trong sơ đồ lớp tương ứng với mã nào?

Sơ đồ lớp là mức **thiết kế**; MVP hiện thực cùng trách nhiệm bằng module ES và hàm:

| Lớp thiết kế (báo cáo) | Mã thực thi |
|---|---|
| `SearchUI`, `HubSearchController`, `HubSearchService` | `ui/render.js` (`renderSearch`), `services/hubService.js` (`findSuitableVehicles`, `findSuitableHubs`) |
| `ReservationManager`, `Reservation` | `services/reservationService.js` (`reserveVehicle`, `expireReservations`, `pickUpVehicle`, `returnVehicle`, `reserveParking`) |
| `ChargingScheduler`, `ChargingSessionController`, `ChargingPort` | `services/chargingService.js` (`submitChargingRequest`, `schedulePrivateEvCharging`, `buildChargingSchedule`, `applyChargingSchedule`, `priorityScore`) |
| `TimeSlot` (chọn khung giờ sạc) | **Chỉ ở thiết kế** — MVP xếp lịch theo trụ trống, không chọn khung giờ |
| `OperatorDashboardUI`, `IncidentManager`, `IncidentController` | `ui/render.js` (`renderOperator`), `services/operatorService.js` (`getNetworkMetrics`, `getCapacityRisks`, `reportVehicleFailure`, `reportChargingPointUnavailable`, `suggestRedistribution`, `coordinateRedistribution`) |
| `SimulationEngine`, `SimulationController`, `Recommendation` | `services/simulationService.js` (`runWhatIf`) |
| `DataSimulator` | `services/simulatorService.js` (`applySimulatedUpdate`) |
| `NetworkDatabase` (trừu tượng kho dữ liệu) | `state/store.js` (kho trong bộ nhớ) + `data/simulatedData.js` (dữ liệu gốc) — **không có CSDL** |
| `Vehicle`, `MobilityHub`, `ChargingPoint` | Đối tượng JS thuần trong state; trạng thái trong `domain/status.js` |
| `setInterfaceMode()` | `main.js` (sự kiện), `ui/render.js` (`renderApp`), `ui/i18n.js` (VI/EN) |

Không phải phương thức UML nào cũng tồn tại đúng tên trong mã; bảng trên là ánh xạ trách nhiệm.

## 9. Nhóm kiểm thử như thế nào?

- **47 kiểm thử đơn vị** (`npm test`, test runner có sẵn của Node, không thư viện): quy tắc nghiệp vụ, biên hết hạn, chống cấp phát trùng, sức chứa, sự cố, what-if không đổi dữ liệu thật, đầy đủ bản dịch VI/EN, `node --check` mọi module, mọi id DOM tồn tại.
- **93 kiểm tra trình duyệt thật** (`tests/e2e/browser_acceptance.py`, Playwright) trên Chrome và Edge, gồm phát lại nguyên kịch bản demo, không có lỗi Console, không cuộn ngang ở 390 px.
- **Checklist thủ công** AT-01..AT-20: [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md). Kết quả ghi ở [DEMO_EVIDENCE.md](DEMO_EVIDENCE.md).

## 10. Hạn chế và đánh đổi đã biết

- Không đăng nhập: một danh tính demo cố định `STUDENT-DEMO` (D-003). Luồng "sai người" được kiểm thử ở mức service.
- Không lưu dữ liệu, không chia sẻ giữa tab/máy; F5 đặt lại.
- Xe cá nhân: chưa chọn khung giờ sạc (thiết kế có `TimeSlot`); quy trình hai bước: sinh viên đăng ký → vận hành áp dụng lịch.
- Chưa có kết thúc phiên sạc, đóng sự cố, giao việc bảo trì; xe đang sạc giữ trạng thái *Charging* đến khi tải lại.
- Mã xe trong dữ liệu mô phỏng (EV-01…) khác mockup Figma (EB-101) — mockup là thiết kế giao diện, không phải dữ liệu chạy.
- Bộ mô phỏng có chu kỳ 4 pha cố định để demo tái lập được; không phải mô hình dự báo.
- Tên Hub là dữ liệu nên không được dịch khi đổi VI/EN.
