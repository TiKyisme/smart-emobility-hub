#!/usr/bin/env python3
"""Browser acceptance run for the Smart E-Mobility Hub MVP (demo paths of AT-01..AT-20).

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
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = ["metro_arrival_surge", "hub_full", "charging_demand_surge", "charging_point_failures", "vehicle_concentration"]


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


class App:
    def __init__(self, page, base: str) -> None:
        self.page = page
        self.base = base

    def open(self, query: str = "", page: str = "find") -> None:
        # Leave the document first: a URL that differs only in its #hash would not reload the
        # page, and every scenario must start from the seed data.
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

    def tile(self, hub_id: str) -> str:
        return self.text(f'#hub-tiles [data-hub-id="{hub_id}"]')

    def trip_state(self) -> str | None:
        locator = self.page.locator("#my-trip [data-trip-state]")
        return locator.get_attribute("data-trip-state") if locator.count() else None

    def act(self, action: str, **data: str) -> None:
        selector = f'[data-action="{action}"]' + "".join(f'[data-{key}="{value}"]' for key, value in data.items())
        self.page.locator(selector).first.click()

    def reserve(self, vehicle_id: str) -> None:
        self.act("reserve-vehicle", **{"vehicle-id": vehicle_id})

    def return_to(self, hub_id: str) -> None:
        self.page.select_option("#return-hub", hub_id)
        self.page.locator('[data-action="return-vehicle"]').click()

    def fleet_status(self, vehicle_id: str) -> str:
        return self.text(f'#fleet-table tr[data-vehicle-id="{vehicle_id}"] [data-status]')

    def submit_shared(self, hub_id: str, vehicle_id: str) -> None:
        self.page.click('[data-charging-type="shared"]')
        self.page.select_option("#charging-hub", hub_id)
        self.page.select_option("#charging-vehicle", vehicle_id)
        self.page.click("#submit-charging")

    def submit_private(self, hub_id: str, label: str, battery: str, soon: bool = False) -> None:
        self.page.click('[data-charging-type="private"]')
        self.page.select_option("#charging-hub", hub_id)
        self.page.fill("#private-vehicle-label", label)
        self.page.fill("#charging-battery", battery)
        self.page.set_checked("#upcoming-usage", soon)
        self.page.click("#submit-charging")

    def shot(self, directory: Path | None, name: str) -> None:
        if directory is None:
            return
        self.close_toast()
        self.page.evaluate("window.scrollTo(0, 0)")
        self.page.screenshot(path=str(directory / name))


def scenario_discover(app: App, report: Report, shots: Path | None) -> None:
    s = "S1 discover (AT-01..03)"
    app.open()
    report.check(s, "Vietnamese interface by default (D-011)", app.page.get_attribute("html", "lang") == "vi" and app.text("#page-title") == "Tìm & đặt xe")
    report.check(s, "four Hub tiles; Metro 4/8 parking", app.page.locator("#hub-tiles .tile").count() == 4 and "4/8" in app.tile("H-METRO"), app.tile("H-METRO"))
    rows = app.page.locator("#search-results tbody tr")
    report.check(s, "available vehicles listed with battery and status", rows.count() == 5 and "82%" in app.text('#search-results tr[data-vehicle-id="EV-01"]'))
    app.page.uncheck("#only-available")
    report.check(s, "all six vehicles with statuses when 'available only' is off", rows.count() == 6 and "Đang sạc" in app.text('#search-results tr[data-vehicle-id="EV-04"]'))
    app.page.check("#only-available")
    app.page.select_option("#vehicle-search-hub", "H-METRO")
    app.page.fill("#minimum-battery", "80")
    report.check(s, "Metro + battery >= 80% finds EV-01 only", rows.count() == 1 and rows.first.get_attribute("data-vehicle-id") == "EV-01")
    app.page.select_option("#vehicle-search-hub", "")
    app.page.fill("#minimum-battery", "0")
    app.page.check("#charging-required")
    dimmed = app.page.locator("#hub-tiles .tile.is-dimmed").all()
    report.check(s, "Hub filter 'free charger' dims Dormitory (no free charger)", len(dimmed) == 1 and dimmed[0].get_attribute("data-hub-id") == "H-DORM")
    app.page.uncheck("#charging-required")


def scenario_trip(app: App, report: Report, shots: Path | None) -> None:
    s = "S2 reserve-pickup-return (AT-04,06,07)"
    app.open()
    report.check(s, "hold time shown as 15 minutes", app.text("#hold-duration") == "Thời gian giữ xe: 15 phút.", app.text("#hold-duration"))
    app.reserve("EV-01")
    report.check(s, "reserve feedback with expiry time", app.toast().startswith("Đã giữ EV-01 đến") and app.toast_ok(), app.toast())
    countdown = app.text("#my-trip [data-countdown]")
    report.check(s, "trip card shows the hold and a live countdown", app.trip_state() == "active" and countdown in ("15:00", "14:59", "14:58"), countdown)
    report.check(s, "D-014: other Reserve buttons disabled during a trip", app.page.locator('#search-results [data-action="reserve-vehicle"]:disabled').count() >= 3)
    app.shot(shots, "01_find_trip.png")
    app.act("pickup-vehicle", **{"vehicle-id": "EV-01"})
    report.check(s, "pickup feedback; Metro 3/8", app.toast() == "Đã nhận EV-01 tại Metro Hub." and "3/8" in app.tile("H-METRO"), app.toast())
    app.page.select_option("#return-hub", "H-DORM")
    app.page.click("#simulate-update")
    kept = app.page.input_value("#return-hub")
    report.check(s, "REGRESSION: chosen return Hub survives a re-render", kept == "H-DORM", kept)
    app.page.locator('[data-action="return-vehicle"]').click()
    report.check(s, "return feedback; Dormitory 8/10", app.toast() == "Đã trả EV-01 tại Dormitory Hub." and "8/10" in app.tile("H-DORM"), app.toast())
    report.check(s, "trip closed; last trip shown as completed", app.trip_state() is None and "Hoàn tất" in app.text("#my-trip [data-last-trip]"))


def scenario_expiry_and_cancel(app: App, report: Report, shots: Path | None) -> None:
    s = "S3 hold expiry and cancel (AT-04 alt.)"
    app.open("?holdSeconds=10")
    report.check(s, "demo hold time visible", app.text("#hold-duration") == "Thời gian giữ xe: 10 giây (thiết lập demo).", app.text("#hold-duration"))
    app.reserve("EV-01")
    app.page.wait_for_function("() => !document.querySelector('#my-trip [data-trip-state]')", timeout=20_000)
    report.check(s, "hold expires by itself with feedback", app.toast() == "Hết thời gian giữ: EV-01 đã sẵn sàng trở lại." and not app.toast_ok(), app.toast())
    report.check(s, "last trip shown as expired; EV-01 reservable again", "Hết hạn" in app.text("[data-last-trip]") and app.page.locator('#search-results [data-vehicle-id="EV-01"] [data-action]').is_enabled())
    app.reserve("EV-02")
    app.act("cancel-hold", **{"vehicle-id": "EV-02"})
    report.check(s, "hold cancelled before pickup (UC-04 A1)", app.toast() == "Đã hủy giữ EV-02." and app.trip_state() is None, app.toast())
    app.open("?holdSeconds=5")
    report.check(s, "out-of-range holdSeconds ignored", app.text("#hold-duration") == "Thời gian giữ xe: 15 phút.", app.text("#hold-duration"))


def scenario_capacity(app: App, report: Report, shots: Path | None) -> None:
    s = "S4 parking capacity (AT-05,07,12)"
    app.open()
    app.reserve("EV-01")
    app.act("pickup-vehicle", **{"vehicle-id": "EV-01"})
    app.go("services")
    app.page.select_option("#parking-hub", "H-DORM")
    messages = []
    for _ in range(3):
        app.page.click("#reserve-parking")
        messages.append(app.toast())
    report.check(s, "three spaces held at Dormitory", messages[-1] == "Đã giữ chỗ tại Dormitory Hub; còn 0 chỗ.", " / ".join(messages))
    app.page.click("#reserve-parking")
    report.check(s, "fourth hold refused", app.toast() == "Dormitory Hub đã hết chỗ đỗ." and not app.toast_ok(), app.toast())
    app.go("find")
    report.check(s, "return list marks Dormitory as full", "Dormitory Hub · hết chỗ" in app.page.locator("#return-hub").inner_text())
    app.return_to("H-DORM")
    report.check(s, "return to the full Dormitory refused", app.toast() == "Dormitory Hub đã hết chỗ; hãy chọn Hub khác." and app.trip_state() == "in_use", app.toast())
    app.go("network")
    first = app.page.locator("#network-table tbody tr").first
    report.check(s, "Dormitory ranked #1 and flagged full", first.get_attribute("data-hub-id") == "H-DORM" and "Hết chỗ" in first.inner_text(), first.inner_text())
    app.go("services")
    app.page.locator('[data-action="cancel-parking"]').first.click()
    report.check(s, "a parking hold can be released", app.toast() == "Đã hủy giữ chỗ tại Dormitory Hub.", app.toast())
    app.go("find")
    app.return_to("H-CAMPUS")
    report.check(s, "return to University succeeds", app.toast() == "Đã trả EV-01 tại University Hub.", app.toast())


def scenario_charging(app: App, report: Report, shots: Path | None) -> None:
    s = "S5 charging priority (AT-08,09,15)"
    app.open(page="services")
    app.page.select_option("#charging-hub", "H-METRO")
    options = app.page.locator("#charging-vehicle option").all_inner_texts()
    report.check(s, "only eligible vehicles are offered", options == ["EV-01 · 82%", "EV-02 · 28%"], str(options))
    app.submit_shared("H-METRO", "EV-02")
    report.check(s, "free charger assigned immediately", app.toast() == "EV-02 đang sạc tại CP-01.", app.toast())
    report.check(s, "EV-02 no longer offered", app.page.locator("#charging-vehicle option").all_inner_texts() == ["EV-01 · 82%"])
    app.submit_private("H-METRO", "51A-111.11", "")
    report.check(s, "empty private battery refused", app.toast() == "Mức pin phải từ 0 đến 100." and not app.toast_ok(), app.toast())
    app.submit_private("H-METRO", "51A-111.11", "35")
    report.check(s, "private EV holds a space and charges", app.toast() == "Đã giữ chỗ tại Metro Hub; 51A-111.11 đang sạc tại CP-02.", app.toast())
    app.submit_shared("H-METRO", "EV-01")
    report.check(s, "no charger left: EV-01 waits #1", app.toast() == "EV-01 đang chờ sạc tại Metro Hub (#1).", app.toast())
    app.submit_private("H-METRO", "51B-222.22", "10", soon=True)
    report.check(s, "urgent private EV jumps to #1", app.toast() == "Đã giữ chỗ tại Metro Hub; 51B-222.22 đang chờ sạc (#1).", app.toast())
    my_rows = app.text("#my-charging")
    report.check(s, "my requests show charging/waiting states", "Đang sạc · CP-01" in my_rows and "Đang chờ · #2" in my_rows, my_rows.replace("\n", " / "))
    app.shot(shots, "02_services_charging.png")
    app.go("charging")
    order = app.page.locator("#charging-queue tbody tr").evaluate_all("rows => rows.map(r => r.dataset.requestId)")
    labels = [app.text(f'#charging-queue tr[data-request-id="{rid}"] strong') for rid in order]
    report.check(s, "priority queue: needed-soon low battery first", labels == ["51B-222.22", "EV-01"], str(labels))
    app.act("finish-charging", **{"point-id": "CP-01"})
    report.check(s, "finishing CP-01 hands it to the top request", app.toast() == "EV-02 đã sạc xong; 51B-222.22 được chuyển vào CP-01.", app.toast())
    app.shot(shots, "04_smart_charging.png")
    app.go("network")
    report.check(s, "EV-02 charged to 100% and available", "100%" in app.text('#fleet-table tr[data-vehicle-id="EV-02"]') and app.fleet_status("EV-02") == "Sẵn sàng")
    app.go("services")
    app.act("cancel-charging", **{"request-id": "CHG-004"})
    report.check(s, "a waiting request can be cancelled", app.toast() == "Đã hủy yêu cầu sạc của EV-01.", app.toast())


def scenario_charging_guard(app: App, report: Report, shots: Path | None) -> None:
    s = "S5b charging guard (D-009)"
    app.open(page="services")
    app.submit_shared("H-METRO", "EV-02")
    app.submit_private("H-METRO", "51A-111.11", "35")
    app.submit_shared("H-METRO", "EV-01")
    app.go("find")
    app.reserve("EV-01")
    app.go("charging")
    report.check(s, "waiting request of a reserved vehicle is on hold", "Tạm hoãn: xe đang được giữ" in app.text("#charging-queue"), app.text("#charging-queue"))
    app.act("finish-charging", **{"point-id": "CP-01"})
    report.check(s, "freed charger is not given to the reserved vehicle", app.toast() == "EV-02 đã sạc xong tại CP-01." and "Sẵn sàng" in app.text('#points-table tr[data-point-id="CP-01"]'), app.toast())


def scenario_operator(app: App, report: Report, shots: Path | None) -> None:
    s = "S6 operator and incidents (AT-10,11,13,14)"
    app.open(page="network")
    metrics = {m: app.text(f'#operator-metrics [data-metric="{m}"] strong') for m in ("hubs", "vehicles", "points", "incidents", "queue")}
    report.check(s, "network KPIs", metrics == {"hubs": "4", "vehicles": "5/6", "points": "4/5", "incidents": "0", "queue": "0"}, str(metrics))
    report.check(s, "redistribution Dormitory → University", "Dormitory Hub" in app.text("#redistribution-panel") and "University Hub" in app.text("#redistribution-panel"))
    app.shot(shots, "03_network.png")
    app.act("coordinate-redistribution")
    report.check(s, "coordination moves EV-03", app.toast() == "Đã điều phối EV-03 từ Dormitory Hub đến University Hub.", app.toast())
    app.go("incidents")
    app.page.select_option("#incident-vehicle", "EV-02")
    app.page.click("#report-vehicle-failure")
    report.check(s, "vehicle failure recorded as INC-001", app.toast() == "Đã báo hỏng EV-02 (INC-001).", app.toast())
    app.page.select_option("#incident-charging-point", "CP-01")
    app.page.click("#report-charging-failure")
    report.check(s, "charger outage recorded as INC-002", app.toast() == "Đã báo CP-01 ngừng hoạt động (INC-002).", app.toast())
    report.check(s, "both incidents open", app.text("#incident-summary") == "2 đang mở · 0 đã xử lý" and app.page.locator('#incident-list [data-status="open"]').count() == 2)
    report.check(s, "reported resources leave the report lists", "EV-02" not in app.page.locator("#incident-vehicle").inner_text() and "CP-01" not in app.page.locator("#incident-charging-point").inner_text())
    app.act("resolve-incident", **{"incident-id": "INC-001"})
    report.check(s, "repair returns EV-02 to service", app.toast() == "EV-02 đã sửa xong, sẵn sàng tại Metro Hub.", app.toast())
    app.act("resolve-incident", **{"incident-id": "INC-002"})
    report.check(s, "restore returns CP-01 to service", app.toast() == "CP-01 đã hoạt động trở lại.", app.toast())
    report.check(s, "incident log shows both resolved", app.text("#incident-summary") == "0 đang mở · 2 đã xử lý" and app.page.locator('#incident-list [data-status="resolved"]').count() == 2)
    app.shot(shots, "05_incidents.png")
    app.go("network")
    report.check(s, "fleet and KPIs back to normal", app.fleet_status("EV-02") == "Sẵn sàng" and app.text('#operator-metrics [data-metric="incidents"] strong') == "0")


def scenario_what_if(app: App, report: Report, shots: Path | None) -> None:
    s = "S7 what-if x5 (AT-16..18)"
    app.open(page="network")
    live_table = app.text("#network-table")
    app.go("whatif")
    for scenario in SCENARIOS:
        app.page.select_option("#scenario", scenario)
        app.page.select_option("#scenario-hub", "H-METRO")
        app.page.click("#run-simulation")
        output = app.text("#simulation-output")
        report.check(s, f"{scenario}: impact + recommendation, live data unchanged",
                     "Dữ liệu thật không đổi" in output and app.page.locator("#simulation-output .recommendations li").count() >= 1
                     and app.toast() == "Đã chạy mô phỏng. Dữ liệu thật không đổi.", output.replace("\n", " / ")[:240])
        if scenario == "hub_full":
            app.shot(shots, "06_whatif.png")
    app.go("network")
    report.check(s, "network table identical after five simulations", app.text("#network-table") == live_table)


def scenario_simulator_reset_modes(app: App, report: Report, shots: Path | None) -> None:
    s = "S8 simulator (AT-19)"
    app.open()
    expected = ["Telemetry: pin EV-01 còn 81%.", "Cảm biến chỗ đỗ: Metro Hub 5/8.", "Telemetry trụ: CP-01 đang bận.", "Làm mới mạng lưới định kỳ."]
    for index, message in enumerate(expected, start=1):
        app.page.click("#simulate-update")
        report.check(s, f"manual update {index} visible immediately", app.text("#last-update").startswith(message), app.text("#last-update"))
    app.page.click("#toggle-auto-update")
    report.check(s, "auto updates on", app.text("#toggle-auto-update") == "Tự động: bật" and app.toast() == "Đã bật cập nhật tự động: mỗi 15 giây.", app.toast())
    before = app.text("#last-update")
    try:
        app.page.wait_for_function(f"() => document.querySelector('#last-update').innerText.trim() !== {before!r}", timeout=20_000)
        arrived = True
    except Exception:  # noqa: BLE001 - reported as a failed check
        arrived = False
    report.check(s, "an automatic update arrives within 20 s", arrived, app.text("#last-update"))
    app.page.click("#toggle-auto-update")
    report.check(s, "auto updates off", app.text("#toggle-auto-update") == "Tự động: tắt" and app.toast() == "Đã tắt cập nhật tự động.", app.toast())

    r = "S9 reset data (D-018)"
    app.reserve("EV-01")
    app.page.click("#reset-data")
    report.check(r, "reset restores the seed data", app.toast() == "Đã đặt lại dữ liệu mô phỏng." and app.trip_state() is None and "4/8" in app.tile("H-METRO") and app.text("#last-update").startswith("Đã nạp dữ liệu ban đầu."), app.toast())

    m = "S10 interface mode (AT-20)"
    app.page.click("#toggle-mode")
    background = app.page.evaluate("getComputedStyle(document.body).backgroundColor")
    report.check(m, "dark mode applied", app.page.get_attribute("html", "data-mode") == "dark" and background == "rgb(15, 22, 29)", background)
    app.page.select_option("#language-select", "en")
    report.check(m, "English interface applied", app.page.get_attribute("html", "lang") == "en" and app.text("#page-title") == "Find & reserve" and app.text(".nav-link[data-page='incidents']") == "Incidents")
    app.reserve("EV-01")
    report.check(m, "service feedback in English", app.toast().startswith("EV-01 reserved until"), app.toast())
    app.page.select_option("#language-select", "vi")
    report.check(m, "back to Vietnamese re-translates feedback and keeps state", app.toast().startswith("Đã giữ EV-01 đến") and app.trip_state() == "active", app.toast())
    app.page.select_option("#language-select", "en")
    app.shot(shots, "07_en_dark.png")
    app.page.select_option("#language-select", "vi")
    app.page.click("#toggle-mode")
    report.check(m, "light mode restored", app.page.get_attribute("html", "data-mode") == "light")


def scenario_demo_rehearsal(app: App, report: Report, shots: Path | None) -> None:
    """Replays docs/demo/DEMO_SCRIPT_8_TO_12_MIN.md on ONE page load, as presented live."""
    s = "S11 demo script rehearsal"
    expect = lambda step, text: report.check(s, step, app.toast() == text, app.toast())  # noqa: E731
    page = app.page
    app.open()

    page.select_option("#vehicle-search-hub", "H-METRO")
    page.fill("#minimum-battery", "80")
    report.check(s, "1: Metro >= 80% finds EV-01", page.locator("#search-results tbody tr").count() == 1)
    page.select_option("#vehicle-search-hub", "")
    page.fill("#minimum-battery", "0")

    app.reserve("EV-01")
    report.check(s, "2: reserve EV-01", app.toast().startswith("Đã giữ EV-01 đến"), app.toast())
    app.act("pickup-vehicle", **{"vehicle-id": "EV-01"})
    expect("2: pick up EV-01", "Đã nhận EV-01 tại Metro Hub.")
    app.return_to("H-DORM")
    expect("2: return EV-01 to Dormitory", "Đã trả EV-01 tại Dormitory Hub.")

    app.reserve("EV-05")
    app.act("pickup-vehicle", **{"vehicle-id": "EV-05"})
    expect("4: pick up EV-05", "Đã nhận EV-05 tại University Hub.")
    app.go("services")
    page.select_option("#parking-hub", "H-DORM")
    page.click("#reserve-parking")
    expect("4: hold 1 at Dormitory", "Đã giữ chỗ tại Dormitory Hub; còn 1 chỗ.")
    page.click("#reserve-parking")
    expect("4: hold 2 at Dormitory", "Đã giữ chỗ tại Dormitory Hub; còn 0 chỗ.")
    page.click("#reserve-parking")
    expect("4: hold 3 refused", "Dormitory Hub đã hết chỗ đỗ.")
    app.go("find")
    app.return_to("H-DORM")
    expect("4: return to full Dormitory refused", "Dormitory Hub đã hết chỗ; hãy chọn Hub khác.")
    app.go("network")
    report.check(s, "4: Dormitory #1 full", "Hết chỗ" in app.text('#network-table tr[data-hub-id="H-DORM"]'))
    app.go("find")
    app.return_to("H-CAMPUS")
    expect("4: return EV-05 to University", "Đã trả EV-05 tại University Hub.")

    app.go("services")
    app.submit_shared("H-METRO", "EV-02")
    expect("5: EV-02 charges at once", "EV-02 đang sạc tại CP-01.")
    app.submit_private("H-METRO", "51A-111.11", "35")
    expect("5: private EV charges", "Đã giữ chỗ tại Metro Hub; 51A-111.11 đang sạc tại CP-02.")
    app.submit_private("H-METRO", "51B-222.22", "60")
    expect("5: second private EV waits", "Đã giữ chỗ tại Metro Hub; 51B-222.22 đang chờ sạc (#1).")
    app.submit_private("H-METRO", "51C-333.33", "10", soon=True)
    expect("5: urgent EV jumps ahead", "Đã giữ chỗ tại Metro Hub; 51C-333.33 đang chờ sạc (#1).")
    app.go("charging")
    app.act("finish-charging", **{"point-id": "CP-01"})
    expect("5: finished point goes to the urgent EV", "EV-02 đã sạc xong; 51C-333.33 được chuyển vào CP-01.")

    app.go("network")
    app.act("coordinate-redistribution")
    expect("6: coordinate redistribution", "Đã điều phối EV-01 từ Dormitory Hub đến University Hub.")
    app.go("incidents")
    page.select_option("#incident-charging-point", "CP-02")
    page.click("#report-charging-failure")
    expect("6: CP-02 outage", "Đã báo CP-02 ngừng hoạt động (INC-001).")
    page.select_option("#incident-vehicle", "EV-03")
    page.click("#report-vehicle-failure")
    expect("6: EV-03 failure", "Đã báo hỏng EV-03 (INC-002).")
    app.act("resolve-incident", **{"incident-id": "INC-001"})
    expect("6: restore CP-02, next EV starts", "CP-02 hoạt động trở lại; 51A-111.11 được chuyển vào sạc.")
    app.act("resolve-incident", **{"incident-id": "INC-002"})
    expect("6: EV-03 repaired", "EV-03 đã sửa xong, sẵn sàng tại Dormitory Hub.")

    app.go("whatif")
    for scenario in ("hub_full", "charging_demand_surge"):
        page.select_option("#scenario", scenario)
        page.select_option("#scenario-hub", "H-METRO")
        page.click("#run-simulation")
        report.check(s, f"7: what-if {scenario}", "Dữ liệu thật không đổi" in app.text("#simulation-output"))

    page.click("#simulate-update")
    report.check(s, "8: simulated update", app.text("#last-update").startswith("Telemetry: pin EV-01 còn 81%."), app.text("#last-update"))
    page.click("#toggle-mode")
    page.select_option("#language-select", "en")
    report.check(s, "8: dark + English", page.get_attribute("html", "data-mode") == "dark" and app.text("#page-title") == "What-if simulation")


def scenario_mobile(browser, base: str, report: Report, shots: Path | None, problems: list[str]) -> None:
    s = "S12 narrow viewport"
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    watch(page, problems)
    app = App(page, base)
    for name in ("find", "services", "network", "incidents"):
        app.open(page=name)
        overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        report.check(s, f"no horizontal page overflow at 390 px ({name})", overflow <= 0, f"overflow {overflow}px")
    app.open()
    app.shot(shots, "08_mobile.png")
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
        for scenario in (scenario_discover, scenario_trip, scenario_expiry_and_cancel, scenario_capacity, scenario_charging,
                         scenario_charging_guard, scenario_operator, scenario_what_if, scenario_simulator_reset_modes,
                         scenario_demo_rehearsal):
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
