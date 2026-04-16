# BeCurious Live Website — Context Update
_Last updated: 2026-04-14_

This document is a self-contained brief so you can paste it into a new chat and brainstorm without losing context. It covers what the system is, what's been built, what's live, and what's open.

---

## 1. What the product is

A single-file web app (`public/scheduler.html`, ~7,500 lines of HTML/CSS/JS) that runs BeCurious's tutoring operations in Kuwait. Hosted on Vercel, code lives on GitHub. Saleh is not a developer but ships by pushing from his Mac terminal. All data is shared across devices via Supabase; there is no per-user login — everyone sees the same operational state.

**The file replaces** Excel sheets + the Odoo CRM for operations. Odoo stays only for accounting.

**Branch model (important):**
- `main` → live site
- `dev` → staging
- Supabase holds **two rows**: `SUPA_ROW_ID='main'` for the live site, `SUPA_ROW_ID='dev'` for staging. The `_isDevDeploy` flag in the code decides which row to read/write. This means **dev work never touches live data**.
- Deploy flow: merge `dev` → `main` on GitHub (using `git merge -X theirs origin/dev` if there are conflicts, which prefers dev's version), then Vercel auto-deploys. Live data is preserved because the live site still points at the `main` Supabase row.

---

## 2. Main tabs and what each does

### Schedule
- Sessions grid for tutors, students, branches, days, and times.
- Unscheduled-sessions pool at the bottom (drag to assign).
- CSV import/export for schedules.

### Students
- Roster with English names, parent phone numbers, branch, program, etc.
- Source of truth for the "Linked student" dropdown used elsewhere.

### Pipeline (enrollment funnel — SOP 4.6.4)
- 7-stage Kanban replacing the old Odoo CRM flow.
- Opens in Kanban view by default.
- Each lead card has: payment status (paid/partial/unpaid), enrollment status (enrolled/etc.), segment, branch.
- CSV import/export.

### Cases (retention / refund / complaint desk)
- Opens in Kanban view by default.
- Each case has:
  - **Parent Full Name** (single field — replaces old "family name + child name" split)
  - Linked student (dropdown into Students table; optional)
  - Branch, type, segment (loyal / hesitant / highrisk), escalation level, status
  - **Payment status**, **enrollment status**
  - **Unsettled amount (KWD)** (renamed from "Amount (KWD)")
  - **Complaint reasons** — multi-select
  - **Next actions** — checklist, with an "Insert" button; each item toggles done with a real ✓ checkmark (U+2713), no more literal `&check;` text
  - **Activity log** — visible, with a live count of entries
  - Notes
- **Settings panel** (gear icon) — add/delete the options for: case types, payment segments, escalation levels, statuses, outcomes. Stored in `CASE_SETTINGS` and persisted with the rest of the state.
- **WhatsApp button** — opens a script picker, you choose a message script, then it deep-links `wa.me/<parent phone>?text=<script>` using the phone from the linked student's parent record.
- **CSV import/export** — shares the same parser as Pipeline (function-hoisted `csParseCsv`).
- Legacy data healing: `migrateCases()` runs on every load and rewrites any old `&check;` / `&#10003;` literal text into a real ✓.

---

## 3. Recent fixes / upgrades (in order)

1. Cases tab rebuilt end-to-end: Kanban-first, Settings panel, Parent Full Name, checklist next-actions, multi-select complaint reasons, visible activity log, CSV I/O, value-stack removed.
2. "Amount (KWD)" renamed to "Unsettled amount (KWD)."
3. Activity log counter fixed — was stuck at (0 entries); now wrapped in `<span id="cs-log-count">` and refreshed via `csRefreshLogUI()`.
4. Checklist layout fix — checkbox was stretching because a global `.pl-field input{width:100%}` rule leaked into children; overridden with `.cs-na-item input[type="checkbox"]{width:auto;padding:0}`.
5. WhatsApp flow changed — instead of always sending a single canned message, it now opens a picker to choose a script and sends to the linked student's parent phone.
6. Unicode checkmark fix — `&check;` and `&#10003;` were showing as literal text because `esc()` HTML-escaped the `&`. Source now uses `\u2713` directly; migration rewrites old entries.
7. Unscheduled-sessions pool couldn't scroll — fixed with `overflow-y:auto; min-height:0` on `.pool-body` (flex-child scrolling needs both).
8. Dev → main deploy — merged cleanly with `-X theirs`; live data was preserved because of the two-row Supabase isolation.

---

## 4. The search box question (answered)

The search input is a per-device UI filter — it does **not** sync across devices. Each coordinator can search independently without affecting what anyone else sees.

---

## 5. April 2026 — importing the Arabic retention list

**Source:** `تحليل بيانات التسجيل 2026 شهر ابريل (1).xlsx` — 312 rows, Arabic, RTL, branches marked by section headers, columns: اسم العائلة / الشريحة / آخر تواصل / الموقف / الإجراء التالي / الدفع.

**Challenge:** Arabic parent names on the sheet, English student names in the system, and no unique IDs per student.

**Strategy applied:**
- These belong in **Cases**, not Students (they all have issues — refund, lawsuit threat, hesitant, partial pay, no reply).
- Deterministic Case ID = MD5 hash of the Arabic parent name → re-imports **upsert** instead of duplicating, as long as spelling doesn't change.
- Field mapping:
  - الشريحة: مقتنع → loyal, متردد → hesitant, عالية الخطورة → highrisk
  - الدفع: تم كامل → paid, تم جزء → partial, لم يتم → unpaid
  - الموقف + آخر تواصل → notes (kept in Arabic)
  - الإجراء التالي → next-action checklist item
  - فرع X (section header) → branch
- Arabic ↔ English matching is manual and one-time-per-case: open the case, pick the student from the Linked-student dropdown. No auto-match is attempted because name transliterations are too unreliable.

**Output file built for import:**
`BeCurious_Cases_Import_April2026.csv` — 293 deduped cases (118 loyal, 47 hesitant, 128 high-risk; 143 unpaid, 127 paid, 10 partial, 13 blank). 6 internal duplicates in the source sheet were collapsed: عبدالعزيز عماد, صالح الزايد, لولوة الهاجري, بدر العلي, عبدالعزيز العتيبي, سعود الكندري.

**Not yet done:** actually importing the CSV into the live Cases tab (Cases → ↑ Import → pick the CSV).

---

## 6. Open threads / things to brainstorm

- **Import cadence for retention data** — the Arabic sheet is updated monthly. Should re-imports be the normal pattern, or should Cases become the only source of truth after the first import and the Excel be retired?
- **Linking Arabic cases to English students** — is there appetite to build a side-by-side "match screen" that shows the Arabic case next to candidate English students so a coordinator can click through the whole list in one sitting?
- **Unsettled amounts** — currently blank for all 293 imported cases because the Excel doesn't carry amounts. Need a plan for where the amount comes from (Odoo accounting export? manual entry? another sheet?).
- **Assigned-to / outcome fields** — also blank in the import. Worth defining a default owner (e.g., "مس اسماء" appears repeatedly in الإجراء التالي) and auto-assigning.
- **Activity log seeding** — imported cases start with an empty log. Optionally we could seed each with one log entry summarizing the Arabic situation so the history isn't lost if notes are later edited.
- **Refund/retention playbook integration** — the Retention & Refund Defense Playbook lives as a separate .docx. Could be wired into the WhatsApp script picker so the right script is suggested based on segment + complaint reason.
- **Pipeline ↔ Cases handoff** — when a Pipeline lead turns into a refund/complaint, is there a one-click "convert to Case" path, or does it stay manual?

---

## 7. Reference paths

- Code file: `public/scheduler.html`
- Live: `main` branch on GitHub → Vercel
- Staging: `dev` branch on GitHub → Vercel preview (writes to Supabase `dev` row)
- Supabase: two rows keyed by `SUPA_ROW_ID` (`main` / `dev`)
- April retention import CSV: `BeCurious_Cases_Import_April2026.csv` (in the workspace root)
- Source Excel: uploads → `تحليل بيانات التسجيل 2026 شهر ابريل (1).xlsx`
