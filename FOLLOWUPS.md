# MAEC Follow-ups

Living doc of deferred work / known limits. Append before finishing any feature; check before starting one.

## Sprint state (2026-05-02 EOD) — re-verified clean

Four sprints shipped + audit-verified:
- **Sprint 0** (`b2ad8c7`): Bệnh nhân server-side filters + pagination + 9 indexes. Ready for tens-of-thousands import.
- **Sprint A** (`7a4609b`): catalogCRUD `_id` fix, deleted legacy `/api/registration/appointments`, mobile patient/encounter headers, Lịch hẹn 30-min event card compact mode, Q2 (auto-stamp `assignedTo`), Q4 (In lại biên lai), 2 typo fixes.
- **Sprint B** (`a0cf9ae`): Q3 full Payment ledger (`Encounter.payments[]` + `/payment` + `/refund` + stock-return reversal), inventory transfer auto-confirm + expiry propagation, Q7 Đổi cơ sở, shared `useEscapeKey` hook wired to 8+ modals.
- **Sprint C** (`02e4c7e`): UTC→local-date helper (`maec-app/server/lib/dates.js`), POST /encounters idempotency, bill-items stable subdoc `_id`, Q5 stocktake productKind chips + category dropdown, mobile UI polish (Thu ngân tabs, Bệnh nhân table min-w, Inventory disabled-button styling + mobile tab strip, AppointmentForm mobile grid).

Smoke scripts in `maec-app/server/scripts/` — re-run any time via `cd maec-app/server && railway run node scripts/<name>.js`:
- `smoke-patients-10k.js` — Sprint 0 pagination + filters (10k seed, asserts age window narrows correctly, cleans up)
- `smoke-patients-route.js` — same but via HTTP (500 row seed)
- `smoke-catalog-roundtrip.js` — Sprint A catalogCRUD POST→PUT→GET→DELETE
- `smoke-sprintB.js` — transfer flow + payment ledger + Q7 site swap
- `smoke-sprintC.js` — idempotency + bill-items stable _id + stocktake productKind + date helpers
- `audit2-seed.js` — quick seed/clean of one `_TESTFL2_` patient + encounter for UI flow testing

All test-data prefixes use `_TEST*_*` so cleanup is `M.deleteMany({_id:{$regex:'^_TEST'}})`. Last verified 0 residual `_TEST*` rows in patients/encounters/appointments.

## 8 workflow questions — answered + implemented

| Q | Decision | Where |
|---|---|---|
| Q1 — Reschedule audit | A: keep as-is (no audit) | n/a |
| Q2 — KTV/BS assignment | B: auto-stamp `assignedTo` on save | `encounters.js` PUT /:id/services/:code |
| Q3 — Partial pay + refund | C: full Payment ledger + refund + stock-return | new endpoints + ThuNgan rewrite |
| Q4 — Reprint biên lai | B: button on paid rows + drawer | ThuNgan.jsx |
| Q5 — Stocktake by category | C: productKind chips + category dropdown | StocktakeNewModal |
| Q6 — Site filter on Bệnh nhân | A: skip (BN db is shared) | n/a |
| Q7 — Edit encounter site | B: editable pre-checkout | `PUT /encounters/:id/site` + Đổi cơ sở button |
| Q8 — Server-side patient filters | C: filters + pagination + larger pageSize | Sprint 0 |

## Lịch hẹn — reminder automation (deferred 2026-05-02)

Lịch hẹn tab shipped 2026-05-02 with **manual reminder workflow only**: staff calls / texts patients themselves and ticks a "Đã nhắc / Không liên lạc được" checkbox on the Nhắc lịch view. No automation yet.

When the clinic picks a delivery channel (likely Zalo OA or VietGuys / Speedsms for SMS), wire it server-side into a `POST /appointments/auto-remind` cron (T-1 day at e.g. 16:00) that:
- iterates `Appointment.find({ scheduledAt: tomorrow, status: in [scheduled, confirmed], reminderStatus: 'pending' })`
- calls the provider for each
- sets `reminderStatus = 'reminded'` + `remindMethod = 'sms'|'zalo'` + `remindedBy = 'system'` on success
- sets `'failed'` + log on failure (so the manual queue picks them up next day)

Model already has the fields (`reminderStatus`, `remindedAt`, `remindedBy`, `remindMethod`, `remindNote`). UI on Nhắc lịch view already shows the method tag + reminder timestamp.

Provider creds need to land in Railway env (`SMS_API_KEY` etc.) before this can be turned on.

## Lịch hẹn — walk-in appointments don't auto-create Patient (deferred 2026-05-02)

`POST /api/appointments` accepts `patientName + phone` without a `patientId` so phone-enquiry bookings can land on the calendar before the person is in the patient DB. The Tiếp đón button is disabled for these (it requires `patientId`); staff has to open the appt → Sửa → search/create the patient first, then re-tiếp đón.

If walk-in becomes common, add a "Tạo bệnh nhân từ lịch này" affordance in the appointment detail modal that pops the FormView (already extracted from Registration.jsx as embeddable) prefilled with the appt's `patientName + phone + dob + gender`, then writes the new `patientId` back onto the appointment.

## Lịch hẹn — slot conflict warning (deferred 2026-05-02)

The form lets you double-book the same site/time. Calendar visualisation makes overlaps obvious so this hasn't bitten anyone, but if scheduling tightens add a server-side check on POST/PUT against `Appointment.find({ site, scheduledAt overlap, status: not in [cancelled, no_show] })` and either block or warn-then-confirm.

## Bệnh nhân — referrer typeahead with create-new (deferred 2026-05-02)

The patient form ([FormView in Registration.jsx](maec-app/client/src/pages/Registration.jsx)) currently uses a 2-dropdown picker for referrers (Loại đối tác select → Đối tác giới thiệu select listing all referrers of that type). With a long referral list this gets unwieldy.

User wants: type a name or phone → search referrer collection live → if a match exists, pick from a typeahead dropdown; if no match, "+ Tạo đối tác mới với '...'" inline-creates a row in the right collection (referral-doctors, partner-facilities, or salesperson user) and selects it.

Design notes:
- Replace the second select with a search input + dropdown panel (similar to PatientLookup in [Kham.jsx](maec-app/client/src/pages/Kham.jsx)).
- Inline-create modal needs only the minimum required fields per type: doctor (name + phone), facility (name + address), salesperson (probably link to existing user instead of creating).
- Server already supports `q=` filter on `/catalogs/referral-doctors` and `/catalogs/partner-facilities`.

## Kho — dropped tabs (2026-05-02), components left as dead code

Inventory tabs were trimmed to **Tồn kho / Giao dịch / Kiểm kê** (default = Tồn kho). The two dropped tabs:

- **Tổng quan** — alerts (expiring lots, below-min supplies, pending transfers, auto-deduct variance) + activity-today rollup. Considered duplicative with the main app **Tổng Quan dashboard** which is slated to absorb stock alerts as widgets. `OverviewTab` function in [Inventory.jsx](maec-app/client/src/pages/Inventory.jsx) is dead code now — delete when the main dashboard's inventory widgets ship.
- **Tổng hợp chuỗi** — supervisor-only supply×warehouse matrix. Niche. `MatrixTab` function similarly dead. Resurface under Khác or rebuild if managers ever ask.

Endpoints still alive (no backend cleanup): `/inventory/alerts`, `/inventory/activity-today`, `/inventory/stock/matrix`. Delete the dead React components + the unused endpoints in a single cleanup pass once the dashboard widgets that absorb the alerts are confirmed live.

## Mobile responsive — Phase 1 done, Phase 2+ pending (2026-05-01)

The native Expo/RN app (P3 in CLAUDE.md) is still not scaffolded. Until then we want the web app to be acceptably usable on mobile browsers. **Phase 1 done; first pass looked OK — user wants polish on Đăng ký services view and the rest of the data-heavy pages.**

### Phase 1 — done
- [Layout.jsx](maec-app/client/src/components/Layout.jsx): sidebar becomes off-canvas drawer with backdrop below `lg` (1024px), auto-closes on nav. Header verbose elements pushed to `lg`/`xl` (long title, Chế độ xem badge, currency text). Search button → icon-only below `md`.
- [Registration.jsx](maec-app/client/src/pages/Registration.jsx): HeaderStepper wraps + hides /tiếp đón sub-label and user/date on mobile. Body row stacks `flex-col lg:flex-row`. TodayRail goes `w-full lg:w-80` with `max-h-60` on mobile. SearchView padding scales `px-3 sm:px-6`.

### Phase 2 — done 2026-05-02 (workflow tabs)
Pass over the 6 active workflow tabs (Tổng quan / Bệnh nhân / Lịch hẹn / Khám / Thu ngân / Kho — skipped Dịch vụ since the Bảng giá matrix is inherently wide):
- **Dashboard.jsx** (Tổng quan) — was already responsive (`grid-cols-2 lg:grid-cols-4` KPI, `lg:grid-cols-[1fr_360px]` chart layout). No changes.
- **LichHen.jsx** — toolbar already uses `flex-wrap`, calendar grid wrapped in `overflow-auto` so week view scrolls horizontally on mobile.
- **Inventory.jsx** — outer padding `p-6` → `p-2 sm:p-4 lg:p-6`. PageHeader gets `flex-wrap`, hides `/vận hành` and `👤 user` chips below md. Filter inputs `min-w-[240/300px]` → `w-full sm:w-auto sm:min-w-[…]`. Three wide tables (Tồn kho / Phiên kiểm kê / Kiểm kê items) wrapped in `Card overflow-x-auto` + their grids get `min-w-[640/660px]` so columns don't squash.
- **Kham.jsx** — PatientLookup input `w-64` → `w-full sm:w-64`, wrapper `relative w-full sm:w-auto` so it stretches when wrapping.
- **ThuNgan.jsx** — 8-col billing table wrapped in `overflow-x-auto` + `min-w-[720px]`. Tab strip wrapped in `overflow-x-auto` so the 3 status tabs scroll at very narrow widths.
- **Catalogs.jsx PatientsTable** — search input `w-72` → `w-full sm:w-72`. Table already had `overflow-auto whitespace-nowrap` and modal already uses `w-full max-w-5xl p-4`. No table changes.

### Phase 2 — still pending (legacy pages outside the new sidebar)
- **Billing.jsx** — `w-80` left invoice panel doesn't reflow; right-side tables need scroll wrapper. Lives in Khác → "Phiếu thu (legacy)" so lower priority.
- **HRManagement.jsx** — permission matrix `min-w-[140px]` columns + `max-w-2xl` modals overflow at 375px. Admin-only tab.

Pattern used: wrap wide tables in `overflow-x-auto` + give the inner grid/table a `min-w-[…]` so columns keep their intent and the page horizontally scrolls instead of squishing; cap modals to `max-w-Nxl` with `p-4` outer padding (the inner `w-full` shrinks to viewport); scale `min-w-[…]` filter inputs to `w-full sm:w-auto sm:min-w-[…]`.

### Đăng ký step 2 simplified to pure check-in (2026-05-02) — supersedes prior polish ask
The 2026-05-01 polish ask above was for the step-2 service picker + cart + "In phiếu chỉ định" panel. That panel has been deleted. Step 2 is now `CheckInView`: PatientSummary + a single "Tiếp đón" button that POSTs `services: []` to `/registration/check-in`, creating an empty Encounter and redirecting to Khám. No invoice / phiếu is generated at this stage; KTV/BS pick services in Khám and Thu Ngân handles billing after the visit.

The mobile-responsive concerns (cart stacking, row layout at 375px) no longer apply. The print slip helper (`printOrderSlip`) was removed entirely — recover from git if needed when a print-at-checkout flow returns.

### Optional: pre-select services / packages at check-in (deferred 2026-05-02)
Some receptionists may want to attach a known package (e.g. PKG-1 Khám mắt cơ bản) at check-in time so it's already on the encounter when KTV/BS open it. Today the Đăng ký flow has zero service/package picker; assignment happens entirely in Khám via the "Gán gói" / "+ Thêm dịch vụ" buttons. If we add a pre-select step, keep it strictly optional — the empty-check-in path must remain the default.

### Phase 3 — per-page polish (lower priority)
Login, Dashboard already responsive. Remaining: TodayDashboard chart sizing, Reports tabs, KPISales gauges, Workflow/CRM/AuditLog (already have `overflow-x-auto`).

## Open package / pricing questions (filed 2026-05-01)

Reconciled against canonical price sheet [PK MA_Danh Sách Giá.xlsx](PK%20MA_Danh%20S%C3%A1ch%20Gi%C3%A1.xlsx) on 2026-05-01.

### Resolved

1. ~~PKG-2 (bundled cyclo + TG2M @ 350k) vs PKG-2A / PKG-2B~~ — sheet has only the two separate 350k variants. **PKG-2 dropped**, kept PKG-2A (cyclo only) and PKG-2B (TG2M only).

2. ~~PKG-OK-RECHECK 300k flat vs PKG-4 dynamic~~ — sheet has flat 300k. **PKG-4 dropped**, kept PKG-OK-RECHECK at 300k.

5. ~~OCT "tổng" implicit~~ — sheet treats it as a separate billable line (800k standalone / 600k in-package). **Added `SVC-OCT-FULL`** with the same `basePrice / inPackagePrice` shape as the split variants. SVC-OCT-ANT and SVC-OCT-POST stay for individual selection.

6. ~~SVC-BIOMETRY 250k placeholder~~ — sheet confirms 400k. **Updated.**

7. ~~Soft CL fitting collapsed under SVC-CL-FIT~~ — sheet has 3 distinct prices (mềm 100k / cứng 200k / củng mạc 250k). **Split SVC-CL-FIT into `SVC-CL-FIT-SOFT`, `SVC-CL-FIT-RGP`, `SVC-CL-FIT-SCLERAL`.** PKG-3A / PKG-3B now reference `SVC-CL-FIT-RGP` (ortho-K is RGP). Field schemas in [serviceOutputFields.js](maec-app/server/config/serviceOutputFields.js) share one definition across all three.

### Still open (sheet didn't answer)

3. **PKG-ATROPIN (1.5M confirmed)** — bundle services still placeholder (autoref + refract + IOP + slit + topo + OCT-trước + myopia consult). Need from MAEC: exactly which services included up-front, follow-up schedule, entitlement length (1 year? 6 months?), whether atropine drops product is bundled or separate.

4. **PKG-RECHECK (150k confirmed)** — placeholder bundles only refract + slit. Need from MAEC: exact services, time window for eligibility (e.g. within 30 days of any prior visit?), whether it stacks with other tái khám packages.

8. **"Khám thị giác 2 mắt chuyên sâu" 400k** — appears in sheet's Giá DV khám tab as a standalone item, separate from the SVC-TG2M station test (100k). Not yet in catalog. Likely a deeper TG2M-focused exam package (binocular vision workup). Bundle composition TBD with MAEC; deferred to workflow walkthrough.

### Frame + lens retail pricing — awaiting MAEC (placeholders seeded)

Frames + lens placeholders are now in the catalog with `sellPrice: 0` where MAEC retail isn't set. Once MAEC ships the markup rule / per-SKU retail prices, edit each row's `sellPrice` and re-run the relevant seed script.

- **Gọng kính** ([seed-maec-gong.js](maec-app/server/scripts/seed-maec-gong.js)): 87 unique SKUs, all with `sellPrice: 0`. Brands: NEW BALANCE 15 + PARIM 15 + EXFASH 56 + HELEN KELLER 1. importPrice already includes 8% VAT from invoice. **Need from MAEC: retail-pricing rule** (flat markup %? per-brand tier? per-SKU manual?). Once known, either bulk-update via formula or hand-set each `sellPrice`.
- **Tròng kính Ortho-K** ([seed-maec-trong.js](maec-app/server/scripts/seed-maec-trong.js) — `KN-T-019`..`KN-T-027`): 9 placeholders covering both suppliers (3 SEED Breath-O Correct variants + 6 KSCT variants). All `sellPrice: 0`. **Confirm whether retail is set only via PKG-3A/3B tiers (15.5M / 18.5M / 22.5M)** or whether standalone retail also exists for spare/replacement lens sales. If standalone retail exists, populate the rows directly.
- **Rigid CL & cosmetic** (`KN-T-015`..`KN-T-018` — SEED UV-1, SEED KC, AS-LUNA, IRIS): retail blank in sheet, `sellPrice: 0` placeholder. Need MAEC retail.
- **Lens accessories** (`KN-A-004`..`KN-A-011`): Avizor GP multi 240ml, removal sticks (3 origin variants), DMV thẳng remover, pouch, tray, ngâm jar — all `sellPrice: 0`. Need MAEC retail.

### Catalog items NOT in 31.12.2025 sheet — confirm still active

Sheet "Thuốc (31.12.2025)" is a year-end inventory snapshot. The 10 items below exist in [seed-maec-thuoc-kinh.js](maec-app/server/scripts/seed-maec-thuoc-kinh.js) but have no row in the sheet — could mean (a) sold out at year-end / restocked since, or (b) discontinued. Not dropping until MAEC confirms:

- **TH-001** Thuốc uống Kid Visio (346k/500k)
- **TH-002** Myatro XL không chất bảo quản 0.05% (122k/240k)
- **TH-003** Repadrop (325k/450k)
- **TH-022** Systane ultra tép (270k/330k)
- **TH-034** Alegysal (0/100k)
- **TH-035** Kary Uni (0/70k)
- **TH-039** Thuốc uống Gitalut (83k/200k)
- **TH-040** Vệ sinh bờ mi Tarsan (120k/240k)
- **TH-043** Myartro XL 0.05% (85k/150k) — **possible duplicate of TH-002** with similar name + same concentration but different prices; verify whether one is a typo or genuinely a different product
- **TH-044** Optive UD (187k/220k)

Also flag **TH-049 Cravit 1.5** which appears in the sheet but with **no prices** filled in — needs MAEC pricing (purchase + retail).

### Catalog reconciliation 2026-05-01 — done

- **Khám catalog** ([seed-maec-catalog.js](maec-app/server/scripts/seed-maec-catalog.js)): 22 services + 8 packages. Reconciled with sheet "Giá DV khám" tab. See resolved questions above for the 5 changes (SVC-BIOMETRY price, SVC-OCT-FULL added, SVC-CL-FIT split, PKG-2 dropped, PKG-4 dropped).
- **Thuốc catalog** ([seed-maec-thuoc-kinh.js](maec-app/server/scripts/seed-maec-thuoc-kinh.js)): 48 → 55 items. Added Cravit 1.5, Ocudry, Intense Relief, Lumix 0.3, Atropin 0.025% (Ko CBQ), Atropin 0.5% (liệt điều tiết), Eyemed.
- **Kính catalog** (same file): 15 → 17 items. Added Avizor Lacrifresh tép (KN-016), Nước rửa kính mềm nhỏ (KN-017). Renamed KN-013 to "Nước rửa kính mềm to" to match sheet.
- **Gọng kính catalog** ([seed-maec-gong.js](maec-app/server/scripts/seed-maec-gong.js), new file): 87 frame SKUs from 2 supplier invoices (101 Eyewear). All `sellPrice: 0` — awaiting MAEC retail rule.
- **Tròng kính catalog** ([seed-maec-trong.js](maec-app/server/scripts/seed-maec-trong.js), new file): 27 lens SKUs (`KN-T-001`..`KN-T-027`) — 14 soft CL with retail, 4 rigid/cosmetic with `sellPrice: 0`, 9 Ortho-K with `sellPrice: 0`. Plus 11 lens-related accessories (`KN-A-001`..`KN-A-011`) — 3 with retail, 8 placeholders.

### Catalog code-prefix scheme

Now that we have multiple seed scripts touching the `Kinh` collection, each one is scoped to its own code prefix so they don't clobber each other on re-run:

- `KN-NNN` (3 digits, no extra prefix) — legacy general accessories, owned by [seed-maec-thuoc-kinh.js](maec-app/server/scripts/seed-maec-thuoc-kinh.js). Currently KN-001..KN-017.
- `KN-G-NNN` — gọng (frames), owned by [seed-maec-gong.js](maec-app/server/scripts/seed-maec-gong.js).
- `KN-T-NNN` — tròng (lenses: soft CL, rigid CL, Ortho-K), owned by [seed-maec-trong.js](maec-app/server/scripts/seed-maec-trong.js).
- `KN-A-NNN` — additional lens-related accessories from Seed/Orthok sheets, owned by [seed-maec-trong.js](maec-app/server/scripts/seed-maec-trong.js).

Each script's `Kinh.deleteMany()` is regex-scoped to its own prefix.

## Done in 2026-05-01 P0/P1 pass

### P0
- **Branding sweep**: ~190+ "LinkRad"/"linkrad"/"LINKRAD" replacements across server, client, PACS, scripts, configs. Brand strings are now "Minh Anh Eye Clinic" (full / user-facing) or "MAEC" (short / code/internals). Vietnamese-first UI: "Phòng khám Mắt Minh Anh" used in app header.
- localStorage keys (`linkrad_auth`, `linkrad_catalog_*`, `linkrad_report_*`) renamed to `maec_*`.
- Demo passwords `linkrad2025` → `maec2026`. Promo code `LINKRAD10` → `MAEC10`. SESSION_SECRET fallback updated.
- DICOM AE Title in `pacs/orthanc.json`: `LINKRAD` → `MAEC`. Orthanc & OHIF container names + `friendlyName` updated.
- Sidebar logo: "LinkRad" → "Minh Anh Eye Clinic" (two-line mark). App header: "LinkRad ERP" → "Phòng khám Mắt Minh Anh".

### P1 — Domain rename (partial — see deferred list)
- **Telerad pages dropped**: `Teleradiology.jsx`, `TeleradReading.jsx`, `TeleradAdmin.jsx`, `context/TeleradTabsContext.jsx` deleted. `App.jsx` cleaned (imports + routes + `<TeleradTabsProvider>` unwrap). `Layout.jsx` cleaned (whole `Chẩn đoán hình ảnh` group removed; `Inactive` section's telerad entries removed). `GlobalSearch.jsx` palette entries removed.
- **Sidebar group rename**: "RIS-PACS" → "Khám bệnh"; item label "Ca chụp" 🩻 → "Lượt khám" 👁️. URL `/ris` kept (slug, internal — revisit when redesigning the page).
- **Study model → Encounter**: `models/Study.js` renamed to `models/Encounter.js`. Mongoose model name `'Study'` → `'Encounter'` (collection becomes `encounters` — fine since no production data). Schema variable, all 11 server importers (7 routes + 4 scripts), and all `Study.find/Study.create/...` class references updated. **Field names kept as-is** — see deferred work.
- **`examType` field added** to `Encounter` and `ReportTemplate`. `modality` enum (`['CT','MRI','XR','US']`) dropped — now free-form String. Index on ReportTemplate updated to include `examType`.
- **Report Templates UI**: filter and form now use `examType` with the 4 documented workflows (Khám mắt cơ bản / Khám khúc xạ + thị giác hai mắt / Khám kính tiếp xúc (mới) / Tái khám kính tiếp xúc) + "Khác". `bodyPart` placeholder updated to OD/OS/OU.
- **OHIF extras**: all `linkrad*` identifiers (`_linkradToolsRegistered`, `_linkradAlignLock`, `linkrad-brand-badge`, `linkrad-timeline-panel`, etc.) renamed to `maec*` equivalents. Visible badge "LINKRAD PACS" → "Minh Anh Eye Clinic".

## Action required from user (P0) — cleared

- **MongoDB Atlas**: provisioned. Cluster `maec.eh7gh3v.mongodb.net/maec`, `MONGODB_URI` set in Railway.
- **First Railway deploy**: live at https://maec-production.up.railway.app.
- **sites.json financials**: shelved — not needed for now. Districts are real (Trung Kính / Kim Giang); `startMonth`, `totalInvestment`, `bank`, `bankLoan` left at 0/empty in [sites.json](maec-app/server/data/sites.json) until financial modelling becomes relevant.

### Demo data still references old LinkRad usernames
Re-seeded users.json on 2026-05-01 (20 users, departments remapped to Trung Kính / Kim Giang; doctor dept changed to "Mắt"; 3 `nv_th*`/`tp_th` users dropped). These LinkRad-era files **still reference old usernames or 3-region structure**:

- [tasks.json](maec-app/server/data/tasks.json) — task assignments reference dropped usernames (`nv_hd1`, `nv_cm1`, `nv_th*` etc.). Tasks tab will show "unknown user" entries.
- Server scripts ([sanity-check-hr.js](maec-app/server/scripts/sanity-check-hr.js), [sanity-check-portals.js](maec-app/server/scripts/sanity-check-portals.js), [seed-catalogs-mock.js](maec-app/server/scripts/seed-catalogs-mock.js), [seed-portals.js](maec-app/server/scripts/seed-portals.js), [seed-hr.js](maec-app/server/scripts/seed-hr.js), [seed.js](maec-app/server/scripts/seed.js)) — test fixtures use old usernames.
- [Registration.jsx](maec-app/client/src/pages/Registration.jsx), [PartnerReferralDrawer.jsx](maec-app/client/src/components/PartnerReferralDrawer.jsx) — UI defaults reference old regions/doctors.

## Done 2026-05-01 — Financials module deleted

The whole Tài chính module was ripped out (will be rebuilt from scratch on the 2-site model later). What went:

- **Client pages deleted (11)**: PL, CF, BalanceSheet, Breakeven, AnnualPL, AnnualCF, MonthlyPL, MonthlyCF, SitePL, Actuals, DashboardFinance.
- **Server routes deleted (5)**: pl.js, cf.js, bs.js, breakeven.js, actuals.js.
- **Data JSONs deleted (7)**: annual-pl, annual-cf, monthly-pl, monthly-cf, balance-sheet, breakeven, actuals.
- **Wiring removed**: Tài chính sidebar group + 5 menu items in [Layout.jsx](maec-app/client/src/components/Layout.jsx); 13 financial API wrappers in [api.js](maec-app/client/src/api.js); 4 finance entries in [GlobalSearch.jsx](maec-app/client/src/components/GlobalSearch.jsx); 5 server route mounts in [server/index.js](maec-app/server/index.js); 7 KVStore seed entries in [seed.js](maec-app/server/scripts/seed.js); 6 imports + 5 routes + the `/dashboard/finance` redirect in [App.jsx](maec-app/client/src/App.jsx); the `tai-chinh-overview` leaf in [reportGroups.js](maec-app/client/src/config/reportGroups.js); `DashboardFinance` import + Tài Chính PersonaRow + the `tai-chinh-overview` activeKey case in [Reports.jsx](maec-app/client/src/pages/Reports.jsx); KVStore comment.

### Kept (intentionally)
- **`sites.json`, [SiteList.jsx](maec-app/client/src/pages/SiteList.jsx), [sites.js](maec-app/server/routes/sites.js) route**: dual-use — Workflow + KPISales need site lookups. Financial fields (`totalInvestment`, `bankLoan`, `maecShare`, etc.) still in the schema but unused.
- **`financials.view` / `financials.manage` perms** in [permissions.js](maec-app/server/shared/permissions.js): scaffolding kept for the rebuild. The `isFinancialsUser` derivation in Layout.jsx still gates the Báo cáo tree visibility.
- **`financialsOnly` gate** in Layout.jsx render functions: dead read (no node sets the flag now) but harmless.
- **`/reports/doanh-thu`** and the whole `Tài Chính` group in [reportGroups.js](maec-app/client/src/config/reportGroups.js): revenue detail report is operational (not financial-module), still works.

### To repair when financials are rebuilt
- **Reports.jsx Tài Chính PersonaRow** (was 3 KPI tiles: today's receipts → /reports/doanh-thu, unpaid invoices → /billing, MTD/YTD/EBITDA → DashboardFinance) — only the 3rd tile was financial; the first two are operational. Re-surface them when the new finance dashboard exists, either as a reborn Tài Chính row or under a different section.
- **2-site financial model** (was the original blocker — needed re-modelling annual-pl/cf/breakeven for 2 sites instead of 3 regions). Rebuild rather than reshape — start clean.

## Deferred — Domain rename (round 2)

`Encounter` schema kept all `Study`-era field names to limit blast radius. The right shape after the workflow walkthrough is probably:
- `examType` (already added) replaces "modality" as the per-encounter category; populate from the 4 workflows.
- `studyDate` → `encounterDate` (when the eye visit happened).
- `studyUID` → likely move into a sub-array `imagingStudies: [{ studyUID, modality, ... }]` because one encounter can have multiple DICOM studies attached (fundus + OCT + topo).
- `radiologist` / `radiologistName` → `doctor` / `doctorName`. (Routes also expose `/ris/radiologists` — endpoint name should follow.)
- `bodyPart` → keep, but in eye context populate with OD / OS / OU.
- `modality` enum dropping was step 1; once `imagingStudies` sub-array exists, the top-level `modality` field can be removed entirely.

Comments mentioning "Study"/"RIS Study" in routes (registration.js, reports.js, ris.js, patient-portal.js, lib/warehouseScope.js) were left — update opportunistically.

## Deferred — UI / pages (post-workflow-walkthrough)

### Encounter form (replaces RIS.jsx ReportEditor for eye exams)
The 4 workflow diagrams from 2026-05-01 give us the exact tabs/modules. Before building, decide with user:
- **Composable modules vs. fixed forms**: 4 distinct workflow forms vs. 1 composable form picking from station modules (Auto-refraction / VA + manual refraction / IOP / slit lamp / corneal topography / OCT / fundus / visual field / cycloplegic refraction / binocular vision / contact-lens trial / final consult).
- **Cycloplegic 45-min wait** (flows #2 and #3): system-level timer/queue, not just a manual reminder. UX needed.
- **Slit-lamp = anchor**: patient returns to slit lamp after add-ons. Form should make "return to slit lamp" an explicit step.
- **Workflow catalog**: 4 documented; likely more exist (cataract pre-op, glaucoma follow-up, dry-eye, retina, post-op). Ask user.

### Eye-specific report templates (seed content)
With `examType` field in place + the dropdown wired, the seed templates need content. Per CLAUDE.md, planned templates: general exam, dry-eye, pre-cataract, glaucoma follow-up, retina. Validate this list against the 4 documented workflows + ask what else clinic uses.

### Page renames (low priority — file names are internal)
File names `RIS.jsx`, `RadiologyReports.jsx`, `CriticalFindings.jsx` are internal. URLs `/ris`, `/critical-findings`, `/report-templates` are slugs — users see Vietnamese labels. Defer file renames to whenever those pages get redesigned. `RadiologyReports.jsx` is currently unused (route map redirects elsewhere) — candidate for deletion after confirming no inbound bookmarks.

### Multi-site ops dashboard (salvage from old TeleradAdmin)
Before deletion, `TeleradAdmin.jsx` had a useful pattern: sidebar of doctor workload + tabbed "pool / in-progress / done" case list with reassignment. For 2-location MAEC ops, an equivalent could show: per-clinic patient queue, per-station bottleneck, per-doctor workload. Build when ops needs it; pattern is documented here.

## DB audit — done 2026-05-02 (still TODO: rebuild MAEC-era seed content)

Two wipe passes against production Atlas on 2026-05-02:

**Pass 1 — operational data** ([scripts/wipe-operational-data.js](maec-app/server/scripts/wipe-operational-data.js)): 3 Patient + 42 Encounter + 2 Invoice + zeros for Appointment/Payment/Entitlement/PartnerReferral/PatientAccount/PatientFeedback/Notification/Report/KeyImage/StudyAnnotation. Khám list now empty.

**Pass 2 — LinkRad-era leftover** ([scripts/wipe-linkrad-leftover.js](maec-app/server/scripts/wipe-linkrad-leftover.js)): 21 AuditLog + 35 Task + 7 KVStore financial blobs (annual-pl, annual-cf, monthly-pl, monthly-cf, balance-sheet, breakeven, actuals — orphaned by the 2026-05-01 Financials module deletion). ReferralDoctor / PartnerFacility / CancelReason / Specialty / ReportTemplate were already empty.

**Verified clean / kept intact 2026-05-02:**
- **CustomerSource** (3 docs: TUDEN / GIOITHIEU / ONLMKT) — generic and MAEC-era.
- **Warehouse** (2 docs: WH-TK Trung Kính / WH-KG Kim Giang) — matches the 2-site model.
- **InventoryLot / InventoryTransaction / StocktakeSession** — empty.
- **KVStore.sites** — the live MAEC 2-site config doc (only KVStore doc left).

**Still TODO — needs re-seeding when the workflow walkthrough happens:**
- **ReportTemplate** — empty after wipe; needs MAEC eye-exam templates per the 4 documented `examType` workflows + dry-eye/glaucoma/retina/pre-cataract.
- **Specialty** — empty; if used downstream, seed eye-clinic specialties (Khúc xạ, Glaucoma, Võng mạc, etc.).
- **CancelReason** — empty; seed reception-friendly reasons (BN không đến, đổi lịch, BHYT vấn đề, ...).
- **ReferralDoctor / PartnerFacility / CommissionGroup / CommissionRule** — empty; will fill organically as MAEC onboards real partners.

**Other LinkRad-era debris to revisit:**
- JSON fixtures still reference dropped usernames (see "Demo data still references old LinkRad usernames" section below).
- [tasks.json](maec-app/server/data/tasks.json) seed file likely contains LinkRad-era task fixtures that would re-pollute if any seed-tasks job runs — verify before re-seeding.
- Promotion / PromoCode collections — not yet inspected.

Both wipe scripts are idempotent and safe to re-run if state drifts again.

## Đăng ký → Bệnh nhân merge — partial done 2026-05-02; partner referrals still pending

The Đăng ký sidebar entry was removed 2026-05-02. Bệnh nhân now hosts the reception flow:
- **+ Bệnh nhân mới** → navigates to `/registration` (existing FormView page).
- **+ Tiếp đón** on the patient drawer → calls `POST /registration/check-in` with `services: []` (idempotent — returns existing open encounter if one exists, else creates a new one).
- The `/registration` route is still registered in [App.jsx](maec-app/client/src/App.jsx) so the FormView is reachable for patient creation.

**Still TODO:**
- **Partner-referral inbox** — currently lives inside [Registration.jsx](maec-app/client/src/pages/Registration.jsx) (`TodayRail` + `ReferralDetailDrawer` + `AcceptDialog` + `RejectDialog`). Receptionists can still reach it by navigating to `/registration` directly, but it's no longer surfaced anywhere in the new sidebar. Plan: extract the inbox + accept/reject flow into a standalone panel/page on the **Bệnh nhân** route (e.g. a "Đối tác chuyển gửi (N)" badge + popout panel showing the pending list). Until then, document the workaround.
- **FormView extraction** — the current "+ Bệnh nhân mới" navigates away from Bệnh nhân to a separate page. Cleaner: extract `FormView` (and its dependencies `Field`, `ADDR_SHORTCUTS`, `GENDERS`, `REFERRAL_TYPES`, etc.) from [Registration.jsx](maec-app/client/src/pages/Registration.jsx) into `client/src/components/PatientForm.jsx`, render as a modal on Bệnh nhân, then `/registration` and `Registration.jsx` can be deleted entirely.
- **TodayRail discoverability** — Tổng Quan now shows "Lượt khám hôm nay" widget which covers most of what TodayRail did. Once partner referrals also live in Bệnh nhân, Registration.jsx can go.

## Tổng quan dashboard — v1 live 2026-05-02 (revenue + check-ins)

[Dashboard.jsx](maec-app/client/src/pages/Dashboard.jsx) now renders 4 KPI cards (Today / WTD / MTD / YTD) with per-site split, a 12-month stacked bar chart of paid Encounter revenue per site, and a "Lượt khám hôm nay" sidebar widget linking each row to its `/kham?id=...`. Backend: [GET /reports/maec-overview](maec-app/server/routes/reports.js) — single roundtrip.

**Future improvements (not requested yet):**
- Inventory red flags card (items below min stock, lots near expiry within N days).
- "BN chờ thanh toán" widget (encounter status NOT IN [paid, cancelled, scheduled] AND has bill items — i.e. clinical work done but not yet through Thu ngân).
- Per-role variants (Lễ tân sees check-in queue, BS sees clinical queue, Kho sees stock alerts).
- Drill-down links from each KPI card to the matching `/reports/...` filtered view.
- Compare-to-prior-period delta (Today vs Yesterday, WTD vs prior week, etc.).

The legacy radiology dashboards ([TodayDashboard.jsx](maec-app/client/src/pages/TodayDashboard.jsx), [DashboardClinical.jsx](maec-app/client/src/pages/DashboardClinical.jsx), [DashboardOps.jsx](maec-app/client/src/pages/DashboardOps.jsx)) still exist under Khác → Inactive — salvage patterns from them when adding the inventory / clinical-queue widgets.

## Equipment module — shipped 2026-05-23

The "Devices module" deferred 2026-05-02 (when `Service.station/role/devices` were ripped out as never-queried catalog clutter) landed as **Equipment** — sidebar under Khác → Vận hành → 🔬 Thiết bị (`/equipment`). Code: backend models + route, frontend page + attachments component, all wired in `1f8ac30`.

- **Model**: [Equipment](maec-app/server/models/Equipment.js) — flat schema, fields grouped as identity / deployment / purchase. Schema is loose by design (vendor docs vary in what they record). `siteId` is `'TK'` (Trung Kính) / `'KG'` (Kim Giang) / `''` (unassigned). `status`: `active / commissioning / repair / retired`. `serviceCodes: [String]` links a device to the Service codes it performs (denormalised — no join collection yet; reads from CLAUDE.md device-map table when there's ambiguity).
- **Attachments**: [EquipmentAttachment](maec-app/server/models/EquipmentAttachment.js) mirrors EncounterAttachment + adds `kind` chip (`contract / quote / manual / service / calibration / other`). Same R2 storage path (`equipment/<id>/<attId>/<filename>`).
- **Routes**: [routes/equipment.js](maec-app/server/routes/equipment.js) → `/api/equipment` (CRUD) + `/api/equipment/:id/attachments` (upload/list) + `/api/equipment-attachments/:id/url` (presigned-GET) + `/api/equipment-attachments/:id` (DELETE).
- **UI**: [pages/Equipment.jsx](maec-app/client/src/pages/Equipment.jsx) — filter bar + table + inline-edit drawer with KPI tiles. Admin/giamdoc edit; other roles see read-only. "+ Thiết bị mới" auto-suggests next `TB-NNN` code.
- **Seed**: [scripts/seed-equipment.js](maec-app/server/scripts/seed-equipment.js) — 20 devices: 11 new (Kim Giang, `commissioning`) from 3 vendor docs (2026-05-23 batch) + 5 existing (Trung Kính, `active`) from CLAUDE.md device map + 4 existing (Kim Giang, `active`) added 2026-05-27 (Nidek OCT, Eaglet ESP, Syseye biometer, handheld tonometer — paperwork TBD). Total tracked from contracts: ~1.185B VND.
- **Contracts**: [scripts/attach-equipment-contracts.js](maec-app/server/scripts/attach-equipment-contracts.js) uploaded 11 R2 attachments (HD2636/NH-MA docx → TB-001..007, Medmont Pro .doc → TB-008, IKACHI quote pdf → TB-009..011). Deterministic `ATT-eq-<sha8>` ids → idempotent.

### Still deferred (intentionally simple shipment)
- **`Service ↔ Device` join collection**: today `Equipment.serviceCodes[]` is a free-form array; no compatibility matrix. Build when reports need it (e.g. "which device should perform SVC-FUNDUS at this site?" answered today by reading CLAUDE.md, not the DB).
- **Service station / role on Equipment**: kept out — they're *workflow* metadata that should live on the Encounter form module config + user permissions map, not the device.
- **Existing equipment paperwork**: TB-012..016 (DRS Plus, Optopol Revo, existing Medmont, AB800, IDRA at TK) + TB-017..020 (Nidek OCT, Eaglet ESP, Syseye biometer, handheld tonometer at KG) have `notes` flagging that purchase fields are blank; upload their contracts + fill in model/serial via the UI when found. TB-017 needs model + DICOM-module status; TB-019 needs model + export options (PDF vs CSV/XML for IOL workflow); TB-020 needs make/model (iCare ic100/ic200? Tonopen?).
- **Service-log sub-doc on Equipment**: schema has `lastServiceDate` / `nextServiceDate` flat fields. When recurring maintenance is real, replace with a `serviceLog: [{date, vendor, cost, note, attachmentId}]` sub-array.

### Source-of-truth snapshot (was in seed-maec-catalog.js until 2026-05-02)

Keep this table to seed the Devices module + Service↔Device links when they're built:

| Service code | Station | Role (performer) | Devices |
|---|---|---|---|
| SVC-AUTOREF | auto-ref | ktv-khuc-xa | Auto-refractor |
| SVC-REFRACT | va-refraction | ktv-khuc-xa | Trial frame + lens, VA chart |
| SVC-TG2M | tg2m | ktv-khuc-xa | Worth 4-dot, Maddox, Prism bar |
| SVC-CYCLO | cyclo-room | ktv-khuc-xa | Atropin 0.5%, Cyclogyl 1%, Trial frame |
| SVC-CONTRAST | contrast | ktv | Pelli-Robson chart |
| SVC-ISHIHARA | color-vision | ktv | Ishihara plates |
| SVC-IOP | iop-portable | ktv | iCare, Goldmann |
| SVC-SLIT | slit-lamp | bs | Slit lamp, 90D / 78D |
| SVC-BIO | bio | bs | Indirect ophthalmoscope, 20D lens |
| SVC-SCHIRMER | schirmer | ktv | Schirmer strips |
| SVC-TOPO | topo | ktv | Medmont |
| SVC-OCT-ANT | oct | ktv | Optopol Revo |
| SVC-OCT-POST | oct | ktv | Optopol Revo |
| SVC-FUNDUS | fundus | ktv | DRS Plus (Trung Kính), Vietcan {model TBD} (Kim Giang) |
| SVC-DRYEYE | dry-eye | ktv | IDRA, Medmont Meridia |
| SVC-BIOMETRY | biometry | ktv | MediWorks AB800, Syseye, Optopol Revo |
| SVC-OCT-FULL | oct | ktv | Optopol Revo |
| SVC-CL-FIT-SOFT | cl-fit | bs-cl | Trial CL kit (soft), Slit lamp |
| SVC-CL-FIT-RGP | cl-fit | bs-cl | Trial CL kit (RGP), Slit lamp |
| SVC-CL-FIT-SCLERAL | cl-fit | bs-cl | Trial CL kit (scleral), Slit lamp |
| SVC-MYOPIA-CONSULT | consult | bs | (none) |
| SVC-FB-REMOVE | procedure | bs | Slit lamp, Sterile needle |

Note SVC-FUNDUS already encodes a per-site device split (DRS Plus at Trung Kính vs Vietcan at Kim Giang) — the Devices module needs a `siteId` field to model this cleanly.

## Per-site pricing — deferred (flagged 2026-05-02)

`Service.basePrice` / `Service.inPackagePrice` and `Package.basePrice` / `Package.pricingTiers` are currently single-value across both sites. Prices may diverge across Trung Kính vs Kim Giang (different rent / patient mix / promotional pricing). When this becomes real:

- Move pricing into its own collection (e.g. `ServicePrice` / `PackagePrice`) keyed by `(serviceCode | packageCode, siteId, effectiveFrom)`. Effective-dated rows so price changes are auditable and a historical bill can be reconstructed at the price in force at the time.
- Keep `basePrice` on Service/Package as a **default / fallback** for sites that don't override, OR drop it entirely and require a price row per (item, site).
- Billing flow ([routes/registration.js](maec-app/server/routes/registration.js), Billing.jsx, ThuNgan.jsx) needs to take the patient's encounter site and resolve the correct price. Today it reads `Service.basePrice` directly — that lookup is the join point.
- Reports that aggregate revenue across sites need to keep the per-site price visible (don't average / collapse).

Until then, treat the existing prices as "Trung Kính standard" and don't introduce site-specific pricing through ad-hoc fields.

## Imaging integration (P2)

### Imaging device adapters (Minh Anh hardware)
| Device | Path | Status |
|---|---|---|
| DRS Plus fundus camera | DICOM into PACS | Plug-and-play, verify |
| Optopol Revo OCT | DICOM into PACS | **Verify DICOM module licensing on the unit** |
| Medmont topographer | Document attachment (PDF) | Build watched-folder ingestor |
| MediWorks AB800 biometer | Structured data + PDF | **Confirm export options (PDF only or CSV/XML)** |
| SBM Sistemi IDRA | PDF + structured measurements | Build watched-folder ingestor |

### IOL calculation workflow
AB800 biometry → formula → surgical plan attached to encounter. Important for cataract pipeline. Wait for AB800 export format confirmation.

### Compare-over-time view
Same component reused for: meibography progression, fundus side-by-side, OCT thickness change. Design once, reuse.

## Mobile staff app (P3 — not yet scaffolded)

Net-new Expo / React Native build. v1 scope:
- Today's schedule
- Patient intake
- Exam capture (refraction / IOP / slit lamp findings) — **portable IOP device "follows the patient" per workflow diagrams; mobile UX should reflect this**
- Phone camera capture for ad-hoc images
- Encounter sign-off
- Billing

## Phiếu kết quả — patient docx printout (landed 2026-05-10)

Clinic delivered two Word docs that drive the patient-facing result sheet + the canonical Encounter field list:

- **Patient printout template**: [maec-app/server/templates/patient-printout.docx](maec-app/server/templates/patient-printout.docx) — 7 sections, `{{var}}` placeholders, rendered via [docxtemplater](https://docxtemplater.com/).
- **Field spec (digitised)**: [maec-app/server/config/examSummarySchema.js](maec-app/server/config/examSummarySchema.js) — 14 sections, ~200 fields with codes, value sets, eyeSplit flags. Source doc preserved at [maec-app/server/templates/exam-summary-spec.docx](maec-app/server/templates/exam-summary-spec.docx).

Wired live:
- Route: `GET /api/encounters/:id/printout.docx` ([encounters.js](maec-app/server/routes/encounters.js)).
- Binder: [lib/patientPrintout.js](maec-app/server/lib/patientPrintout.js) — flattens `assignedServices[].output` into a single namespace; rollup vars (slit-lamp groupings, dry-eye score selection, myopia narrative) composed inline.
- Button: "📄 Phiếu kết quả (.docx)" next to "In Phiếu Khám" in the Khám encounter pane.
- Smoke: `cd maec-app/server && node scripts/smoke-printout.js` renders against a synthetic encounter — no DB needed.
- Cross-validation: `node scripts/validate-printout-template.js` confirms every `{{var}}` in the template maps to either a schema key or a known printout-only rollup.

Remaining gaps before the form replaces ReportEditor:

- **Encounter form UI** still pending — drive it from `examSummarySchema.js` and persist into the existing `assignedServices[].output` bag using the canonical codes (so the printout binder requires no changes).
- **Narrative rollup vars** in the printout (`myopia_risk_interpretation`, `myopia_plan_short`, `progression_interpretation`, `treatment_adjustment`, `risk_factor_summary`, `lifestyle_advice_short`) currently emit empty strings — these are doctor-authored summary text fields and need either dedicated form inputs or a one-shot AI summarisation step.
- **Bilingual EN variant** of the printout template still needed (see next section).

## Phiếu kết quả — bilingual VN / EN print (deferred)

Today the doctor's printable from Khám is `printVisitReport` (Phiếu Khám) in Vietnamese only — see [Kham.jsx](maec-app/client/src/pages/Kham.jsx). Foreign / expat patients need an English version on demand.

Plan:
- Add a third print: **Phiếu kết quả** (results sheet, distinct from Phiếu Khám) — focused on the clinical findings + conclusion + diagnosis, no station-by-station worklist clutter. Patient-facing, suitable for handing to a foreign patient or sharing with their home doctor.
- Before opening the print window, prompt the user to pick **Tiếng Việt** or **English**. Single language renders per print (no side-by-side).
- English variant needs translations for: clinic header (already have "Minh Anh Eye Clinic"), section titles, status labels, examType names, common service names, conclusion / diagnosis labels. Output values that are free text stay as-typed (no auto-translation).
- Implementation note: avoid an i18n framework — keep a small `EN_LABELS = { ... }` map at the top of the print module mirroring the VN labels; switch by parameter. Same pattern as the existing inline-Vietnamese convention in CLAUDE.md.
- Where: a new "🖨 In Phiếu kết quả" button in the encounter pane header next to "In Phiếu Khám", popping a tiny VN/EN chooser before invoking the dedicated `printResultSheet(enc, lang)` function.

## Encounter attachments + sample import + dd/mm/yyyy — shipped 2026-05-22

### Encounter file attachments — Cloudflare R2 (`f944814`, provisioned 2026-05-23)
Per-encounter PDF/image upload. Bytes in Cloudflare R2 (S3-compatible), metadata in a new collection.
- Backend: [lib/r2.js](maec-app/server/lib/r2.js), [EncounterAttachment](maec-app/server/models/EncounterAttachment.js) model, [routes/attachments.js](maec-app/server/routes/attachments.js) — upload / list / presigned-URL view / delete, mounted at `/api`. Deps: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `multer`.
- Frontend: [EncounterAttachments.jsx](maec-app/client/src/components/EncounterAttachments.jsx) — "Tài liệu / Hồ sơ" panel in the Khám encounter pane.
- **R2 provisioned 2026-05-23**: bucket `maec-attachments` (APAC), API token scoped Object Read & Write to that bucket. `R2_*` env vars in Railway + local [.env](maec-app/server/.env). Verify with [scripts/smoke-r2.js](maec-app/server/scripts/smoke-r2.js) (`PUT` → presigned `GET` → `DELETE` roundtrip).
- Still deferred: the **watched-folder ingestor** (auto-attach from Medmont / AB800 / IDRA export folders) — this shipped the manual-upload + storage half only.

### Sample patient import — review-gated (`61bfb5e`, re-parsed in `f944814`)
The 10 "Hồ sơ PK Minh Anh" sample PDFs → 7 patients / 19 encounters via [scripts/import-sample-hoso.js](maec-app/server/scripts/import-sample-hoso.js) (idempotent, fixed IDs `BN-20260522-9xxx`).
- 3 from digital device PDFs (Medmont / Optopol REVO / AB800) — exact values. 4 from handwritten scans — best-effort; each handwritten service note carries a ⚠ verify-against-scan caveat.
- Clinical data parsed into structured `assignedServices[].output` fields, not free text in `conclusion`.
- All rows land `reviewStatus: 'pending_review'`. New review fields on Patient + Encounter: `reviewStatus` / `importBatch` / `importSource` / `importedAt` / `reviewedBy` / `reviewedAt`. Admin approves from the Bệnh nhân catalog — "⏳ Chờ duyệt" filter → "✓ Duyệt hồ sơ" (`POST /registration/patients/:id/approve`, cascades to the patient's pending encounters).

### Exam output fields
[serviceOutputFields.js](maec-app/server/config/serviceOutputFields.js) gained fields the paper exam forms use but the Khám form lacked — SVC-TG2M (MEM / NPC / AC-A / NRA-PRA), SVC-REFRACT (VA-with-old-glasses, SE), SVC-OCT-POST (C/D ratio), SVC-CL-FIT (centration, treatment delta). Codes already existed in `examSummarySchema.js`. Not added (smaller follow-up): SAI / SRI on SVC-TOPO, pupil size.

### dd/mm/yyyy date display
Shared [client/src/lib/date.js](maec-app/client/src/lib/date.js) (`formatDate` / `formatDateTime`). 11 screens that rendered raw `YYYY-MM-DD` now show `dd/mm/yyyy`; the rest already did via `vi-VN` locale. Stored values + `<input type="date">` unchanged.

## Hồ sơ PK Minh Anh — PDFs attached to encounters (2026-05-23, `d24bd4f`)

Source: the same `_sample_import` / "Hồ sơ PK Minh Anh" 10-file batch parsed for the 2026-05-22 patient import. With R2 provisioned, [scripts/attach-sample-pdfs.js](maec-app/server/scripts/attach-sample-pdfs.js) wired each PDF to its corresponding encounter — 21 attachments across 19 encounters. Handwritten multi-visit PDFs (`trong.pdf`, `tung.pdf`, `thao.pdf`, `dipanh.pdf`) split per-visit with `pdf-lib` before upload; digital device PDFs (AB800, OCT REVO, Medmont) uploaded whole.

Deterministic `ATT-hoso-<sha8>` ids — re-running the script upserts cleanly, never duplicates.

### Orphan paper visits — 4 found, bundled with nearest existing encounter
The handwritten paper records contain visit pages the 2026-05-22 import script didn't pick up. They're attached to the chronologically-nearest existing encounter (filename label lists all dates so the gap is visible), but **no Encounter row was created** for them — pending review/approval pass:

| Patient | Orphan visit date | Bundled with encounter |
|---|---|---|
| Nguyễn Đình Tùng | 28/11/2023 | enc-hoso-tung-3 (11/1/2024) |
| Trần Diệp Anh | 28/9/2024 | enc-hoso-dipanh-2 (24/11/2024) |
| Trần Diệp Anh | 21/2/2025 | enc-hoso-dipanh-2 (24/11/2024) |
| Lê Thu Thảo | 12/5/2026 | enc-hoso-thao-3 (31/3/2026) |

If the review pass decides any orphan needs to be a real visit, create the encounter then move the relevant pages by re-splitting via the script.

## `patient pdf/` and `equipments/` are gitignored (2026-05-23)

Real clinical scans + vendor commercial contracts must never be committed. Drops into either folder:
- `patient pdf/` — encounter scans / device printouts. Used by [attach-sample-pdfs.js](maec-app/server/scripts/attach-sample-pdfs.js).
- `equipments/` — vendor contracts + price quotes. Used by [attach-equipment-contracts.js](maec-app/server/scripts/attach-equipment-contracts.js).

When `git status` shows new files inside either, that's a bug in `.gitignore`, not a thing to commit.

## Diagnostic engine — numeric measurement entry (2026-06-13)

Added per-eye numeric/threshold measurement entry to the diagnostic decision-support module (`maec-app/server/diagnostic/`). Tests now declare `measurements[]` (key/unit/perEye/derives); the clinician types a value per eye (OD/OS/OU), the engine derives the categorical finding via a threshold, and the differential re-ranks. Closes the previously-impossible common case: **blur → auto-refraction → SE-based myopia → glasses** (d-myopia ranks #1). New `engine/deriveFindings.js`; ~17 quantitative tests wired; 12 new derived findings + edges; refraction classified on **spherical equivalent** (Sph+Cyl/2, minus-cyl); VA in **decimal**. Re-entering a measurement supersedes the prior rows (audit kept); the engine runs only on live observations. Verified locally (Docker Mongo): validate-kb, smoke 60/60 (incl. glaucoma/tonometry regression), HTTP E2E incl. supersession, client build all green.

**Deferred / needs action:**
- [ ] **Clinical sign-off on every threshold** — all derive cutoffs (IOP ≥22, Schirmer ≤10/≤5, RNFL <80, CCT <500/>600, axial length ≥26/≤22, ESR ≥50 / CRP ≥10, Ishihara ≤11/14, VA <0.5/≤0.1, K ≥47, etc.) are standard-reference placeholders tagged `[CHECK]` in each finding's `notes`. Review against clinic protocol and adjust the `derives` values in `kb/tests.json`.
- [ ] **Re-seed prod Atlas** when this merges — KB content changed (`node diagnostic/seed.js`, run inside the Railway container via `railway ssh`, not `railway run`).
- [ ] **Hybrid record-only fields** (OCT macula CMT, perimetry MD/PSD, biometry ACD/k_mean, anterior-OCT ACD) are captured but don't yet derive a finding — wire thresholds if/when those should move the differential.
- Built on branch `feat/dx-measurements` (local only, not pushed) — review then merge to master (master auto-deploys to Railway).

### Treatment suggestions after confirmation (2026-06-13)

After a diagnosis is confirmed, the outcome panel now suggests treatments grouped by category in Vietnamese (e.g. Cận thị → Kính gọng / Kính tiếp xúc / Phẫu thuật khúc xạ / Ortho-K). New `kb/treatments.json` vocabulary (171 tokens → nameVi + category, the full set used by all 71 diseases) + `DxTreatment` model + `/kb/treatments` endpoint. Wired `treatments` through the ranker into the differential entry + `DxSession` schema (was dead code before — `OutcomePanel` referenced `treatments` but the engine never surfaced them and the schema would have stripped them). Clinician's picks save to `clinicianOutcome.selectedTreatments` (structured). seed + validate-kb enforce every disease treatment token resolves to the vocabulary.

**Deferred / needs action:**
- [ ] **Review the 171 Vietnamese treatment labels** in `kb/treatments.json` — author-generated, clinically reasonable but not clinic-reviewed. Adjust wording/category as needed.
- [ ] **Deep-link to ordering (declined for now)** — option to jump from a suggested refractive treatment straight into the clinic's Kính catalog / CL package order. Bigger integration with the catalog/ordering system; revisit if the suggestion-only flow proves too manual.

## Diagnostic assistant — per-eye complaint, bilingual, Khám-embedded (2026-06-14)

Three improvements to the dx assistant, on branch `feat/dx-form-bilingual-kham` (3 commits):
1. **Per-symptom / per-eye complaint + single screen.** Symptom rows are keyed individually so the same symptom can be added for both eyes; each row carries its own eye + onset + severity (global "Diễn tiến chung" removed; onset flattened conservatively for the engine, full detail kept in `symptomDetails[]`). Richer Tiền sử (bệnh nền / thuốc / tiền sử gia đình / thời gian / hút thuốc / thai sản). The complaint form is now persistent — `POST /sessions/:id/complaint` re-runs the open session so symptoms found during the exam can be added without losing observations.
2. **Bilingual EN/VN toggle (dx assistant only).** New `LanguageContext` + `pages/diagnostic.i18n.js` (VN→EN map; `t(vn)` is identity in VN). KB data via `pickLang(name/nameVi)`; `treatments.json` gained English `name` for all 171 entries. Toggle in the dx header. App chrome stays Vietnamese.
3. **Embedded in Khám.** `<DiagnosticAssistant embedded>` extracted from the page; a collapsible "🧠 Hỗ trợ chẩn đoán" section in the encounter pane pre-loads the patient/encounter and writes the confirmed diagnosis → Chẩn đoán and treatments → Kết luận (appended) via `PUT /encounters/:id/clinical-notes`.

Verified locally (Docker Mongo): smoke 60/60, validate-kb, client build, Playwright for all three (dup rows + single-screen; EN/VN toggle; Khám embed + write-back) — 0 console errors.

**Deferred / needs action:**
- [ ] **Reseed prod after merge** — `treatments.json` changed (EN names): `railway ssh "cd /app/maec-app/server && node diagnostic/seed.js"`.
- [ ] **Per-eye engine reasoning** — `symptomDetails` (eye/onset/severity per symptom) is captured but the engine still flattens to one global view. A true per-eye differential is a later engine change (user chose capture+flatten for now).
- [ ] **Bilingual rest-of-app** — only the dx assistant is bilingual; the `LanguageProvider` is app-wide so other pages can adopt `useLanguage`/`t` incrementally (~1,260 inline VN strings remain).
- [ ] **Treatment EN names** are humanized from tokens + overrides — review for clinical phrasing alongside the VN `[CHECK]` labels.
