# MAEC Follow-ups

Living doc of deferred work / known limits. Append before finishing any feature; check before starting one.

## Mobile responsive — Phase 1 done, Phase 2+ pending (2026-05-01)

The native Expo/RN app (P3 in CLAUDE.md) is still not scaffolded. Until then we want the web app to be acceptably usable on mobile browsers. **Phase 1 done; first pass looked OK — user wants polish on Đăng ký services view and the rest of the data-heavy pages.**

### Phase 1 — done
- [Layout.jsx](maec-app/client/src/components/Layout.jsx): sidebar becomes off-canvas drawer with backdrop below `lg` (1024px), auto-closes on nav. Header verbose elements pushed to `lg`/`xl` (long title, Chế độ xem badge, currency text). Search button → icon-only below `md`.
- [Registration.jsx](maec-app/client/src/pages/Registration.jsx): HeaderStepper wraps + hides /tiếp đón sub-label and user/date on mobile. Body row stacks `flex-col lg:flex-row`. TodayRail goes `w-full lg:w-80` with `max-h-60` on mobile. SearchView padding scales `px-3 sm:px-6`.

### Phase 2 — pending (data-heavy pages)
Tables overflow horizontally and modals exceed 375px viewports. Files flagged by audit:
- **ThuNgan.jsx** — 8-column billing table, no `overflow-x-auto` wrapper
- **Billing.jsx** — `w-80` left invoice panel doesn't reflow; right-side tables need scroll wrapper
- **Kham.jsx** — filter row has `min-w-[240px]` inputs; encounter list rows are dense
- **HRManagement.jsx** — permission matrix `min-w-[140px]` columns + `max-w-2xl` modals overflow at 375px
- **Inventory.jsx** — `max-w-[1600px]` container; some views have `overflow-x-auto`, others don't
- **Catalogs.jsx** — dynamic table per catalog type; right-side drawer is fine but content cramps

Pattern for each: wrap tables in `overflow-x-auto`, cap modals to `max-w-[calc(100vw-2rem)] sm:max-w-2xl`, scale `min-w-[…]` filter inputs to `w-full sm:min-w-[240px]`.

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

## Tổng quan dashboard — content TBD (placeholder live 2026-05-02)

The sidebar's first item ("Tổng quan" 📊) currently routes to [Dashboard.jsx](maec-app/client/src/pages/Dashboard.jsx) which is just a welcome card ("Xin chào, ..."). The user asked for a real Tổng quan but said "we'll go over what should be in there later." When that conversation happens, candidates to surface:

- Today: # check-ins, # đang khám, # hoàn thành, doanh thu
- Per-site split (Trung Kính vs Kim Giang)
- Inventory red flags: items below min stock, lots near expiry
- Pending: BN chờ thanh toán (status='completed' không in [paid, cancelled])
- Quick links to Đăng ký / Khám / Thu ngân
- Possibly per-role variants (Lễ tân sees check-in queue, BS sees clinical queue, Kho sees stock alerts)

There are existing unfinished dashboards ([TodayDashboard.jsx](maec-app/client/src/pages/TodayDashboard.jsx), [DashboardClinical.jsx](maec-app/client/src/pages/DashboardClinical.jsx), [DashboardOps.jsx](maec-app/client/src/pages/DashboardOps.jsx)) that may have salvageable patterns — currently routed under Khác → Inactive or accessible via /reports redirects.

## Devices module — deferred (split out of Service 2026-05-02)

`Service.station`, `Service.role`, `Service.devices` were dropped from the [Service](maec-app/server/models/Service.js) schema and the [Catalogs.jsx](maec-app/client/src/pages/Catalogs.jsx) services config on 2026-05-02 (user: "we don't need station, role, devices here"). They were design notes baked into the catalog, never queried, never edited in production.

When the Devices module is built, model it as its own collection (not nested on Service). Likely shape:

- **`Device`** — physical hardware unit. Fields: `code`, `name`, `model`, `vendor`, `siteId` (Trung Kính / Kim Giang), `category` (auto-ref / slit-lamp / OCT / topo / fundus / biometer / etc.), `serialNumber`, `licenseStatus` (e.g. Optopol Revo DICOM-module licensed?), `status` (active / repair / retired), `lastServiceDate`.
- **`Service ↔ Device` link** — many-to-many. A service can be performed on multiple device types (e.g. SVC-IOP runs on iCare or Goldmann); a device can serve multiple services (e.g. Optopol Revo covers OCT-ANT + OCT-POST + OCT-FULL + biometry on some configs). Probably a `ServiceDeviceCompatibility` join collection or an array of device-category codes on Service.
- **Station / role** — these were *workflow* metadata, not device metadata. They probably belong on the Encounter form module config (which station each service is performed at) and on the user/role permission map (who can perform it), not on Device.

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
