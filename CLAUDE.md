# MAEC — Minh Anh Eye Clinic

Clinic management + EMR + imaging system for **Minh Anh Eye Clinic** (Phòng khám Mắt Minh Anh), a Vietnamese ophthalmology clinic with **2 locations**. Cloned from [dle90/linkrad](https://github.com/dle90/linkrad). Branding rename + initial domain rename completed 2026-05-01 — see [FOLLOWUPS.md](FOLLOWUPS.md) for what's left.

## Goals
- Web admin (clinic operations, billing, reporting) — inherited from LinkRad and being adapted to ophthalmology
- **Mobile staff app** (Expo / React Native) — net new, for doctors/nurses doing exams on tablets/phones
- **Imaging integration** for the clinic's hardware (see [Imaging device map](#imaging-device-map))

## Tech stack
- **Backend**: Node.js + Express + Mongoose, MongoDB Atlas
- **Web frontend**: React 18 + Vite + Tailwind, deployed as static build served by the backend
- **PACS**: Orthanc + OHIF v3.8 (Docker), **deferred until imaging integration starts** — not currently provisioned
- **Mobile**: Expo / React Native, **not yet scaffolded**
- **Hosting**: Railway (Node app), MongoDB Atlas (database). No Cloudflare R2 yet — add when PACS comes online.

## Repo layout
- [maec-app/server/](maec-app/server/) — Express backend (models, routes, lib, middleware, scripts)
- [maec-app/client/](maec-app/client/) — React web admin (pages, components, context)
- [maec-app/pacs/](maec-app/pacs/) — Orthanc + OHIF Docker setup (dormant; deploy when ready)
- [package.json](package.json), [nixpacks.toml](nixpacks.toml), [railway.json](railway.json) — Railway build/deploy config
- [FOLLOWUPS.md](FOLLOWUPS.md) — living doc of deferred work; check before starting features, append before finishing

## Local dev
```bash
# One-time install
npm --prefix maec-app/server install
npm --prefix maec-app/client install

# Run (Windows)
maec-app/start.bat   # spawns server (3001) + client (5173)
```
Server reads `MONGODB_URI` from environment. Local default is `mongodb://localhost:27017/maec` ([db.js](maec-app/server/db.js)). Production deploys point at MongoDB Atlas. Demo user passwords are `maec2026`.

## Deploy
Railway auto-deploys the **maec** service in the **maec** project on every push to `master` of [github.com/dle90/maec](https://github.com/dle90/maec). Build steps live in [nixpacks.toml](nixpacks.toml); start command in [railway.json](railway.json). Env vars are managed in Railway dashboard.

## Visual design system
House style baseline — match when touching adjacent pages:
- Page background: `bg-gray-50`
- Cards: white, `rounded-xl`, soft shadow
- Tabs: pill style, blue primary
- Primary action color: `blue-600`
- Sidebar dark navy `#1e3a5f`, white logo "Minh Anh Eye Clinic"
- App header: "Phòng khám Mắt Minh Anh"
- Vietnamese-first UI; Vietnamese strings inline in JSX (no i18n framework yet)

## Imaging device map (Minh Anh hardware)
| Device | Type | Integration path |
|---|---|---|
| DRS Plus (CenterVue/iCare) | Fundus camera | Native DICOM → PACS (when provisioned) |
| Optopol Revo | OCT | DICOM → PACS — **verify DICOM module is licensed on the unit** |
| Medmont | Cornea topographer | PDF/image attachment to encounter |
| MediWorks AB800 | Ocular biometer (IOL calc) | Structured data + PDF — **confirm CSV/XML export options** |
| SBM Sistemi IDRA | Ocular surface analyzer | PDF + structured measurements |

Two integration patterns total: **DICOM path** (PACS ingestion) for fundus + OCT, **document path** (watched-folder ingestor → encounter attachment) for the other three.

## Documented patient workflows (4)
The clinic operates 4 documented exam flows. These drive `Encounter.examType`, the report-template `EXAM_TYPES` dropdown, and the future encounter form design. See FOLLOWUPS for the deferred form design work.

1. **Khám mắt cơ bản** — basic eye exam
2. **Khám khúc xạ + thị giác hai mắt** — refraction + binocular vision (includes 45-min cycloplegic wait)
3. **Khám kính tiếp xúc (mới)** — new contact-lens fitting
4. **Tái khám kính tiếp xúc** — contact-lens follow-up

Common station modules: Tiếp đón → Chụp khúc xạ tự động → Đo thị lực + khúc xạ → Đo nhãn áp (portable handheld) → Khám sinh hiển vi (anchor station) → Optional add-ons (bản đồ giác mạc / OCT / đáy mắt / thị trường) → Tư vấn kính → Mua thuốc + thanh toán. Two physical zones: **Phòng ngoài** (reception, glasses consult) and **Phòng trong** (exam, payment).

## Domain language (post-rename)
- **`Encounter`** model (formerly `Study`) — one eye visit. Schema variable `encounterSchema`. Mongoose collection `encounters`.
- **`examType`** field on Encounter + ReportTemplate — populated from the 4 workflows above (free-form String).
- **`modality`** field is now free-form — was `enum: ['CT','MRI','XR','US']` (radiology). Will eventually move into a per-imaging sub-array; see FOLLOWUPS deferred field renames.
- **Sidebar**: "Khám bệnh" group (was "RIS-PACS"); item label "Lượt khám" (was "Ca chụp"). URL `/ris` kept as a slug.
- **Removed**: Teleradiology / TeleradReading / TeleradAdmin pages and TeleradTabsContext (eye clinics read in-clinic).

## Open TODOs (priority order)

P0 + most of P1 was completed 2026-05-01. See [FOLLOWUPS.md](FOLLOWUPS.md) for the full done/deferred list. Top remaining items:

### P0 — User action required
- [ ] **MongoDB Atlas** — provision cluster + DB, set `MONGODB_URI` in Railway. Cannot be done by Claude Code.
- [ ] **Verify first deploy** — push to GitHub master; confirm Railway build succeeds; visit URL; log in.
- [ ] **sites.json** — fill in real district names + investment data for the 2 clinic locations (currently placeholders).

### P1 — Deferred until workflow walkthrough is complete
- [ ] **Encounter form** (replaces the radiology ReportEditor in RIS.jsx) — composable from station modules; needs walkthrough alignment first
- [ ] **Eye-specific report template seed content** — populate templates for each `examType`
- [ ] **Cycloplegic 45-min wait** UX (timer/queue) — required by 2 of the 4 documented workflows
- [ ] **Deep field renames** on `Encounter` (`studyDate` → `encounterDate`, `radiologist` → `doctor`, `studyUID` → sub-array `imagingStudies[]`)

### P2 — Imaging
- [ ] Provision Orthanc + OHIF Railway services + Cloudflare R2 bucket (defer until first device is wired)
- [ ] Document-path watched-folder ingestor (Medmont, AB800, IDRA) → encounter attachment
- [ ] DICOM-path verification: sample DICOM from DRS Plus and Revo into Orthanc + OHIF render
- [ ] **IOL calculation workflow**: AB800 biometry → formula → surgical plan attached to encounter
- [ ] **Compare-over-time** UI component (meibography, fundus, OCT) — design once, reuse

### P3 — Mobile staff app
- [ ] Scaffold Expo / React Native project (sibling to `maec-app/`?)
- [ ] Share TypeScript types between mobile + backend
- [ ] v1 scope: today's schedule, patient intake, exam capture (portable IOP follows the patient — UX should reflect), phone camera capture, encounter sign-off, billing

## Conventions / preferences
- Match the **visual design system** (above) when touching admin pages.
- Vietnamese-first UI strings — keep inline in JSX, no i18n framework. Use **"Phòng khám Mắt Minh Anh"** for full brand in user-facing UI; **"MAEC"** in tight contexts and code identifiers.
- Append to [FOLLOWUPS.md](FOLLOWUPS.md) when leaving deferred work behind; check it before starting a feature.
- Don't run destructive scripts against the production Atlas DB without explicit confirmation.
