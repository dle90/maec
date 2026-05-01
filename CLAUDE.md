# MAEC — Minh Anh Eye Clinic

Clinic management + EMR + imaging system for **Minh Anh Eye Clinic**, a Vietnamese ophthalmology clinic with **2 locations**. Cloned from [dle90/linkrad](https://github.com/dle90/linkrad) — see [FOLLOWUPS.md](FOLLOWUPS.md) for rename/replace TODOs from the LinkRad lineage.

## Goals
- Web admin (clinic operations, billing, reporting) — inherited from LinkRad
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
Server reads `MONGODB_URI` from environment. Local default is `mongodb://localhost:27017/maec` ([db.js](maec-app/server/db.js)). Production deploys point at MongoDB Atlas.

## Deploy
Railway auto-deploys the **maec** service in the **maec** project on every push to `master` of [github.com/dle90/maec](https://github.com/dle90/maec). Build steps live in [nixpacks.toml](nixpacks.toml); start command in [railway.json](railway.json). Env vars are managed in Railway dashboard.

## Visual design system (inherited from LinkRad)
House style baseline — match when touching adjacent pages:
- Page background: `bg-gray-50`
- Cards: white, `rounded-xl`, soft shadow
- Tabs: pill style, blue primary
- Primary action color: `blue-600`
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

## Domain language
Cloned codebase still uses **radiology terminology** that needs swapping for ophthalmology:
- `Study` model → `Encounter` (an eye visit covers refraction + slit lamp + OCT + fundus in one record)
- `RIS.jsx`, `RadiologyReports.jsx`, `CriticalFindings.jsx` → ophthalmology equivalents
- `Teleradiology*` pages → drop (eye clinics read in-clinic)
- `Report` + `ReportTemplate` engine kept; templates need eye-specific replacements

See [FOLLOWUPS.md → Domain rename plan](FOLLOWUPS.md#domain-rename-plan) for the full list.

## Open TODOs (priority order)

### P0 — Foundation (next session)
- [ ] **MongoDB Atlas** — provision new cluster (or new DB on existing org cluster), set `MONGODB_URI` in Railway
- [ ] **Verify first deploy** — push triggers Railway build; visit Railway URL and confirm app loads
- [ ] **Branding string sweep** — replace ~50 occurrences of "LinkRad"/"linkrad" in JSX titles, demo text, comments. Decide product display name first (placeholder: "MAEC")

### P1 — Domain rename
- [ ] Drop `Teleradiology.jsx`, `TeleradReading.jsx`, `TeleradAdmin.jsx` (salvage multi-site pattern from `TeleradAdmin` first → 2-location ops view)
- [ ] Rename `Study` model → `Encounter` (schema, routes, frontend references)
- [ ] Replace radiology report templates with eye templates: general exam, dry-eye, pre-cataract, glaucoma follow-up, retina
- [ ] Build ophthalmology exam form: tabbed Refraction OD/OS, IOP, slit lamp, fundus, OCT/topo summary
- [ ] Rename `RIS.jsx`, `RadiologyReports.jsx`, `CriticalFindings.jsx` to ophthalmology equivalents

### P2 — Imaging
- [ ] Provision Orthanc + OHIF Railway services + Cloudflare R2 bucket (defer until first device is wired)
- [ ] Document-path watched-folder ingestor (Medmont, AB800, IDRA) → encounter attachment
- [ ] DICOM-path verification: get a sample DICOM from DRS Plus and Revo; confirm Orthanc accepts; confirm OHIF renders
- [ ] **IOL calculation workflow**: AB800 biometry → formula → surgical plan attached to encounter
- [ ] **Compare-over-time** UI component (meibography, fundus, OCT) — design once, reuse

### P3 — Mobile staff app
- [ ] Scaffold Expo / React Native project (sibling to `maec-app/`?)
- [ ] Share TypeScript types between mobile + backend
- [ ] v1 scope: today's schedule, patient intake, exam capture, phone camera capture, encounter sign-off, billing

## Conventions / preferences
- Match the LinkRad **visual design system** (above) when touching admin pages.
- Vietnamese-first UI strings — keep inline in JSX, no i18n framework.
- Append to [FOLLOWUPS.md](FOLLOWUPS.md) when leaving deferred work behind; check it before starting a feature.
- Don't run destructive scripts against the production Atlas DB without explicit confirmation (same rule as LinkRad — assume prod is being used in dev unless stated otherwise).
