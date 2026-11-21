#!/usr/bin/env python3
"""Browser acceptance run for the Smart E-Mobility Hub MVP (AT-01..AT-20 and the use-case flows
of the Submission #1-#3 reports: UC-02, UC-04, UC-09, UC-15, UC-17, the staff use cases).

Starts `python -m http.server` on a free loopback port from the repository root, drives the
real page in an installed Chrome or Edge through Playwright, and prints PASS/FAIL per check.
The interface starts in Vietnamese (D-011), so expected messages are Vietnamese unless a
scenario switches to English.

Usage (from the repository root):
    python tests/e2e/browser_acceptance.py                 # headless, screenshots -> docs/demo/screenshots
    python tests/e2e/browser_acceptance.py --headed        # watch the run
    python tests/e2e/browser_acceptance.py --no-screenshots

Optional dev tool only (the app itself has no dependencies): pip install playwright
It uses the installed Chrome/Edge; `python -m playwright install chromium` is only needed if neither exists.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = ["metro_arrival_surge", "hub_full", "charging_demand_surge", "charging_point_failures", "vehicle_concentration"]
PAGES = ["find", "reserve", "parking", "evcharge", "network", "charging", "redistribution", "incidents", "whatif", "dispatch", "maintenance"]
UC_NAMES = {
    "find": "Find Suitable Hub / Vehicle",
    "reserve": "Reserve Shared Vehicle",
    "parking": "Reserve Parking Space",
    "evcharge": "Schedule Private EV Charging",
    "network": "Monitor Network Status",
    "charging": "Manage Smart Charging",
    "redistribution": "Redistribute Vehicles",
    "incidents": "Handle Operational Incident",
    "whatif": "Run What-if Simulation",
    "dispatch": "Execute Redistribution Task",
    "maintenance": "Resolve Assigned Incident",
}


class Report:
    def __init__(self) -> None:
        self.results: list[tuple[str, str, bool, str]] = []

    def check(self, scenario: str, name: str, ok: object, detail: str = "") -> bool:
        passed = bool(ok)
        self.results.append((scenario, name, passed, detail))
        suffix = f" | {detail}" if detail and not passed else ""
        print(f"{'PASS' if passed else 'FAIL'} [{scenario}] {name}{suffix}", flush=True)
        return passed

    @property
    def failed(self) -> int:
        return sum(1 for result in self.results if not result[2])


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@contextlib.contextmanager
def static_server():
    port = free_port()
    process = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        deadline = time.time() + 10
        while True:
            try:
                urllib.request.urlopen(base + "/index.html", timeout=1).close()
                break
            except OSError:
                if time.time() > deadline:
                    raise RuntimeError("static server did not start")
                time.sleep(0.2)
        yield base
    finally:
        process.terminate()
        process.wait(timeout=10)


def http_smoke(report: Report, base: str) -> None:
    files = ["index.html", "src/styles.css", *sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "src").rglob("*.js"))]
    problems = []
    for name in files:
        with urllib.request.urlopen(f"{base}/{name}", timeout=5) as response:
            body = response.read()
            content_type = response.headers.get("Content-Type", "")
            if response.status != 200 or body != (ROOT / name).read_bytes():
                problems.append(f"{name}: status {response.status} or content mismatch")
            if name.endswith(".js") and "javascript" not in content_type:
                problems.append(f"{name}: Content-Type {content_type}")
    report.check("HTTP", f"{len(files)} assets served with status 200, identical bytes and JS MIME type", not problems, "; ".join(problems))


def avoid_hour_boundary() -> None:
    """Charging slots are clock hours: do not start a scenario in the last 20 s of an hour."""
    now = dt.datetime.now()
    seconds_left = 3600 - (now.minute * 60 + now.second)
    if seconds_left < 20:
        time.sleep(seconds_left + 2)


class App:
    def __init__(self, page, base: str) -> None:
        self.page = page
        self.base = base

    def open(self, query: str = "", page: str = "find") -> None:
        # Leave the document first: a URL that differs only in its #hash would not reload the
        # page, and every scenario must start from the seed data.
        avoid_hour_boundary()
        self.page.goto("about:blank")
        self.page.goto(f"{self.base}/{query}#{page}", wait_until="networkidle")
        self.page.wait_for_selector(f'section.page[data-page="{page}"]:not([hidden])')

    def go(self, page: str) -> None:
        self.page.click(f'.nav-link[data-page="{page}"]')
        self.page.wait_for_selector(f'section.page[data-page="{page}"]:not([hidden])')

    def text(self, selector: str) -> str:
        return self.page.inner_text(selector).strip()

    def toast(self) -> str:
        return self.text("#toast-text") if self.page.is_visible("#toast") else ""

    def toast_ok(self) -> bool:
        return "toast-success" in (self.page.get_attribute("#toast", "class") or "")

    def close_toast(self) -> None:
        if self.page.is_visible("#toast"):
            self.page.click("#toast-close")

    def act(self, action: str, **data: str) -> None:
        selector = f'[data-action="{action}"]' + "".join(f'[data-{key}="{value}"]' for key, value in data.items())
        self.page.locator(selector).first.click()

    def screen(self) -> str | None:
        return self.page.get_attribute("#reserve-panel", "data-screen")

    def select_vehicle(self, vehicle_id: str) -> None:
        self.act("select-vehicle", **{"vehicle-id": vehicle_id})
        self.page.wait_for_selector('section.page[data-page="reserve"]:not([hidden])')

    def find_vehicle(self, hub_id: str, vehicle_id: str) -> None:
        if self.page.is_hidden('section.page[data-page="find"]'):
            self.go("find")
        if self.page.locator(f'#hub-results tr[data-hub-id="{hub_id}"] [data-action="select-hub"]').count():
            self.act("select-hub", **{"hub-id": hub_id})
        self.select_vehicle(vehicle_id)

    def open_demo(self, container: str) -> None:
        details = self.page.locator(f"{container} details.demo")
        if details.get_attribute("open") is None:
            details.locator("summary").click()

    def kpi(self, metric: str) -> str:
        return self.text(f'[data-metric="{metric}"] strong')

    def fleet_status(self, vehicle_id: str) -> str:
        return self.text(f'#fleet-table tr[data-vehicle-id="{vehicle_id}"] [data-status]')

    def shot(self, directory: Path | None, name: str, full_page: bool = False) -> None:
        if directory is None:
            return
        self.close_toast()
        self.page.evaluate("window.scrollTo(0, 0)")
        self.page.screenshot(path=str(directory / name), full_page=full_page)


def scenario_find(app: App, report: Report, shots: Path | None) -> None:
    s = "S1 UC-02 find Hub / vehicle (AT-01..03)"
    app.open()
    page = app.page
    report.check(s, "Vietnamese interface by default (D-011)", page.get_attribute("html", "lang") == "vi" and app.text("#page-title") == "Tìm Hub / phương tiện")
    rows = page.locator("#hub-results tbody tr")
    ids = [row.get_attribute("data-hub-id") for row in rows.all()]
    report.check(s, "default location Ga Metro ĐHQG, radius 1 km: 5 Hubs, nearest first", ids == ["HUB-METRO", "HUB-UIT", "HUB-DV", "HUB-USSH", "HUB-LIB"], str(ids))
    report.check(s, "distance, walking time and resources per Hub", "0.5 km · 7 phút đi bộ" in app.text('#hub-results tr[data-hub-id="HUB-UIT"]')
                 and "Tại vị trí của bạn" in app.text('#hub-results tr[data-hub-id="HUB-METRO"]'))
    vehicles = [row.get_attribute("data-vehicle-id") for row in page.locator("#vehicle-results tbody tr").all()]
    report.check(s, "vehicles of the nearest Hub, best battery first", vehicles == ["EB-101", "EM-203", "EB-102"], str(vehicles))
    page.select_option("#vehicle-type", "e_bike")
    page.fill("#minimum-battery", "50")
    vehicles = [row.get_attribute("data-vehicle-id") for row in page.locator("#vehicle-results tbody tr").all()]
    report.check(s, "filters: vehicle type E-Bike and battery >= 50 % -> EB-101", vehicles == ["EB-101"], str(vehicles))
    page.select_option("#vehicle-type", "")
    page.fill("#minimum-battery", "0")
    page.select_option("#search-destination", "KTX-A")
    report.check(s, "A2: parking near the destination", "KTX Khu A · trống 3" in app.text("[data-destination-hubs]"))
    app.act("select-hub", **{"hub-id": "HUB-UIT"})
    report.check(s, "choosing another Hub lists its vehicles", app.text("#vehicles-title") == "Phương tiện tại ĐH Công nghệ Thông tin"
                 and page.locator("#vehicle-results tbody tr").count() == 1)
    page.select_option("#search-origin", "LOC-HEALTH")
    report.check(s, "E1: no Hub in the radius", app.text('[data-search-error="hubs_none"]') == "Không có Mobility Hub nào trong 1 km. Hãy tăng bán kính.")
    page.select_option("#search-origin", "")
    report.check(s, "E2: location missing -> choose it manually", app.text('[data-search-error="location_required"]') == "Chưa xác định được vị trí. Hãy chọn vị trí thủ công.")
    page.select_option("#search-origin", "HUB-METRO")
    page.fill("#search-radius", "6")
    report.check(s, "radius outside 0.1–5.0 km refused", app.text('[data-search-error="radius_invalid"]') == "Bán kính phải từ 0.1 đến 5 km.")
    page.fill("#search-radius", "5")
    report.check(s, "radius 5 km covers all 12 Hubs", rows.count() == 12)
    page.fill("#search-radius", "1")
    page.select_option("#search-destination", "")
    app.shot(shots, "01_find.png")


def scenario_reserve(app: App, report: Report, shots: Path | None) -> None:
    s = "S2 UC-04/06/07 reserve, pick up, return (AT-04,06,07)"
    app.open()
    page = app.page
    app.select_vehicle("EB-101")
    report.check(s, "confirmation step shows Hub, status and battery", app.screen() == "confirm" and app.text("#reserve-title") == "Xác nhận đặt xe"
                 and "Ga Metro ĐHQG" in app.text("#reserve-panel") and "82%" in app.text("#reserve-panel"))
    app.act("cancel-before-confirm")
    report.check(s, "A1 / TC-UC04-09: cancel before confirming creates nothing", app.toast() == "Chưa tạo lượt đặt; EB-101 vẫn Sẵn sàng." and app.screen() == "empty", app.toast())
    report.check(s, "hold time shown as 15 minutes", app.text("#hold-duration") == "Thời gian giữ xe: 15 phút.", app.text("#hold-duration"))
    app.act("choose-another")
    page.wait_for_selector('section.page[data-page="find"]:not([hidden])')
    report.check(s, "A2: back to the vehicle list", app.text("#page-title") == "Tìm Hub / phương tiện")
    app.select_vehicle("EB-101")
    app.act("confirm-reservation")
    report.check(s, "reservation confirmed with expiry time", app.toast().startswith("Đã giữ EB-101 đến") and app.toast_ok() and app.screen() == "active", app.toast())
    countdown = app.text("#reserve-next [data-countdown]")
    report.check(s, "details: ID, Active, created, expiry, held for; live countdown",
                 app.text("#reserve-panel [data-reservation-id]") == "RSV-001" and "STUDENT-DEMO" in app.text("#reserve-panel")
                 and countdown in ("15:00", "14:59", "14:58"), countdown)
    app.shot(shots, "02_reserve.png")
    app.go("find")
    report.check(s, "D-014: other vehicles cannot be reserved during a trip", page.locator("#vehicle-results button:disabled").count() >= 2)
    app.go("reserve")
    app.act("pickup-vehicle", **{"vehicle-id": "EB-101"})
    report.check(s, "pickup starts the trip", app.toast() == "Đã nhận EB-101 tại Ga Metro ĐHQG." and app.screen() == "in_use", app.toast())
    page.select_option("#return-hub", "HUB-LIB")
    page.click("#simulate-update")
    kept = page.input_value("#return-hub")
    report.check(s, "REGRESSION: chosen return Hub survives a re-render", kept == "HUB-LIB", kept)
    app.act("return-vehicle", **{"vehicle-id": "EB-101"})
    report.check(s, "return to a Hub with space ends the trip", app.toast() == "Đã trả EB-101 tại Thư viện Trung tâm." and app.screen() == "empty", app.toast())
    history = app.text('#trip-history tr[data-reservation-id="RSV-001"]')
    report.check(s, "trip history (FR-STU-4): route and status", "Ga Metro ĐHQG → Thư viện Trung tâm" in history and "Hoàn tất" in history, history)


def scenario_reserve_exceptions(app: App, report: Report, shots: Path | None) -> None:
    s = "S3 UC-04 A3, E2, E3"
    app.open("?holdSeconds=10", page="reserve")
    report.check(s, "demo hold time visible", app.text("#hold-duration") == "Thời gian giữ xe: 10 giây (thiết lập demo).", app.text("#hold-duration"))
    app.find_vehicle("HUB-METRO", "EB-101")
    app.act("confirm-reservation")
    app.page.wait_for_function("() => document.querySelector('#reserve-panel').dataset.screen === 'expired'", timeout=20_000)
    report.check(s, "A3: the hold expires by itself; vehicle available again", app.toast() == "Hết thời gian giữ: EB-101 đã sẵn sàng trở lại." and not app.toast_ok()
                 and app.text("#reserve-title") == "Lượt đặt đã hết hạn", app.toast())
    app.find_vehicle("HUB-METRO", "EM-203")
    app.open_demo("#reserve-panel")
    app.act("sim-conflict", **{"vehicle-id": "EM-203"})
    report.check(s, "E3 set-up: another student reserves the vehicle first", app.toast() == "Mô phỏng: STUDENT-OTHER-01 đã đặt EM-203 trước.", app.toast())
    app.act("confirm-reservation")
    report.check(s, "E3 / TC-UC04-02: conflict, no reservation for this student", app.toast() == "EM-203 vừa được người khác đặt. Hãy chọn xe khác." and not app.toast_ok()
                 and app.screen() == "confirm", app.toast())
    app.act("choose-another")
    app.find_vehicle("HUB-METRO", "EB-102")
    app.open_demo("#reserve-panel")
    app.act("sim-read-error", **{"vehicle-id": "EB-102"})
    app.act("confirm-reservation")
    report.check(s, "E2 / TC-UC04-10: state unreadable -> retry message, nothing created",
                 app.toast() == "Không đọc được trạng thái hiện tại của EB-102. Vui lòng thử lại sau ít giây." and app.screen() == "confirm", app.toast())
    time.sleep(10.5)
    app.act("confirm-reservation")
    report.check(s, "E2: retry after the error succeeds", app.toast().startswith("Đã giữ EB-102 đến") and app.screen() == "active", app.toast())
    app.open("?holdSeconds=5", page="reserve")
    report.check(s, "out-of-range holdSeconds ignored", app.text("#hold-duration") == "Thời gian giữ xe: 15 phút.", app.text("#hold-duration"))


def scenario_parking(app: App, report: Report, shots: Path | None) -> None:
    s = "S4 UC-05 parking within capacity (AT-05)"
    app.open(page="parking")
    page = app.page
    page.select_option("#parking-hub", "HUB-NVH")
    messages = []
    for _ in range(4):
        page.click("#reserve-parking")
        messages.append(app.toast())
    report.check(s, "four free spaces held", messages[-1] == "Đã giữ chỗ tại Nhà Văn hóa Sinh viên; còn 0 chỗ.", " / ".join(messages))
    page.click("#reserve-parking")
    report.check(s, "fifth hold refused (NFR-03)", app.toast() == "Nhà Văn hóa Sinh viên đã hết chỗ đỗ." and not app.toast_ok(), app.toast())
    report.check(s, "Hub list marks the Hub as full", "Nhà Văn hóa Sinh viên · hết chỗ" in page.locator("#parking-hub").inner_text())
    app.act("cancel-parking")
    report.check(s, "a hold can be released", app.toast() == "Đã hủy giữ chỗ tại Nhà Văn hóa Sinh viên." and page.locator("#my-parking tbody tr").count() == 3, app.toast())


def scenario_ev_booking(app: App, report: Report, shots: Path | None) -> None:
    s = "S5 UC-09 schedule private EV charging (AT-08, AT-09)"
    app.open(page="evcharge")
    page = app.page
    report.check(s, "form: Hub, date, time slot with free ports", page.input_value("#ev-hub") == "HUB-METRO" and page.input_value("#ev-date") == "0"
                 and "trống 2/2" in page.locator("#ev-slot option").first.inner_text())
    page.fill("#ev-label", "")
    page.click("#ev-check")
    report.check(s, "input check: plate or label required", app.toast() == "Hãy nhập biển số hoặc tên xe." and not app.toast_ok(), app.toast())
    page.fill("#ev-label", "59A-123.45")
    page.click("#ev-check")
    report.check(s, "available slot -> booking details for review", page.locator("[data-booking-review]").count() == 1
                 and "59A-123.45" in app.text("#ev-booking") and "Thường" in app.text("#ev-booking"))
    app.act("ev-cancel")
    report.check(s, "A3: cancel before confirming books nothing", app.toast() == "Đã hủy; chưa đặt lịch sạc nào." and page.locator("#my-charging tbody tr").count() == 0, app.toast())
    page.select_option("#ev-hub", "KTX-A")
    page.click("#ev-check")
    report.check(s, "A1: a full slot is refused with other slots and Hubs", page.locator('[data-booking-error="slot_full"]').count() == 1
                 and page.locator('#ev-booking [data-action="ev-use-slot"]').count() >= 2)
    app.act("ev-use-slot")
    report.check(s, "choosing an offered slot shows its details", page.locator("[data-booking-review]").count() == 1 and "KTX Khu A" in app.text("#ev-booking"))
    app.act("ev-confirm")
    report.check(s, "later slot booked (Scheduled)", app.toast().startswith("Đã đặt lịch: 59A-123.45 tại KTX Khu A,") and page.locator("[data-booking-confirmed]").count() == 1, app.toast())
    app.shot(shots, "03_ev_charging.png")
    app.act("ev-new")
    page.select_option("#ev-hub", "HUB-METRO")
    page.select_option("#ev-date", "0")
    page.select_option("#ev-slot", index=0)
    page.fill("#ev-label", "51A-678.90")
    page.fill("#ev-battery", "15")
    page.click("#ev-check")
    report.check(s, "battery below 20 % shown as high priority (ADR-05)", "Cao (pin dưới 20 % hoặc khởi hành sớm)" in app.text("#ev-booking"))
    app.act("ev-confirm")
    report.check(s, "current slot: charging starts on a free port", app.toast() == "Đã đặt lịch: 51A-678.90 đang sạc tại CP-01.", app.toast())
    statuses = page.locator("#my-charging tbody tr").all_inner_texts()
    report.check(s, "View Charging Status: scheduled and charging sessions", any("Đã đặt lịch" in row for row in statuses) and any("Đang sạc · CP-01" in row for row in statuses), str(statuses))
    app.open_demo("#page-evcharge")
    page.click("#ev-sim-port-error")
    page.click("#ev-check")
    report.check(s, "E2: port status unreadable -> retry later", page.locator('[data-booking-error="port_status_unavailable"]').count() == 1)
    app.act("cancel-charging")
    report.check(s, "a booked session can be cancelled", app.toast() == "Đã hủy lịch sạc của 59A-123.45.", app.toast())


def scenario_smart_charging(app: App, report: Report, shots: Path | None) -> None:
    s = "S6 Manage Smart Charging (AT-11, AT-15)"
    app.open(page="charging")
    page = app.page
    page.select_option("#charging-hub", "KTX-A")
    report.check(s, "port CP-03 charging EM-201", "EM-201" in app.text('#points-table tr[data-point-id="CP-03"]') and "Đang sạc" in app.text('#points-table tr[data-point-id="CP-03"]'))
    options = page.locator("#charging-vehicle option").all_inner_texts()
    report.check(s, "only eligible shared vehicles are offered", options == ["EB-103 · 61%", "EB-105 · 90%"], str(options))
    page.select_option("#charging-vehicle", "EB-103")
    page.click("#submit-charging")
    report.check(s, "busy port -> earliest free slot", app.toast().startswith("Đã xếp lịch EB-103 tại KTX Khu A,"), app.toast())
    row = '#charging-schedule tr[data-request-id="CHG-002"]'
    report.check(s, "schedule shows the booking with its priority", "Đã đặt lịch" in app.text(row) and "EB-103" in app.text(row))
    app.act("reschedule-charging", **{"request-id": "CHG-002"})
    report.check(s, "FR-OPT-17: a booking can be moved later", app.toast().startswith("Đã dời EB-103 sang"), app.toast())
    app.act("finish-charging", **{"point-id": "CP-03"})
    report.check(s, "finish: EM-201 done, port free", app.toast() == "EM-201 đã sạc xong tại CP-03." and "Sẵn sàng" in app.text('#points-table tr[data-point-id="CP-03"]'), app.toast())
    app.act("operator-cancel-charging", **{"request-id": "CHG-002"})
    report.check(s, "operator cancels a booking", app.toast() == "Đã hủy lịch sạc của EB-103.", app.toast())
    page.select_option("#charging-hub", "HUB-METRO")
    page.select_option("#charging-vehicle", "EB-102")
    page.click("#submit-charging")
    report.check(s, "free port assigned immediately", app.toast() == "EB-102 đang sạc tại CP-01.", app.toast())
    report.check(s, "upcoming usage from the vehicle record -> priority tag", "Ưu tiên" in app.text('#charging-schedule tr[data-request-id="CHG-003"]'))
    page.click("#optimize-queue")
    report.check(s, "optimize: the schedule already fits", app.toast() == "Lịch sạc của Ga Metro ĐHQG đã phù hợp số cổng đang hoạt động.", app.toast())
    app.shot(shots, "05_smart_charging.png")


def scenario_network(app: App, report: Report, shots: Path | None) -> None:
    s = "S7 Monitor Network Status (AT-10..12)"
    app.open(page="network")
    page = app.page
    report.check(s, "KPIs: 12 Hubs, 22/23 vehicles, 13/14 ports", app.kpi("hubs") == "12" and app.kpi("vehicles") == "22/23" and app.kpi("points") == "13/14")
    report.check(s, "alerts at the configured thresholds (FR-OPT-4..6)",
                 page.locator('#alert-list [data-alert="overload"][data-hub-id="HUB-UEL"]').count() == 1
                 and page.locator('#alert-list [data-alert="shortage"][data-hub-id="HUB-NVH"]').count() == 1)
    first = page.locator("#network-table tbody tr").first
    report.check(s, "Hubs ranked by utilization; the overloaded Hub first", first.get_attribute("data-hub-id") == "HUB-UEL" and "88%" in first.inner_text(), first.inner_text())
    report.check(s, "fleet shows type, battery and status", "Xe máy điện" in app.text('#fleet-table tr[data-vehicle-id="EM-201"]') and app.fleet_status("EM-201") == "Đang sạc")
    app.shot(shots, "04_network.png")
    page.fill("#threshold-overload", "90")
    page.fill("#threshold-shortage", "0")
    page.click("#save-thresholds")
    report.check(s, "thresholds are configurable", app.toast() == "Đã lưu ngưỡng: quá tải ≥ 90 %, thiếu xe khi dưới 0." and app.text("#alert-list") == "Không có cảnh báo theo ngưỡng hiện tại.", app.toast())
    page.fill("#threshold-overload", "40")
    page.click("#save-thresholds")
    report.check(s, "invalid thresholds refused", app.toast() == "Ngưỡng quá tải: 50–100 %; ngưỡng thiếu xe: 0–10 xe." and not app.toast_ok(), app.toast())


def scenario_redistribution(app: App, report: Report, shots: Path | None) -> None:
    s = "S8 Redistribute Vehicles + Execute Redistribution Task (AT-13)"
    app.open(page="redistribution")
    page = app.page
    report.check(s, "plan: the shortage Hub receives a vehicle from the overloaded Hub",
                 page.locator('[data-plan-from="HUB-UEL"][data-plan-to="HUB-NVH"]').count() == 1
                 and "Nhà Văn hóa Sinh viên đang thiếu xe: điều 1 xe từ ĐH Kinh tế - Luật." in app.text("#redistribution-plan"))
    app.act("apply-plan")
    report.check(s, "plan applied as a task for the dispatch staff", app.toast() == "Đã áp dụng: 1 lệnh điều chuyển, 0 lịch sạc, dời 0 lịch."
                 and "Đã phân công" in app.text('#dispatch-orders tr[data-order-id="DSP-001"]'), app.toast())
    page.select_option("#dispatch-from", "KTX-B")
    page.select_option("#dispatch-vehicle", "EB-106")
    page.select_option("#dispatch-to", "HUB-METRO")
    page.click("#create-dispatch")
    report.check(s, "manual order (FR-OPT-7/8)", app.toast() == "DSP-002: EB-106 KTX Khu B → Ga Metro ĐHQG, đã giao DISPATCH-DEMO.", app.toast())
    app.act("cancel-dispatch", **{"order-id": "DSP-002"})
    report.check(s, "an order that has not started can be cancelled", app.toast() == "Đã hủy DSP-002; EB-106 sẵn sàng trở lại.", app.toast())
    app.shot(shots, "06_redistribution.png")
    app.go("dispatch")
    report.check(s, "staff portal shows the dispatch identity", app.text("#user-chip") == "DISPATCH-DEMO · Nhân viên điều phối xe")
    app.act("start-dispatch", **{"order-id": "DSP-001"})
    report.check(s, "FR-DIS-3: task started", app.toast() == "Bắt đầu DSP-001: EM-208 đang được chuyển.", app.toast())
    app.act("complete-dispatch", **{"order-id": "DSP-001"})
    report.check(s, "FR-DIS-4..6: vehicle arrives, Hubs updated", app.toast() == "EM-208 đã đến Nhà Văn hóa Sinh viên (DSP-001).", app.toast())
    app.go("network")
    report.check(s, "both alerts cleared after the task", app.text("#alert-list") == "Không có cảnh báo theo ngưỡng hiện tại.", app.text("#alert-list"))


def scenario_incidents(app: App, report: Report, shots: Path | None) -> None:
    s = "S9 UC-15 Handle Operational Incident + Resolve Assigned Incident (AT-14)"
    app.open(page="incidents")
    page = app.page
    page.select_option("#incident-charging-point", "CP-02")
    page.click("#report-charging-failure")
    report.check(s, "incident recorded as New", app.toast() == "Đã ghi nhận INC-001 cho CP-02." and app.kpi("incident-new") == "1", app.toast())
    report.check(s, "step 1 shown: confirm and classify", page.locator('[data-action="classify-incident"]').count() == 1)
    page.select_option("#incident-type", "charging_point_power")
    page.select_option("#incident-severity", "high")
    app.act("classify-incident")
    report.check(s, "classified; step 2: repair or operational handling", app.toast() == "Đã xác nhận và phân loại INC-001."
                 and page.locator('[data-action="assign-maintenance"]').count() == 1 and page.locator('[data-action="operational-action"]').count() == 1, app.toast())
    app.act("mark-unavailable")
    report.check(s, "'Confirm unavailable' takes the port out of service", app.toast() == "CP-02 đã ngừng phục vụ (INC-001)." and "Ngừng phục vụ" in app.text("#incident-detail"), app.toast())
    app.act("assign-maintenance")
    report.check(s, "assigned to the maintenance staff", app.toast() == "Đã giao INC-001 cho MAINT-DEMO (MT-001)." and app.kpi("incident-assigned") == "1", app.toast())
    app.shot(shots, "07_incidents.png")
    app.go("maintenance")
    report.check(s, "maintenance portal lists the task", "INC-001" in app.text('#maintenance-tasks tr[data-task-id="MT-001"]') and app.text("#user-chip") == "MAINT-DEMO · Nhân viên bảo trì")
    app.act("start-maintenance", **{"task-id": "MT-001"})
    report.check(s, "FR-MNT-3: in progress", app.toast() == "Đang xử lý MT-001 (INC-001).", app.toast())
    app.go("incidents")
    report.check(s, "operator sees the progress (FR-MNT-6)", app.kpi("incident-in_progress") == "1")
    app.go("maintenance")
    app.act("complete-maintenance", **{"task-id": "MT-001"})
    report.check(s, "FR-MNT-4/5: completed, port restored", app.toast() == "CP-02 đã hoạt động trở lại.", app.toast())
    app.shot(shots, "09_staff.png")
    app.go("incidents")
    report.check(s, "incident resolved", app.kpi("incident-resolved") == "1" and "Sự cố đã được giải quyết." in app.text("#incident-detail"))
    page.select_option("#incident-vehicle", "EB-110")
    page.click("#report-vehicle-failure")
    app.act("classify-incident")
    app.act("operational-action")
    report.check(s, "operational branch: restored without repair", app.toast() == "EB-110 đã hoạt động trở lại tại ĐH KHXH&NV."
                 and "Xử lý vận hành (không cần sửa)" in app.text("#incident-detail"), app.toast())


def scenario_what_if(app: App, report: Report, shots: Path | None) -> None:
    s = "S10 UC-17 Run What-if Simulation (AT-16..18)"
    app.open(page="whatif")
    page = app.page
    report.check(s, "setup form with template defaults", page.input_value("#scenario") == "metro_arrival_surge" and page.input_value("#scenario-hub") == "HUB-METRO"
                 and page.input_value("#scenario-demand") == "150" and page.input_value("#scenario-offline") == "0" and page.input_value("#scenario-horizon") == "2"
                 and app.text("#scenario-offline-label") == "Số cổng sạc giả lập ngừng (trên 2)")
    page.click("#run-simulation")
    report.check(s, "run on a copy; live data unchanged", app.toast() == "Đã mô phỏng cho Ga Metro ĐHQG. Dữ liệu thật không đổi." and "Dữ liệu thật không đổi" in app.text("#simulation-output"), app.toast())
    report.check(s, "target Hub: critical bottleneck", page.locator('#simulation-output [data-hub-id="HUB-METRO"][data-impact="critical"]').count() == 1)
    recs = app.text("#simulation-output .recommendations")
    report.check(s, "typed recommendations", "[Điều phối xe] Điều 3 xe từ KTX Khu B đến Ga Metro ĐHQG." in recs
                 and "[Điều hướng người dùng] Hướng người dùng đỗ/trả xe tại ĐH Công nghệ Thông tin (0.5 km) thay cho Ga Metro ĐHQG." in recs, recs)
    app.shot(shots, "08_whatif.png")
    app.act("save-scenario")
    report.check(s, "Save scenario", app.toast() == "Đã lưu SCN-001 vào thư viện kịch bản." and page.locator('#saved-scenarios li[data-scenario-id="SCN-001"]').count() == 1, app.toast())
    app.act("apply-recommendations")
    report.check(s, "Apply recommendations creates dispatch tasks", app.toast() == "Đã áp dụng: 3 lệnh điều chuyển, 0 lịch sạc, dời 0 lịch."
                 and page.locator('[data-action="apply-recommendations"]').is_disabled(), app.toast())
    page.fill("#scenario-demand", "-1")
    page.click("#run-simulation")
    report.check(s, "invalid demand refused", app.toast() == "Mức tăng nhu cầu phải là số nguyên từ 0 đến 500 %." and page.locator('[data-simulation-error="param_demand_invalid"]').count() == 1, app.toast())
    page.fill("#scenario-demand", "0")
    page.fill("#scenario-offline", "3")
    page.click("#run-simulation")
    report.check(s, "offline ports above the Hub total refused", app.toast() == "Số cổng ngừng phải từ 0 đến 2 tại Ga Metro ĐHQG.", app.toast())
    page.select_option("#scenario", "charging_point_failures")
    report.check(s, "choosing a template fills its defaults (port failures: 1 offline, +0 %)",
                 page.input_value("#scenario-offline") == "1" and page.input_value("#scenario-demand") == "0")
    results = []
    for scenario in SCENARIOS:
        page.select_option("#scenario", scenario)
        page.click("#run-simulation")
        results.append(app.toast_ok() and "Dữ liệu thật không đổi" in app.text("#simulation-output"))
    report.check(s, "all five templates run with live data unchanged", all(results), str(results))
    app.act("load-scenario", **{"scenario-id": "SCN-001"})
    report.check(s, "a saved scenario can be loaded", app.toast() == "Đã nạp SCN-001 vào biểu mẫu." and page.input_value("#scenario") == "metro_arrival_surge", app.toast())


def scenario_simulator_reset_modes(app: App, report: Report, shots: Path | None) -> None:
    s = "S11 data simulator, reset, mode and language (AT-19, AT-20)"
    app.open(page="network")
    page = app.page
    expected = ["Telemetry: pin EB-101 còn 81%.", "Cảm biến chỗ đỗ: Ga Metro ĐHQG 5/8.", "Telemetry cổng sạc: CP-01 đang bận.", "Làm mới mạng lưới định kỳ."]
    seen = []
    for _ in expected:
        page.click("#simulate-update")
        seen.append(app.text("#last-update").split(" · ")[0])
    report.check(s, "manual updates rotate the simulated inputs", seen == expected, str(seen))
    page.click("#toggle-auto-update")
    report.check(s, "auto updates on", app.text("#toggle-auto-update") == "Tự động: bật")
    page.wait_for_function("() => document.querySelector('#last-update').textContent.startsWith('Telemetry: pin EB-101 còn 80%')", timeout=20_000)
    report.check(s, "an automatic update arrives within 15 s", app.text("#last-update").startswith("Telemetry: pin EB-101 còn 80%."))
    page.click("#toggle-auto-update")
    page.click("#reset-data")
    report.check(s, "reset restores the seed data", app.toast() == "Đã đặt lại dữ liệu mô phỏng." and app.kpi("vehicles") == "22/23", app.toast())
    page.click("#toggle-mode")
    page.select_option("#language-select", "en")
    report.check(s, "dark mode + English", page.get_attribute("html", "data-mode") == "dark" and page.get_attribute("html", "lang") == "en")
    labels = {name: page.inner_text(f'.nav-link[data-page="{name}"]').strip() for name in PAGES}
    report.check(s, "navigation = use-case names of the Submission #1 diagram", labels == UC_NAMES, str(labels))
    app.go("whatif")
    page.click("#run-simulation")
    report.check(s, "results in English", "CRITICAL BOTTLENECK" in app.text("#simulation-output") and "[Redistribute]" in app.text("#simulation-output"))
    app.shot(shots, "10_en_dark.png")


def scenario_demo_rehearsal(app: App, report: Report, shots: Path | None) -> None:
    """Replays docs/demo/DEMO_SCRIPT_8_TO_12_MIN.md on one page load, in order."""
    s = "S12 demo script replay"
    app.open()
    page = app.page

    def expect(step: str, text: str, ok: bool = True) -> None:
        report.check(s, step, app.toast() == text and app.toast_ok() == ok, app.toast())

    # 1. UC-02
    report.check(s, "1: 5 Hubs within 1 km of Ga Metro ĐHQG", page.locator("#hub-results tbody tr").count() == 5)
    page.select_option("#search-destination", "KTX-A")
    page.select_option("#vehicle-type", "e_bike")
    page.fill("#minimum-battery", "50")
    report.check(s, "1: E-Bike >= 50 % -> EB-101; parking near KTX Khu A", page.locator("#vehicle-results tbody tr").count() == 1 and "KTX Khu A" in app.text("[data-destination-hubs]"))
    page.select_option("#search-origin", "LOC-HEALTH")
    report.check(s, "1: E1 from Khoa Y", page.locator('[data-search-error="hubs_none"]').count() == 1)
    page.select_option("#search-origin", "HUB-METRO")
    page.select_option("#vehicle-type", "")
    page.fill("#minimum-battery", "0")
    # 2. UC-04
    app.select_vehicle("EM-203")
    app.open_demo("#reserve-panel")
    app.act("sim-conflict", **{"vehicle-id": "EM-203"})
    app.act("confirm-reservation")
    expect("2: E3 conflict", "EM-203 vừa được người khác đặt. Hãy chọn xe khác.", ok=False)
    app.act("choose-another")
    app.find_vehicle("HUB-METRO", "EB-101")
    app.act("confirm-reservation")
    report.check(s, "2: reservation RSV-002 confirmed", app.text("#reserve-panel [data-reservation-id]") == "RSV-002")
    app.act("pickup-vehicle", **{"vehicle-id": "EB-101"})
    expect("2: pick up", "Đã nhận EB-101 tại Ga Metro ĐHQG.")
    page.select_option("#return-hub", "HUB-LIB")
    app.act("return-vehicle", **{"vehicle-id": "EB-101"})
    expect("2: return", "Đã trả EB-101 tại Thư viện Trung tâm.")
    # 3. UC-09
    app.go("evcharge")
    page.select_option("#ev-hub", "KTX-A")
    page.click("#ev-check")
    report.check(s, "3: KTX Khu A full now -> alternatives", page.locator('[data-booking-error="slot_full"]').count() == 1)
    app.act("ev-use-slot")
    app.act("ev-confirm")
    report.check(s, "3: next slot booked", app.toast().startswith("Đã đặt lịch: 59A-123.45 tại KTX Khu A,"), app.toast())
    app.act("ev-new")
    page.select_option("#ev-hub", "HUB-METRO")
    page.select_option("#ev-date", "0")
    page.select_option("#ev-slot", index=0)
    page.fill("#ev-label", "51A-678.90")
    page.fill("#ev-battery", "15")
    page.click("#ev-check")
    app.act("ev-confirm")
    expect("3: low battery charges now", "Đã đặt lịch: 51A-678.90 đang sạc tại CP-01.")
    # 4. Manage Smart Charging
    app.go("charging")
    page.select_option("#charging-hub", "HUB-METRO")
    page.select_option("#charging-vehicle", "EB-102")
    page.click("#submit-charging")
    expect("4: shared vehicle on the second port", "EB-102 đang sạc tại CP-02.")
    app.act("finish-charging", **{"point-id": "CP-01"})
    expect("4: finish", "51A-678.90 đã sạc xong tại CP-01.")
    app.go("evcharge")
    report.check(s, "4: the student is notified (FR-PEV-5)", "51A-678.90 đã sạc xong tại Ga Metro ĐHQG" in app.text("#ev-notice"))
    # 5. Monitor, redistribute, dispatch
    app.go("network")
    report.check(s, "5: overload and shortage alerts", page.locator('#alert-list [data-alert="overload"]').count() == 1)
    app.go("redistribution")
    app.act("apply-plan")
    expect("5: task created from the plan", "Đã áp dụng: 1 lệnh điều chuyển, 0 lịch sạc, dời 0 lịch.")
    app.go("dispatch")
    app.act("start-dispatch", **{"order-id": "DSP-001"})
    app.act("complete-dispatch", **{"order-id": "DSP-001"})
    expect("5: task completed", "EM-208 đã đến Nhà Văn hóa Sinh viên (DSP-001).")
    # 6. UC-15
    app.go("incidents")
    page.select_option("#incident-charging-point", "CP-02")
    page.click("#report-charging-failure")
    page.select_option("#incident-type", "charging_point_power")
    page.select_option("#incident-severity", "high")
    app.act("classify-incident")
    app.act("assign-maintenance")
    expect("6: assigned", "Đã giao INC-001 cho MAINT-DEMO (MT-001).")
    app.go("charging")
    report.check(s, "6: EB-102 moved from the failed port to CP-01", "EB-102" in app.text('#points-table tr[data-point-id="CP-01"]'))
    app.go("maintenance")
    app.act("start-maintenance", **{"task-id": "MT-001"})
    app.act("complete-maintenance", **{"task-id": "MT-001"})
    expect("6: repaired and restored", "CP-02 đã hoạt động trở lại.")
    # 7. UC-17
    app.go("whatif")
    page.click("#run-simulation")
    report.check(s, "7: Metro surge -> critical", page.locator('#simulation-output [data-hub-id="HUB-METRO"][data-impact="critical"]').count() == 1)
    app.act("save-scenario")
    app.act("apply-recommendations")
    report.check(s, "7: recommendations applied", app.toast().startswith("Đã áp dụng:"), app.toast())
    # 8. Simulator and interface
    page.click("#simulate-update")
    report.check(s, "8: simulated update", app.text("#last-update").startswith("Telemetry: pin"))
    page.select_option("#language-select", "en")
    report.check(s, "8: English", app.text("#page-title") == "Run What-if Simulation")


def scenario_mobile(browser, base: str, report: Report, shots: Path | None, problems: list[str]) -> None:
    s = "S13 narrow viewport"
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    watch(page, problems)
    app = App(page, base)
    for name in ("find", "reserve", "evcharge", "network", "charging", "incidents", "whatif"):
        app.open(page=name)
        overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        report.check(s, f"no horizontal page overflow at 390 px ({name})", overflow <= 0, f"overflow {overflow}px")
    app.open()
    app.shot(shots, "11_mobile.png")
    context.close()


def watch(page, problems: list[str]) -> None:
    page.on("console", lambda message: problems.append(f"console {message.type}: {message.text}") if message.type in ("error", "warning") else None)
    page.on("pageerror", lambda error: problems.append(f"page error: {error}"))
    page.on("requestfailed", lambda request: problems.append(f"request failed: {request.url}"))
    page.on("response", lambda response: problems.append(f"HTTP {response.status}: {response.url}") if response.status >= 400 else None)


def launch(playwright, preferred: str, headed: bool):
    order = [preferred] + [name for name in ("chrome", "msedge", "chromium") if name != preferred]
    for name in order:
        try:
            return name, playwright.chromium.launch(channel=None if name == "chromium" else name, headless=not headed)
        except Exception:  # noqa: BLE001 - try the next installed browser
            continue
    raise SystemExit("No Chromium-based browser found. Install Chrome/Edge or run: python -m playwright install chromium")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--browser", default="chrome", choices=["chrome", "msedge", "chromium"])
    parser.add_argument("--headed", action="store_true", help="show the browser window")
    parser.add_argument("--screenshots", default=str(ROOT / "docs" / "demo" / "screenshots"))
    parser.add_argument("--no-screenshots", action="store_true")
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Playwright is not installed: pip install playwright", file=sys.stderr)
        return 2

    shots = None if args.no_screenshots else Path(args.screenshots)
    if shots:
        shots.mkdir(parents=True, exist_ok=True)

    report = Report()
    problems: list[str] = []
    with static_server() as base, sync_playwright() as playwright:
        print(f"Serving {ROOT.name} at {base}", flush=True)
        http_smoke(report, base)
        name, browser = launch(playwright, args.browser, args.headed)
        print(f"Browser: {name} {browser.version}", flush=True)
        context = browser.new_context(viewport={"width": 1366, "height": 860})
        page = context.new_page()
        watch(page, problems)
        app = App(page, base)
        for scenario in (scenario_find, scenario_reserve, scenario_reserve_exceptions, scenario_parking, scenario_ev_booking,
                         scenario_smart_charging, scenario_network, scenario_redistribution, scenario_incidents, scenario_what_if,
                         scenario_simulator_reset_modes, scenario_demo_rehearsal):
            try:
                scenario(app, report, shots)
            except Exception as error:  # noqa: BLE001 - a crash in one scenario is a failed check, not a stopped run
                report.check(scenario.__name__, "scenario completed without an exception", False, repr(error)[:300])
        context.close()
        scenario_mobile(browser, base, report, shots, problems)
        browser.close()

    report.check("Console/network", "no console errors/warnings, page errors or failed requests", not problems, "; ".join(problems[:5]))
    total = len(report.results)
    print(f"\nSUMMARY: {total - report.failed} PASS / {report.failed} FAIL / {total} checks")
    return 0 if report.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
