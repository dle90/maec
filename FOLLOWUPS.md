# MAEC Follow-ups

Living doc of deferred work / known limits. Append before finishing any feature; check before starting one.

## Initial clone from LinkRad (2026-05-01)

This repo was cloned from `dle90/linkrad` with infrastructure-level renames only. The radiology-specific application code is still in place and needs progressive replacement.

### Infrastructure renames done
- `package.json` names: linkrad → maec (root, app, server, client)
- DB name in [maec-app/server/db.js](maec-app/server/db.js): `mongodb://localhost:27017/maec`
- Build paths: `linkrad-app/` → `maec-app/` in [nixpacks.toml](nixpacks.toml), [railway.json](railway.json), root [package.json](package.json)
- OHIF extras file: `linkrad-extras.js` → `maec-extras.js` (file renamed, [Dockerfile](maec-app/pacs/ohif/Dockerfile) updated; **internal references inside maec-extras.js not yet renamed**)
- [start.bat](maec-app/start.bat) window titles
- Stripped: `server/.env` (secrets), `client/dist/` (stale build), `server/test-flow1/` (radiology workflow tests)

### Branding pass — NOT done
~50 files still contain "LinkRad" / "linkrad" strings — UI titles, demo text, comments, log messages. Grep `linkrad|LinkRad` to enumerate. Plan a single rename pass once the eye-clinic branding is decided (logo, product name — "MAEC" placeholder for now).

### Radiology → ophthalmology domain rename — NOT done
Significant model/route/page renames pending. See [docs below](#domain-rename-plan).

## Domain rename plan

### Models to repurpose (schema mostly transfers, terminology changes)
- `Study` → `Encounter` — an eye visit covers multiple sub-tests in one record
- `Report` + `ReportTemplate` — keep engine, replace radiology templates with eye templates (general exam, dry-eye, pre-cataract, glaucoma follow-up, retina)
- `KeyImage`, `StudyAnnotation` — repurpose for meibography compare and fundus markup

### Routes to adapt
- [routes/ris.js](maec-app/server/routes/ris.js) → ophthalmology exam workflow (intake → sub-tests → sign-off)

### Pages to rename / replace
- `RIS.jsx` → ophthalmology patient flow
- `RadiologyReports.jsx` → ophthalmology reports
- `CriticalFindings.jsx` → eye-specific critical findings (suspected retinal detachment, acute glaucoma, etc.)

### Pages to drop
- `Teleradiology.jsx`, `TeleradReading.jsx`, `TeleradAdmin.jsx` — eye clinics read in-clinic
  - Salvage the multi-site ops view pattern from `TeleradAdmin` for the 2-location dashboard before deleting

## New work to scope

### Ophthalmology exam form
Replaces radiology "study reading" view. Tabbed:
- Refraction OD/OS (sphere, cylinder, axis, add)
- IOP (Goldmann / iCare / NCT)
- Slit lamp findings
- Fundus exam findings
- OCT / topography summary

### Imaging device adapters (Minh Anh hardware)
| Device | Path | Status |
|---|---|---|
| DRS Plus fundus camera | DICOM into existing PACS | Plug-and-play, verify |
| Optopol Revo OCT | DICOM into existing PACS | **Verify DICOM module licensing on the unit** |
| Medmont topographer | Document attachment (PDF) | Build watched-folder ingestor |
| MediWorks AB800 biometer | Structured data + PDF | **Confirm export options (PDF only or CSV/XML)** |
| SBM Sistemi IDRA | Document attachment (PDF) + structured measurements | Build watched-folder ingestor |

### IOL calculation workflow
Pulls AB800 biometry → applies formula → attaches surgical plan to encounter. Important for cataract pipeline.

### Compare-over-time view
Same component reused for: meibography progression, fundus side-by-side, OCT thickness change. Design once.

### Mobile staff app (Expo / React Native)
Net-new build, talks to the same backend. v1 scope:
- Today's schedule
- Patient intake
- Exam capture (refraction / IOP / slit lamp findings)
- Phone camera capture for ad-hoc images
- Encounter sign-off
- Billing

## Deployment
- New Railway project needed (do not point at LinkRad's). Update [reference_railway memory](../../.claude/projects/d--work-LinkRad/memory/project_railway.md) once MAEC's Railway project + URLs are set.
- New MongoDB database. Local dev currently points at `mongodb://localhost:27017/maec` per [.env.example](.env.example) — production Atlas DB needs to be provisioned separately from LinkRad's.
