# MAEC Follow-ups

Living doc of deferred work / known limits. Append before finishing any feature; check before starting one.

## Open package / pricing questions (filed 2026-05-01, awaiting MAEC review)

Per user's "keep all, consolidate later" — these were preserved as-is from the price sheet but need de-duplication or refinement:

1. **PKG-2 (350k both cyclo + TG2M) vs PKG-2A (350k cyclo only) vs PKG-2B (350k TG2M only)** — sheet has 2 separate 350k variants for kids, my model also keeps the bundled-both variant. Decide: keep all three, or consolidate.

2. **PKG-OK-RECHECK 300k flat vs PKG-4 dynamic (free / 350k / 600k)** — both for ortho-K re-exams but different pricing models. Sheet's flat 300k is likely the customer-facing price; PKG-4's dynamic logic was design speculation. Reconcile: probably drop PKG-4 and keep PKG-OK-RECHECK, OR position PKG-4 as the "auto-discount based on entitlement history" variant of PKG-OK-RECHECK.

3. **PKG-ATROPIN (1.5M)** — bundle services are placeholder (autoref + refract + IOP + slit + topo + OCT-trước + myopia consult). Need from MAEC: exactly which services included up-front, follow-up schedule, entitlement length (1 year? 6 months?), whether atropine drops product is bundled or separate.

4. **PKG-RECHECK (Phí tái khám 150k)** — my placeholder bundles only refract + slit. Need from MAEC: exact services, time window for eligibility (e.g. within 30 days of any prior visit?), whether it stacks with other tái khám packages.

5. **OCT pricing — "tổng" implicit** — sheet has OCT trước (400k) / OCT sau (400k) / OCT tổng (800k) standalone, plus 3 in-package variants (300/300/600k). Currently modelled as 2 services (#12 trước, #13 sau) with `inPackagePrice` discount. The "tổng" combo isn't a 3rd service — it's just both selected. Confirm OK, or do we need a separate "OCT tổng" service code that bundles both for a single bill line?

6. **SVC-BIOMETRY 250k** — sheet does not list biometry. Price is placeholder. For cataract pre-op pipeline only.

7. **Soft CL fitting** — confirmed à la carte (no package). PKG-3A/3B are ortho-K specific — name "Khám CL Ortho-K" should not be ambiguous. If MAEC adds soft-CL package later, model as PKG-CL-SOFT distinct from PKG-3A/3B.

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

## Action required from user (P0)

### MongoDB Atlas — provision (cannot be done by Claude Code)
Pre-deploy blocker. Steps:
1. Log into MongoDB Atlas. Either create a new project "MAEC" or use existing org cluster.
2. Create database user (read/write on `maec` db).
3. Whitelist Railway egress IPs OR set Network Access to `0.0.0.0/0` (less secure but simpler — fine for early-stage).
4. Copy connection string. Format: `mongodb+srv://USER:PASSWORD@cluster.mongodb.net/maec?retryWrites=true&w=majority`.
5. Set `MONGODB_URI` env var in Railway dashboard for the `maec` service.

### Railway — verify first deploy
1. Push current branch to GitHub `dle90/maec` master.
2. Railway auto-deploys (build steps in [nixpacks.toml](nixpacks.toml), start in [railway.json](railway.json)).
3. Watch build logs. Common failures: missing env var, build path mismatch.
4. Visit Railway-assigned URL. Confirm app loads, login screen shows "Phòng khám Mắt Minh Anh".
5. Try logging in with a demo user from [users.json](maec-app/server/data/users.json). New password: `maec2026`.

### sites.json — partially filled (2026-05-01)
Real clinic locations are now **Trung Kính** (Cầu Giấy, Hà Nội) and **Kim Giang** (Thanh Xuân, Hà Nội). Still missing: real `startMonth`, `totalInvestment`, `bank`, `bankLoan`, ownership notes — all currently 0/empty in [sites.json](maec-app/server/data/sites.json). User to fill when financial data is ready (or edit in-app at `/sites` if admin).

### Demo data still references old LinkRad regions
Re-seeded users.json on 2026-05-01 (20 users, departments remapped to Trung Kính / Kim Giang; doctor dept changed to "Mắt"; 3 `nv_th*`/`tp_th` users dropped). However, these LinkRad-era demo data files **still reference old usernames or 3-region structure**:

- [tasks.json](maec-app/server/data/tasks.json) — task assignments reference dropped usernames (`nv_hd1`, `nv_cm1`, `nv_th*` etc.). Tasks tab will show "unknown user" entries.
- [annual-pl.json](maec-app/server/data/annual-pl.json), [annual-cf.json](maec-app/server/data/annual-cf.json), [breakeven.json](maec-app/server/data/breakeven.json) — financials structured around 3 LinkRad regions; needs re-modelling for 2 MAEC sites.
- [SitePL.jsx](maec-app/client/src/pages/SitePL.jsx) — same 3-region assumption baked in.
- Server scripts ([sanity-check-hr.js](maec-app/server/scripts/sanity-check-hr.js), [sanity-check-portals.js](maec-app/server/scripts/sanity-check-portals.js), [seed-catalogs-mock.js](maec-app/server/scripts/seed-catalogs-mock.js), [seed-portals.js](maec-app/server/scripts/seed-portals.js), [seed-hr.js](maec-app/server/scripts/seed-hr.js), [seed.js](maec-app/server/scripts/seed.js)) — test fixtures use old usernames.
- [Registration.jsx](maec-app/client/src/pages/Registration.jsx), [PartnerReferralDrawer.jsx](maec-app/client/src/components/PartnerReferralDrawer.jsx) — UI defaults reference old regions/doctors.

Cleanup is bigger than mechanical search/replace because the financial model needs reshaping for 2 sites instead of 3 regions. Defer until staffing + per-site economics are discussed in workflow walkthrough.

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
