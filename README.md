# Cyber — CH Config Tool

A single-file, offline HTML application for **Cyber-Hardening (CH) configuration management** of a
fleet of device configurations. It is a **pure generator**: it ingests captured config files, lets a
user record hardening decisions once and inherit them across devices, and emits the scripts/config/
reports that implement, verify, and document those decisions. **It never contacts a device or the
network.**

Built to `android-ch-config-tool-build-spec-v2.0.md` (normative). The deliverable is the single file
**`ch-config-tool.html`** — open it by double-clicking (works from `file://`).

## Quick start

1. Open `ch-config-tool.html` in Chrome, Edge, or Firefox.
2. **Onboard** a device by supplying its two capture files (see formats below).
3. Record decisions in the data tabs (Packages / Tactical). Undecided items are flagged. Each value
   gets the editor its **value format** implies — true/false, a number box, a one-per-line list, or a
   dropdown of allowed options; define your own named formats from any row's **Value format** picker.
4. **Save project** — the downloaded JSON is the single source of truth (keep it in SharePoint).
5. When a device is fully decided, use the **Generate** tab to produce Implementation / Verification /
   Reporting `.zip` bundles.

## Input capture formats

Captured externally (the tool never runs `adb`); the Onboard tab shows these too.

- **Packages** (`packages.txt`, text): `adb shell pm list packages` — one `package:<name>` per line.
- **Tactical** (policy `.json`): the Knox tactical configuration exported as a JSON object.

> **Settings was retired in v2.0.** Every hardening change the fleet needs is expressed through
> Packages and Tactical, so the `settings list` register (thousands of mostly cosmetic keys) was
> removed. Projects saved by v1.x still open: the Settings items, snapshots and overrides are
> dropped on load and the Activity drawer says exactly what went. Save the project to make the
> removal permanent.

## Outputs

Each generate command produces **one deterministic `.zip`** (plus a `manifest.json` with per-file
SHA-256 and the decision snapshot used):

- **Packages → a PowerShell** script that drives `adb` on a Windows host (run it there).
- **Tactical → `tactical.json`** in the captured format — **upload directly to Knox tactical** (no
  script, no extra steps).
- **Reporting → a styled `report.html`** that opens in Microsoft Word as a formatted document.

## Self-tests

Append **`#selftest`** to the URL (e.g. `ch-config-tool.html#selftest`) to run the embedded test
suite in-page. It must show all green. The harness is also runnable headlessly (see
`progress-log.md`).

## Definition-of-Done checklist (spec §1.1)

| DOD | What | Status |
|-----|------|--------|
| DOD-1 | Single `.html`, runs from `file://` with no console errors / no network | ✅ no network/external refs; **verified in headless Chrome from `file://` — full suite green, zero console errors**; manual pass in Edge/Firefox still advised |
| DOD-2 | Load → the data tables → search/sort/filter → save losslessly | ✅ engine round-trip tested; tables data-driven |
| DOD-3 | Onboard via the capture files; Onboard disabled until all parse | ✅ |
| DOD-4 | Onboarding embeds hashed snapshots, inherits keys, appends new undecided, triage summary | ✅ |
| DOD-5 | Undecided flagged; decisions via decisionSchema controls | ✅ |
| DOD-6 | Implementation/Verification/Reporting independent, gated on completeness | ✅ |
| DOD-7 | Each generator → one `.zip` + manifest; byte-deterministic | ✅ tested (incl. real data) |
| DOD-8 | Report `.html` opens in Word as a formatted document | ✅ Word-safe HTML; **manual:** open in Word |
| DOD-9 | Device view: read-only applicable decided items, one panel per dataset | ✅ |
| DOD-10 | Malformed inputs → located, non-fatal errors; never silent | ✅ |
| DOD-11 | A new dataset/platform needs **no core edits** (adapter/profile only) | ✅ portability self-test (mock platform) |
| DOD-12 | Module headers + JSDoc; embedded self-tests pass | ✅ 335/335 |

**Manual checks remaining:** DOD-1 (open the file in all three browsers and confirm a clean console)
and DOD-8 (open a generated `report.html` in Microsoft Word). All other items are covered by the
embedded self-tests and headless verification.

## Project files

- `ch-config-tool.html` — the application (the only runtime artifact).
- `android-ch-config-tool-build-spec-v2.0.md` — the normative build spec (current).
- `android-ch-config-tool-task-breakdown-v2.0.md` — the phase/task breakdown behind the spec.
- `Archive/` — the superseded v1.0 spec and task breakdown, kept for the audit trail.
- `progress-log.md` — per-phase build log (what was built, tests, results).
- `validation-testing-plan.md` — manual plan to validate a full CH config onto real hardware, and to
  compare it against an independently hand-hardened device.
- `defect-register.md` — defects found during review and their fixes.
- `Reference Input Files/` — real sample captures used to validate the parsers/generators.
