#!/usr/bin/env python3
"""Browser acceptance run for the Smart E-Mobility Hub MVP (demo paths of AT-01..AT-20).

Starts `python -m http.server` on a free loopback port from the repository root, drives the
real page in an installed Chrome or Edge through Playwright, and prints PASS/FAIL per check.

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
SCENARIOS = [
    "metro_arrival_surge",
    "hub_full",
    "charging_demand_surge",
    "charging_point_failures",
    "vehicle_concentration",
]


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
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
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

    def open(self, query: str = "") -> None:
        self.page.goto(f"{self.base}/{query}", wait_until="networkidle")
        self.page.wait_for_selector("#hub-grid .hub-card")

    def text(self, selector: str) -> str:
        return self.page.inner_text(selector).strip()

    def feedback(self) -> str:
        return self.text("#feedback")

    def feedback_ok(self) -> bool:
        return "feedback-success" in (self.page.get_attribute("#feedback", "class") or "")

    def row(self, vehicle_id: str):
        return self.page.locator(f'#vehicle-rows tr[data-vehicle-id="{vehicle_id}"]')

    def cell(self, vehicle_id: str, index: int) -> str:
        return self.row(vehicle_id).locator("td").nth(index).inner_text().strip()

    def status(self, vehicle_id: str) -> str:
        return self.cell(vehicle_id, 3)

    def hub_card(self, hub_id: str) -> str:
        return self.text(f'#hub-grid [data-hub-id="{hub_id}"]')

    def click_action(self, vehicle_id: str, action: str) -> None:
        self.row(vehicle_id).locator(f'button[data-action="{action}"]').click()

    def reserve_and_pick_up(self, vehicle_id: str) -> None:
        self.click_action(vehicle_id, "reserve-vehicle")
        self.click_action(vehicle_id, "pickup-vehicle")

    def return_to(self, vehicle_id: str, hub_id: str) -> None:
        self.row(vehicle_id).locator("select").select_option(hub_id)
        self.click_action(vehicle_id, "return-vehicle")

    def shot(self, directory: Path | None, name: str, selector: str | None = None) -> None:
        if directory is None:
            return
        target = directory / name
        if selector:
            self.page.locator(selector).screenshot(path=str(target))
        else:
            self.page.screenshot(path=str(target))


def scenario_discover(app: App, report: Report, shots: Path | None) -> None:
    s = "S1 discover (AT-01..03)"
    app.open()
    report.check(s, "four Hub cards rendered", app.page.locator("#hub-grid .hub-card").count() == 4)
    report.check(s, "Metro card shows 4/8 occupied", "4/8 occupied" in app.hub_card("H-METRO"), app.hub_card("H-METRO"))
    report.check(s, "vehicle table lists six vehicles with battery and status", app.page.locator("#vehicle-rows tr").count() == 6 and app.cell("EV-01", 2) == "82%")
    app.page.select_option("#vehicle-search-hub", "H-METRO")
    app.page.fill("#minimum-battery", "80")
    results = app.page.locator("#search-results .result-row")
    report.check(s, "search Metro + battery >= 80 returns only EV-01", results.count() == 1 and results.first.get_attribute("data-vehicle-id") == "EV-01")
    app.page.fill("#minimum-battery", "0")
    app.page.select_option("#vehicle-search-hub", "")
    app.shot(shots, "01_overview_en_light.png")


def scenario_lifecycle(app: App, report: Report, shots: Path | None) -> None:
    s = "S2 reserve-pickup-return (AT-04,06,07)"
    app.open()
    report.check(s, "default hold duration shown as 15 minutes", app.text("#hold-duration") == "Hold duration: 15 minutes.", app.text("#hold-duration"))
    app.click_action("EV-01", "reserve-vehicle")
    report.check(s, "reserve feedback names vehicle, student and expiry", app.feedback().startswith("EV-01 reserved for STUDENT-DEMO until") and app.feedback_ok(), app.feedback())
    report.check(s, "EV-01 becomes Reserved with an Active hold", app.status("EV-01") == "Reserved" and app.cell("EV-01", 4).startswith("Active"), app.cell("EV-01", 4))
    app.click_action("EV-01", "pickup-vehicle")
    report.check(s, "pickup feedback and In use status", app.feedback().startswith("EV-01 picked up from Metro Hub") and app.status("EV-01") == "In use", app.feedback())
    report.check(s, "Metro physical occupancy 4 -> 3 after pickup", "3/8 occupied" in app.hub_card("H-METRO"), app.hub_card("H-METRO"))
    app.row("EV-01").locator("select").select_option("H-DORM")
    app.page.click("#simulate-update")
    kept = app.row("EV-01").locator("select").input_value()
    report.check(s, "REGRESSION: chosen return Hub survives a re-render", kept == "H-DORM", f"select value after re-render: {kept}")
    app.shot(shots, "02_vehicle_lifecycle.png", "#vehicle-rows")
    app.click_action("EV-01", "return-vehicle")
    report.check(s, "return feedback names destination", app.feedback() == "EV-01 returned to Dormitory Hub; the reservation is completed.", app.feedback())
    report.check(s, "EV-01 Available at Dormitory, reservation Completed", app.status("EV-01") == "Available" and app.cell("EV-01", 1) == "Dormitory Hub" and app.cell("EV-01", 4).startswith("Completed"), app.cell("EV-01", 4))
    report.check(s, "Dormitory physical occupancy 7 -> 8 after return", "8/10 occupied" in app.hub_card("H-DORM"), app.hub_card("H-DORM"))


def scenario_expiry(app: App, report: Report, shots: Path | None) -> None:
    s = "S3 hold expiry (AT-04 alt.)"
    app.open("?holdSeconds=10")
    report.check(s, "demo hold duration is visible", "10 seconds (demo setting" in app.text("#hold-duration"), app.text("#hold-duration"))
    app.click_action("EV-01", "reserve-vehicle")
    report.check(s, "EV-01 reserved", app.status("EV-01") == "Reserved")
    app.page.wait_for_function(
        "() => document.querySelector('#vehicle-rows tr[data-vehicle-id=\"EV-01\"] td:nth-child(4)').innerText.trim() === 'Available'",
        timeout=20_000,
    )
    report.check(s, "after expiry EV-01 is Available and the hold shows Expired", app.status("EV-01") == "Available" and app.cell("EV-01", 4).startswith("Expired"), app.cell("EV-01", 4))
    report.check(s, "expiry feedback is shown without user action", app.feedback() == "Reservation hold expired before pickup: EV-01 is available again.", app.feedback())
    app.open("?holdSeconds=5")
    report.check(s, "out-of-range holdSeconds is ignored (default 15 minutes)", app.text("#hold-duration") == "Hold duration: 15 minutes.", app.text("#hold-duration"))


def scenario_capacity(app: App, report: Report, shots: Path | None) -> None:
    s = "S4 parking capacity (AT-05,07,12)"
    app.open()
    app.reserve_and_pick_up("EV-01")
    app.page.select_option("#parking-hub", "H-DORM")
    messages = []
    for _ in range(3):
        app.page.click("#reserve-parking")
        messages.append(app.feedback())
    report.check(s, "three parking holds accepted at Dormitory", messages[-1] == "Parking space reserved at Dormitory Hub; 0 spaces left.", " / ".join(messages))
    app.page.click("#reserve-parking")
    report.check(s, "fourth parking hold rejected", app.feedback() == "No parking capacity available at Dormitory Hub." and not app.feedback_ok(), app.feedback())
    app.return_to("EV-01", "H-DORM")
    report.check(s, "return to the full Dormitory is refused", app.feedback() == "Dormitory Hub has no free parking space; choose another Hub." and app.status("EV-01") == "In use", app.feedback())
    first = app.page.locator("#operator-hub-rows tr").first
    report.check(s, "Dormitory ranked #1 and flagged at capacity", first.get_attribute("data-hub-id") == "H-DORM" and "at capacity" in first.inner_text(), first.inner_text())
    app.shot(shots, "04_capacity_risk.png", "#operator-hub-rows")
    app.return_to("EV-01", "H-CAMPUS")
    report.check(s, "return to University succeeds", app.feedback().startswith("EV-01 returned to University Hub") and app.cell("EV-01", 1) == "University Hub", app.feedback())


def scenario_charging(app: App, report: Report, shots: Path | None) -> None:
    s = "S5 charging priority (AT-08,09,15)"
    app.open()
    app.page.select_option("#charging-hub", "H-METRO")
    app.page.select_option("#charging-vehicle", "EV-01")
    battery = app.page.locator("#charging-battery")
    report.check(s, "shared request uses the recorded battery (field locked to 82)", battery.is_disabled() and battery.input_value() == "82", battery.input_value())
    app.page.click("#submit-charging")
    report.check(s, "EV-01 queued", app.feedback() == "Charging request for EV-01 added to the queue at Metro Hub.", app.feedback())
    app.page.click("#submit-charging")
    report.check(s, "duplicate request for EV-01 rejected", app.feedback() == "EV-01 already has a charging request in the queue." and not app.feedback_ok(), app.feedback())
    app.page.select_option("#charging-vehicle", "EV-02")
    app.page.click("#submit-charging")
    report.check(s, "EV-02 queued", app.feedback_ok(), app.feedback())
    app.page.select_option("#charging-type", "private")
    report.check(s, "private EV battery field is editable", app.page.locator("#charging-battery").is_enabled())
    app.page.fill("#private-vehicle-label", "Private EV Demo")
    app.page.fill("#charging-battery", "")
    app.page.click("#schedule-private")
    report.check(s, "empty private battery rejected", app.feedback() == "Enter a battery level from 0 to 100." and not app.feedback_ok(), app.feedback())
    app.page.fill("#charging-battery", "35")
    app.page.click("#schedule-private")
    report.check(s, "private EV parking held and request queued", app.feedback().startswith("Parking held at Metro Hub and charging request for Private EV Demo queued."), app.feedback())
    app.page.click('#schedule-controls button[data-hub-id="H-METRO"]')
    report.check(s, "schedule applied: 2 assigned, 1 waiting", app.feedback() == "Charging schedule applied at Metro Hub: 2 newly assigned, 1 waiting, 0 on hold.", app.feedback())
    block = app.text('#operator-schedule [data-hub-id="H-METRO"]')
    lines = [line for line in block.splitlines() if line.strip()]
    order = [line for line in lines if line in ("EV-02", "Private EV Demo", "EV-01")]
    report.check(s, "priority order EV-02 (CP-01), Private EV (CP-02), EV-01 waiting", order == ["EV-02", "Private EV Demo", "EV-01"] and "Assigned CP-01" in block and "Assigned CP-02" in block and "Waiting" in block, block.replace("\n", " / "))
    report.check(s, "EV-02 status becomes Charging", app.status("EV-02") == "Charging")
    app.shot(shots, "03_charging_schedule.png", "#operator-schedule")

    s2 = "S5b charging guard"
    app.open()
    app.page.select_option("#charging-vehicle", "EV-01")
    app.page.click("#submit-charging")
    app.click_action("EV-01", "reserve-vehicle")
    app.page.click('#schedule-controls button[data-hub-id="H-METRO"]')
    report.check(s2, "reserved vehicle is put on hold instead of being assigned", app.feedback() == "No queued charging request can be assigned at Metro Hub now (0 waiting, 1 on hold)." and "On hold: vehicle is reserved" in app.text("#operator-schedule"), app.feedback())
    report.check(s2, "both Metro points stay free", "2 free points" in app.text("#schedule-controls"), app.text("#schedule-controls"))


def scenario_operator(app: App, report: Report, shots: Path | None) -> None:
    s = "S6 operator incidents (AT-10,11,13,14)"
    app.open()
    metrics = app.text("#operator-metrics")
    report.check(s, "network metrics: 4 Hubs, 5/6 vehicles, 4/5 points", all(token in metrics for token in ("Hubs monitored\n4", "5/6", "4/5")), metrics.replace("\n", " / "))
    report.check(s, "redistribution recommendation Dormitory -> University", "from Dormitory Hub to University Hub" in app.text("#redistribution-panel"))
    app.page.click('[data-action="coordinate-redistribution"]')
    report.check(s, "coordination moves EV-03 to University", app.feedback() == "EV-03 coordinated from Dormitory Hub to University Hub." and app.cell("EV-03", 1) == "University Hub", app.feedback())
    app.page.select_option("#incident-vehicle", "EV-02")
    app.page.click("#report-vehicle-failure")
    report.check(s, "vehicle failure recorded", app.feedback() == "EV-02 marked failed and incident opened." and app.status("EV-02") == "Failed", app.feedback())
    app.page.select_option("#incident-charging-point", "CP-01")
    app.page.click("#report-charging-failure")
    report.check(s, "charging point outage recorded", app.feedback() == "CP-01 marked unavailable and incident opened.", app.feedback())
    incidents = app.text("#incident-list")
    report.check(s, "incident list shows both incidents as Open", "Vehicle failure · EV-02" in incidents and "Charging point unavailable · CP-01" in incidents and incidents.count("Open") == 2, incidents.replace("\n", " / "))
    report.check(s, "Open incidents metric = 2", "Open incidents\n2" in app.text("#operator-metrics"))
    app.page.click("#report-vehicle-failure")
    report.check(s, "repeating the same failure is rejected", app.feedback() == "EV-02 is already marked as failed." and not app.feedback_ok(), app.feedback())
    app.shot(shots, "05_incidents.png", ".operator-tools")


def scenario_what_if(app: App, report: Report, shots: Path | None) -> None:
    s = "S7 what-if x5 (AT-16..18)"
    app.open()
    live_table = app.text("#operator-hub-rows")
    live_cards = app.text("#hub-grid")
    for scenario in SCENARIOS:
        app.page.select_option("#scenario", scenario)
        app.page.select_option("#scenario-hub", "H-METRO")
        app.page.click("#run-simulation")
        output = app.text("#simulation-output")
        unchanged = app.text("#operator-hub-rows") == live_table and app.text("#hub-grid") == live_cards
        report.check(
            s,
            f"{scenario}: impact + recommendation shown, live state unchanged",
            "Live state unchanged: yes" in output and app.page.locator("#simulation-output li").count() >= 1 and unchanged
            and app.feedback() == "Hypothetical scenario evaluated. Live network state was not changed.",
            output.replace("\n", " / ")[:300],
        )
        if scenario == "hub_full":
            app.shot(shots, "06_what_if.png", ".simulation-panel")


def scenario_simulator_and_modes(app: App, report: Report, shots: Path | None) -> None:
    s = "S8 simulator (AT-19)"
    app.open()
    expected = [
        "Telemetry update: EV-01 battery is now 81%.",
        "Parking sensor update: Metro Hub occupancy is now 5/8.",
        "Charging telemetry update: CP-01 is temporarily occupied.",
        "Operational event update: the simulator reported a routine network refresh.",
    ]
    for index, message in enumerate(expected, start=1):
        app.page.click("#simulate-update")
        report.check(s, f"manual update {index} visible immediately", app.text("#last-update").startswith(message), app.text("#last-update"))
    report.check(s, "vehicle table reflects telemetry (EV-01 81%)", app.cell("EV-01", 2) == "81%")
    app.page.click("#toggle-auto-update")
    report.check(s, "auto updates start", app.text("#toggle-auto-update") == "Stop auto updates" and "15 seconds" in app.feedback(), app.feedback())
    before = app.text("#last-update")
    try:
        app.page.wait_for_function(f"() => document.querySelector('#last-update').innerText.trim() !== {before!r}", timeout=20_000)
        arrived = True
    except Exception:  # noqa: BLE001 - reported as a failed check
        arrived = False
    report.check(s, "an automatic update arrives within 20 s", arrived, app.text("#last-update"))
    app.page.click("#toggle-auto-update")
    report.check(s, "auto updates stop", app.text("#toggle-auto-update") == "Start auto updates" and app.feedback() == "Automatic simulated updates paused.", app.feedback())

    m = "S9 interface mode (AT-20)"
    app.open()
    app.page.click("#toggle-mode")
    background = app.page.evaluate("getComputedStyle(document.body).backgroundColor")
    report.check(m, "dark mode applied", app.page.get_attribute("html", "data-mode") == "dark" and background == "rgb(21, 26, 29)", background)
    app.page.select_option("#language-select", "vi")
    report.check(m, "Vietnamese interface applied", app.page.get_attribute("html", "lang") == "vi" and app.text("main section:nth-of-type(2) h2") == "Tìm tài nguyên và hoàn thành chuyến đi", app.text("main section:nth-of-type(2) h2"))
    report.check(m, "mode button translated", app.text("#toggle-mode") == "Chế độ sáng", app.text("#toggle-mode"))
    app.click_action("EV-01", "reserve-vehicle")
    report.check(m, "service feedback translated", app.feedback().startswith("Đã giữ EV-01 cho STUDENT-DEMO đến"), app.feedback())
    report.check(m, "status badge translated", app.status("EV-01") == "Đã giữ chỗ", app.status("EV-01"))
    app.page.evaluate("window.scrollTo(0, 0)")
    app.shot(shots, "07_vi_dark.png")
    app.page.select_option("#language-select", "en")
    report.check(m, "back to English keeps state and re-translates feedback", app.page.get_attribute("html", "lang") == "en" and app.feedback().startswith("EV-01 reserved for STUDENT-DEMO") and app.status("EV-01") == "Reserved", app.feedback())
    app.page.click("#toggle-mode")
    report.check(m, "light mode restored", app.page.get_attribute("html", "data-mode") == "light")


def scenario_demo_rehearsal(app: App, report: Report, shots: Path | None) -> None:
    """Follows docs/demo/DEMO_SCRIPT_8_TO_12_MIN.md on ONE page load, as presented live."""
    s = "S11 demo script rehearsal"
    app.open()
    expect = lambda step, text: report.check(s, step, app.feedback() == text, app.feedback())  # noqa: E731
    page = app.page

    page.select_option("#vehicle-search-hub", "H-METRO")
    page.fill("#minimum-battery", "80")
    report.check(s, "step 1: search Metro >= 80% finds EV-01 only", page.locator("#search-results .result-row").count() == 1)
    page.select_option("#vehicle-search-hub", "")
    page.fill("#minimum-battery", "0")

    app.click_action("EV-01", "reserve-vehicle")
    report.check(s, "step 2: reserve EV-01", app.feedback().startswith("EV-01 reserved for STUDENT-DEMO until"), app.feedback())
    app.click_action("EV-01", "pickup-vehicle")
    expect("step 2: pick up EV-01", "EV-01 picked up from Metro Hub. Return it to a Hub with free parking.")
    app.return_to("EV-01", "H-DORM")
    expect("step 2: return EV-01 to Dormitory", "EV-01 returned to Dormitory Hub; the reservation is completed.")

    app.reserve_and_pick_up("EV-05")
    expect("step 4: reserve + pick up EV-05", "EV-05 picked up from University Hub. Return it to a Hub with free parking.")
    page.select_option("#parking-hub", "H-DORM")
    page.click("#reserve-parking")
    expect("step 4: parking 1 at Dormitory", "Parking space reserved at Dormitory Hub; 1 space left.")
    page.click("#reserve-parking")
    expect("step 4: parking 2 at Dormitory", "Parking space reserved at Dormitory Hub; 0 spaces left.")
    page.click("#reserve-parking")
    expect("step 4: parking 3 refused", "No parking capacity available at Dormitory Hub.")
    app.return_to("EV-05", "H-DORM")
    expect("step 4: return to full Dormitory refused", "Dormitory Hub has no free parking space; choose another Hub.")
    report.check(s, "step 4: Dormitory #1 at capacity", "#1 · at capacity" in page.locator('#operator-hub-rows tr[data-hub-id="H-DORM"]').inner_text())
    app.return_to("EV-05", "H-CAMPUS")
    expect("step 4: return EV-05 to University", "EV-05 returned to University Hub; the reservation is completed.")

    page.select_option("#charging-hub", "H-METRO")
    page.select_option("#charging-vehicle", "EV-02")
    page.click("#submit-charging")
    expect("step 5: queue EV-02", "Charging request for EV-02 added to the queue at Metro Hub.")
    page.click("#submit-charging")
    expect("step 5: duplicate EV-02 refused", "EV-02 already has a charging request in the queue.")
    page.select_option("#charging-type", "private")
    page.fill("#private-vehicle-label", "Private EV A")
    page.fill("#charging-battery", "")
    page.click("#schedule-private")
    expect("step 5: empty battery refused", "Enter a battery level from 0 to 100.")
    page.fill("#charging-battery", "35")
    page.click("#schedule-private")
    expect("step 5: Private EV A queued", "Parking held at Metro Hub and charging request for Private EV A queued. Apply the schedule to assign a charging point.")
    page.fill("#private-vehicle-label", "Private EV B")
    page.fill("#charging-battery", "70")
    page.click("#schedule-private")
    expect("step 5: Private EV B queued", "Parking held at Metro Hub and charging request for Private EV B queued. Apply the schedule to assign a charging point.")
    page.select_option("#charging-type", "shared")
    page.click('#schedule-controls button[data-hub-id="H-METRO"]')
    expect("step 5: apply Metro schedule", "Charging schedule applied at Metro Hub: 2 newly assigned, 1 waiting, 0 on hold.")

    page.click('[data-action="coordinate-redistribution"]')
    expect("step 6: coordinate redistribution", "EV-01 coordinated from Dormitory Hub to University Hub.")
    page.select_option("#incident-vehicle", "EV-02")
    page.click("#report-vehicle-failure")
    expect("step 6: EV-02 failed", "EV-02 marked failed and incident opened.")
    report.check(s, "step 6: EV-02 request on hold, Private EV B planned on CP-01", "On hold: vehicle failed" in app.text("#operator-schedule") and "Plan CP-01" in app.text("#operator-schedule"))
    page.click('#schedule-controls button[data-hub-id="H-METRO"]')
    expect("step 6: re-apply schedule", "Charging schedule applied at Metro Hub: 1 newly assigned, 0 waiting, 1 on hold.")
    page.select_option("#incident-charging-point", "CP-02")
    page.click("#report-charging-failure")
    expect("step 6: CP-02 unavailable", "CP-02 marked unavailable and incident opened.")
    page.click('#schedule-controls button[data-hub-id="H-METRO"]')
    expect("step 6: no capacity left", "No queued charging request can be assigned at Metro Hub now (1 waiting, 1 on hold).")

    cards_before = app.text("#hub-grid")
    for scenario in ("hub_full", "charging_demand_surge"):
        page.select_option("#scenario", scenario)
        page.select_option("#scenario-hub", "H-METRO")
        page.click("#run-simulation")
        report.check(s, f"step 7: what-if {scenario} keeps live state", "Live state unchanged: yes" in app.text("#simulation-output") and app.text("#hub-grid") == cards_before)

    page.click("#simulate-update")
    report.check(s, "step 8: first simulated update", app.text("#last-update").startswith("Telemetry update: EV-01 battery is now 81%."), app.text("#last-update"))
    page.click("#toggle-mode")
    page.select_option("#language-select", "vi")
    report.check(s, "step 8: dark + Vietnamese", app.page.get_attribute("html", "data-mode") == "dark" and app.feedback().startswith("Cập nhật telemetry: pin EV-01 còn 81%"), app.feedback())


def scenario_mobile(browser, base: str, report: Report, shots: Path | None, problems: list[str]) -> None:
    s = "S10 narrow viewport"
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    watch(page, problems)
    app = App(page, base)
    app.open()
    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    report.check(s, "no horizontal page overflow at 390 px", overflow <= 0, f"overflow {overflow}px")
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
            browser = playwright.chromium.launch(channel=None if name == "chromium" else name, headless=not headed)
            return name, browser
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
        context = browser.new_context(viewport={"width": 1366, "height": 900}, locale="en-US")
        page = context.new_page()
        watch(page, problems)
        app = App(page, base)
        for scenario in (scenario_discover, scenario_lifecycle, scenario_expiry, scenario_capacity, scenario_charging,
                         scenario_operator, scenario_what_if, scenario_simulator_and_modes, scenario_demo_rehearsal):
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
