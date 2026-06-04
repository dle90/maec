# Clinical primer — WIP plan & handoff

Working doc for the MAEC clinical-primer build. **Delete this file when work
completes.** It captures the framework decisions and the structure agreed with
the user so the work can be resumed from any machine.

Companion to (not yet created):
- `docs/clinical-anatomy.html` — visual anatomy reference
- `docs/clinical-primer.md` — hub
- `docs/clinical/*.md` — sub-specialty deep-dives

Original plan file (Windows-local, not portable):
`C:\Users\ghost.vn\.claude\plans\i-want-a-practical-hazy-ocean.md`

## Status — 2026-06-04 (updated)

Deliverables 1 + 2 shipped. **Paused at the approved review point** before the
deep-dives.

**Build order (all 4 approved):**
1. `docs/clinical-anatomy.html` — visual anatomy with 8 SVG diagrams — ✅ **done**
   (1048 lines; 8 inline SVGs, 9-service legend, hover-highlight + click-detail
   card, VN-EN table auto-built from the diagram data, light theme, no network)
2. `docs/clinical-primer.md` — hub doc — ✅ **done** (384 lines; all 8 sections;
   Hooks-for-MAEC verified against the real `Encounter` schema)
3. ⏸️ **PAUSED HERE** — `docs/clinical/*.md` 8 sub-specialty deep-dives. Awaiting
   user review of depth/tone on the hub before authoring (see below).
4. Append clinical-primer entry to `FOLLOWUPS.md` + `serviceFindings[]` schema
   design proposal — pending (lands with / after the deep-dives).

User approved pausing after the hub for review of depth/tone before deep-dives are
written. **Resume by:** review `clinical-primer.md` + open `clinical-anatomy.html`;
if depth/tone is right, author the 8 deep-dives in the build order in
`## Deliverable 3`, then do deliverable 4 and delete this plan file.

## Context — why this doc exists

The repo already has `docs/eye-exam-primer.md`, which explains the **equipment +
jargon side**: why each machine in the inventory exists, what it measures, VN ↔
EN dictionary. Deliberately stays away from the medicine itself.

The clinical primer is the parallel doc for the **medicine the equipment serves**.
Purpose, in user's working context:
- Have competent conversations with doctors at MAEC and with vendors / inspectors
- Make better EMR design decisions (Encounter fields, exam forms, report
  templates, cycloplegic timers, IOL workflow) because the underlying clinical
  logic is understood, not just device output
- Plan future modules (compare-over-time UI, IOL calc, dry-eye workup, retinal
  screening, peds myopia-control tracker) with the right primitives
- Read society guidelines (AAO PPP, NICE, EuRetina) without bouncing off jargon
- Eventually: **AI-assisted diagnosis** — service-decomposed classifiers behind
  a differential-diagnosis UI

## The framework — load-bearing concepts agreed with user

### Eye as a 4-job system

```
1. Get light to the back     (optical path: cornea → lens → vitreous)
2. Detect light              (retina: photoreceptors → bipolar → ganglion)
3. Send signal to brain      (optic nerve → chiasm → tract → cortex)
4. Coordinate two eyes       (extraocular muscles + brainstem + cortex)
```

Plus **support systems** that keep the data plane alive:
- Pressure / fluid (aqueous production + outflow) — fails → glaucoma
- Surface / lubrication (tear film, lids, conjunctiva) — fails → dry eye, infection
- Vascular (retinal + choroidal blood supply) — fails → diabetic retinopathy, RVO/RAO
- Immune (uvea, lacrimal) — mis-fires → uveitis
- Autonomic (sympathetic + parasympathetic) — fails → Horner, Adie, accommodation

### The 9-service architecture (engineering-lens decomposition)

Two planes:

```
DATA PLANE
  • OPTICAL STACK        cornea → aqueous → pupil → lens → vitreous
  • SENSOR (retina)      RPE + photoreceptors + bipolar + ganglion
                         ├─ macula sub-service (high-res central)
                         └─ periphery
  • TRANSPORT            optic nerve → chiasm → tract → LGN → V1

CROSS-PLANE
  • COORDINATION         6 EOMs × 2 eyes, CN III/IV/VI, brainstem, fusion

SUPPORT PLANE
  • SURFACE              tear film + lids + conjunctiva
  • PRESSURE             ciliary production → trabecular outflow
  • VASCULAR             central retinal a/v + choroidal supply
  • IMMUNE               uvea + lacrimal + lid lymphoid tissue
  • AUTONOMIC            sympathetic + parasympathetic
```

Each disease drops into exactly one (or rarely two) service. Almost 1:1 with the
sub-specialty list, but organized by *which service broke* instead of by
anatomical chapter.

**Caveat — shared hardware.** Services aren't fully independent. The **uvea**
(iris + ciliary + choroid) is one continuous vascular tissue that participates
in pressure, optical, and vascular at once. Inflammation in one part spills.
That's why compound diseases exist (e.g. **neovascular glaucoma** = vascular
failure → new vessels grow into pressure service → IOP rockets).

**Cross-service cascades to model explicitly:**
- Glaucoma: pressure → transport (optic nerve damage)
- Diabetic retinopathy: vascular → sensor (retinal capillary failure)
- Uveitis: immune → optical + pressure + vascular simultaneously
- NAION: vascular → transport (optic nerve infarct)

### The diagnostic spine

```
COMPLAINT → candidate SERVICES → candidate COMPONENTS → TESTS → DIAGNOSIS → TREATMENT
```

Read left-to-right in a real clinic visit. Read right-to-left when designing
software (encounter forms, report templates, screening pipelines).

### The 6-7 complaint subtrees (each maps to a different service subtree)

| VN | EN | Suggests broken service(s) |
|---|---|---|
| Mờ | Blur | Optical OR Sensor OR Transport |
| Đau | Pain | Surface, Pressure (acute glaucoma), Immune |
| Đỏ | Red eye | Surface, Immune (anterior chamber) |
| Khô / cộm | Dry / gritty | Surface |
| Nhìn đôi | Double vision | Coordination |
| Chớp sáng / ruồi bay | Flashes / floaters | Sensor (detachment risk) |
| Mất thị trường | Visual field loss | Sensor, Transport, brain |
| (none) | Asymptomatic screening | Pressure, Vascular silently fail |

### Three things the engineering instinct must keep, one to drop

**Keep**:
- Services have *interfaces* and *failure cascades*. Know the dependency graph.
- Services have *SLOs* (IOP 10–21 mmHg, VA 20/20, TBUT >10s). Tests measure SLOs.
- Cheap broad tests run first (auto-ref, slit-lamp); expensive specific tests
  (OCT, VF) confirm. The "min testing" goal is really min *expensive* testing —
  there's a floor of screening tests every patient gets regardless of complaint.

**Drop**:
- The idea that services are fully independent. Shared hardware (uvea) means
  compound diseases. The AI/diagnostic architecture needs an inter-service
  reasoning layer, not just per-service classifiers + naive voting.

## Anatomy floor — the ~30 named structures that matter

Everything in the diagnostic spine and every disease deep-dive refers back to
this list. Other structures get introduced inline when first needed.

```
OUTER WALL (3 concentric layers — fibrous, vascular, neural)
  • Cornea + Sclera                    fibrous outer shell
  • Iris + Ciliary body + Choroid      = the UVEA (vascular middle)
  • Retina                             neural inner

CONTENTS (3 chambers, front to back)
  • Anterior chamber       cornea ↔ iris       aqueous
  • Posterior chamber      iris ↔ lens         aqueous source
  • Vitreous cavity        lens ↔ retina       gel

OPTICAL STACK
  • Cornea           +43 D fixed lens (does 2/3 of focusing)
  • Pupil            aperture (CN III constricts, sympathetic dilates)
  • Crystalline lens +20 D variable (accommodates via ciliary muscle)

RETINAL MICRO (3 load-bearing layers out of 10)
  • RPE                under photoreceptors; pigment + recycling
  • Photoreceptors     rods (peripheral) + cones (macula)
  • Ganglion + RNFL    output neurons; their axons → optic nerve
  • Macula / Fovea     central 5 mm / 1.5 mm — sharp vision

DRAINAGE (the glaucoma circuit)
  ciliary body → posterior chamber → pupil → anterior chamber
              → angle → trabecular meshwork → Schlemm's canal
              → episcleral veins

VASCULAR (two separate trees)
  • Central retinal artery/vein  → inner retina (ganglion, bipolar)
  • Choroidal circulation        → outer retina (photoreceptors, RPE)
  (two supplies, two failure modes)

CRANIAL NERVES (5 that matter for the eye)
  • CN II  optic           vision out
  • CN III oculomotor      4 of 6 muscles + pupil constrict + lid up
  • CN IV  trochlear       superior oblique only
  • CN VI  abducens        lateral rectus only
  • CN V   trigeminal      corneal sensation (blink reflex)
  • CN VII facial          orbicularis (blink motor)
  • Sympathetic chain      pupil dilate + Müller's lid

VISUAL PATHWAY (lesion localization)
  retina → optic nerve → CHIASM (nasal fibers cross)
       → optic tract → LGN → optic radiations → V1 cortex
  (each lesion site → characteristic field defect)

EXTRAOCULAR MUSCLES (6 per eye, plus levator)
  4 recti (sup/inf/med/lat) + 2 obliques (sup/inf) + levator palpebrae
```

User OK'd expanding beyond ~30 if needed for surgical-conversation depth. ~50
is the rough ceiling.

## Color system for the 9 services (used throughout HTML + markdown)

Distinct, accessible. Same hex used in every diagram and in the markdown
hub/deep-dives so a reader builds visual recognition.

| Service | Color | Hex |
|---|---|---|
| Optical | blue | `#2563eb` |
| Sensor | purple | `#7c3aed` |
| Transport | indigo | `#4338ca` |
| Coordination | teal | `#0d9488` |
| Surface | cyan | `#0891b2` |
| Pressure | orange | `#ea580c` |
| Vascular | red | `#dc2626` |
| Immune | green | `#16a34a` |
| Autonomic | amber | `#ca8a04` |

## Deliverable 1 — `docs/clinical-anatomy.html`

Self-contained single HTML file. No external CSS, no fonts, no images. Inline
SVG + inline CSS + minimal vanilla JS for hover/expand. Opens by double-click.

### File structure

```
[Header / title / brand]
[Top TOC + navigation]
[Section 0: The 9 services — color legend card]
[Section 1: Eye sagittal cross-section]
[Section 2: Anterior segment + aqueous flow]
[Section 3: Retinal layers cross-section]
[Section 4: Macula topology]
[Section 5: Vascular trees (CRA vs choroidal)]
[Section 6: Visual pathway + field defects]
[Section 7: Extraocular muscles + H-pattern]
[Section 8: Cranial nerve summary]
[Section 9: Comprehensive VN-EN anatomy table]
[Footer: links back to clinical-primer.md and eye-exam-primer.md]
```

### 8 SVG diagrams to draw

1. **Eye sagittal cross-section** — canonical labeled cutaway. Outer wall
   (cornea + sclera), uvea layer (iris + ciliary + choroid), retina, lens,
   anterior chamber, posterior chamber, vitreous, optic nerve exit. Tints by
   service.
2. **Anterior segment + aqueous flow** — zoom on cornea/iris/lens/ciliary,
   trabecular meshwork, Schlemm's canal. Arrows show aqueous path:
   ciliary → posterior chamber → pupil → anterior chamber → angle → trabecular
   → Schlemm. This is the same diagram for optical-stack anatomy AND for the
   glaucoma drainage circuit. Pressure-service color overlay.
3. **Retinal layers cross-section** — 10 layers from ILM (top, vitreous side)
   to RPE/choroid (bottom, blood side). Highlight RPE, photoreceptors, RNFL as
   the 3 load-bearing layers. Show direction of light entry (top) vs detection
   (bottom). Sensor-service color overlay.
4. **Macula topology** — concentric rings (foveola → fovea → parafovea →
   perifovea → peripheral retina). Cone density falloff as a small inline graph.
5. **Vascular trees** — two side-by-side circulations. Central retinal artery
   tree (inner retina supply). Choroidal supply (outer retina, photoreceptors,
   RPE). Vascular-service color overlay.
6. **Visual pathway with field defects** — the classic neuro-ophth diagram.
   Eyes on left, brain on right. 6 numbered lesion sites along the pathway,
   each with the field-defect shape it produces drawn as a 2-circle bilateral
   pictogram. Single most-useful diagram in the doc. Transport-service color.
7. **Extraocular muscles + H-pattern** — 6 muscles per eye with primary action
   arrows. Innervation color-coded by CN (III / IV / VI). The H-pattern the
   doctor traces during the motility exam. Coordination-service color.
8. **Cranial nerve summary** — schematic showing each CN's role for the eye.
   CN II/III/IV/V/VI/VII + sympathetic chain. What lesions show up where.

### Style notes
- Bilingual labels (English first, VN gloss in parens or below)
- Leader lines from labels to structures
- Hover on a label → highlight the structure (vanilla JS)
- Click on a structure → expandable detail card with VN gloss + which service
- Light theme only (clinic use, no dark-mode complexity)

### Accuracy bar
Schematic, not medical-illustration realism. Labels and relationships must be
correct. Approximate proportions OK. Anything uncertain gets a `[CHECK]` flag
inline.

## Deliverable 2 — `docs/clinical-primer.md` (hub)

~400 lines. Operator-level overview, anyone reads in 30 min. Structure:

1. **How to read this** — relationship to `eye-exam-primer.md` and `clinical-anatomy.html`. Who this is for. What's deferred to deep-dives.
2. **The 9-service architecture** — the framework diagram (text version).
   Links to anatomy HTML for visuals.
3. **Anatomy in 5 minutes** — concise textual tour. Heavy linking to the HTML
   for diagrams; doesn't try to be the visual reference itself.
4. **Physiology** — how each service actually works:
   - Refraction & accommodation (why presbyopia is inevitable)
   - Aqueous dynamics (why this single circuit drives glaucoma)
   - Tear film (oil / aqueous / mucin layers, why MGD dominates dry eye)
   - Phototransduction & RPE recycling (why AMD is an RPE disease)
   - Visual pathway → cortex (lesion-localization basics)
5. **The diagnostic spine** — complaint → service → component → test →
   diagnosis → treatment. 6 worked examples (one per complaint subtree).
6. **The clinical encounter** — history-taking framework (CC, HPI, POH/PMH/FH/SH,
   meds, allergies), exam sequence (VA → pupils → IOP → motility → CVF →
   slit-lamp anterior → DFE posterior). The "always check both eyes" rule.
   Red-flag triage.
7. **Treatment toolbox at a glance** — drops (8 major classes), lasers (SLT,
   YAG, PRP, focal, refractive excimer/femto), incisional surgery (cataract,
   glaucoma, retinal, oculoplastic), lenses (spectacles, CL types, IOL types).
8. **TOC → 8 deep-dives** with one-line teaser each.

## Deliverable 3 — `docs/clinical/*.md` (8 deep-dives)

Each ~300-600 lines. Consistent inner structure:

```
1. Quick map           — 1-page operator summary, services this lives in
2. Mechanism           — anatomy + physiology specific to this disease family
3. Presentation        — symptoms, signs, who gets it (complaint subtree)
4. Diagnosis           — exam findings + the specific tests/imaging used
5. Treatment hierarchy — conservative → drops → laser → surgery, with criteria
6. Subtleties          — pitfalls, differentials, controversies
7. VN-EN jargon table  — domain-specific terms (no duplicates of primer)
8. Hooks for MAEC      — Encounter fields, examType modules, report templates,
                         workflow timers, imaging implications, candidate
                         serviceFindings[] entries
```

### The 8 files

| File | Primary service | Scope |
|---|---|---|
| `refractive-error.md` | Optical | Myopia / hyperopia / astigmatism / presbyopia. Peds myopia control (low-dose atropine, ortho-K, MiSight). Refractive surgery (LASIK, SMILE, PRK, phakic IOL). |
| `glaucoma.md` | Pressure → Transport | Aqueous outflow → POAG / PACG / secondary. IOP–RNFL–VF triad. Drop classes. SLT, MIGS, trab, tubes. |
| `cataract-and-iol.md` | Optical | Lens biology, opacity types. Biometry workflow. IOL formulas (SRK/T, Barrett UII, Haigis, Hill-RBF). IOL types. Phaco. PCO → YAG. |
| `cornea-and-ocular-surface.md` | Surface, Optical | Dry eye (TFOS DEWS II — aqueous-def vs MGD). Keratoconus + CXL. Infectious keratitis. Dystrophies. Corneal transplant (PK, DSAEK, DMEK). |
| `retina.md` | Sensor, Vascular | DR (ETDRS staging) + DME. AMD dry/wet, anti-VEGF. RVO/RAO. Retinal detachment. ROP. Vitrectomy. FA/OCT/OCT-A reading. |
| `pediatric-and-strabismus.md` | Coordination, Optical | Amblyopia. Strabismus types. Cycloplegic refraction logic. Visual development. ROP screening. |
| `neuro-ophth-and-systemic.md` | Transport, Autonomic | Optic neuritis, NAION, papilledema. CN III/IV/VI palsies. Diabetic / HT / thyroid eye. Sarcoid, MS, GCA, syphilis. |
| `oculoplastics-trauma-onco.md` | Surface, others | Eyelid disease, NLD obstruction, orbital cellulitis. Trauma triage (chemical burn, open globe, hyphema). Onco (RB, uveal melanoma, lymphoma). |

### Cross-link strategy
- Hub TOC → deep-dives
- Deep-dive back-link to hub + forward-link to peers (e.g. glaucoma ↔ cataract
  for combined surgery, retina ↔ neuro-ophth for NAION vs CRAO)
- All docs link out to `eye-exam-primer.md#section` for equipment and to
  `CLAUDE.md#documented-patient-workflows-4` for workflow mapping
- Service names link to the color-coded card in `clinical-anatomy.html`

### Build order for deep-dives
1. `refractive-error.md` (universal, every patient gets one)
2. `glaucoma.md` (silent + common + drives screening rationale)
3. `cataract-and-iol.md` (cataract surgery is the highest-revenue ophth procedure)
4. `cornea-and-ocular-surface.md` (dry eye drives huge clinic volume)
5. `retina.md` (the highest-acuity territory)
6. `pediatric-and-strabismus.md` (drives the cycloplegic timer + myopia tracker)
7. `neuro-ophth-and-systemic.md`
8. `oculoplastics-trauma-onco.md` (lower clinic prevalence, can land last)

## Deliverable 4 — `FOLLOWUPS.md` entry

Append a section titled **"Clinical primer — shipped 2026-06-?? + serviceFindings[] design proposal"**:

1. **What shipped**: the 4 deliverables. Reference paths.
2. **What's `[CHECK]`-flagged**: any clinical claim the author was uncertain about.
3. **What's NOT in scope** (carryover from this plan).
4. **Design proposal — `Encounter.serviceFindings[]`**: schema sketch for when
   AI-assisted diagnosis becomes a real roadmap item. Not a commitment, just an
   open-option. See section below.

### Proposed `serviceFindings[]` schema (for FOLLOWUPS entry, not a commitment)

```js
// On Encounter, alongside existing diagnosis (free text)
serviceFindings: {
  type: [{
    service: {
      type: String,
      enum: ['optical', 'sensor', 'transport', 'coordination',
             'surface', 'pressure', 'vascular', 'immune', 'autonomic']
    },
    eye: { type: String, enum: ['OD', 'OS', 'OU'] },
    status: {
      type: String,
      enum: ['normal', 'borderline', 'flagged', 'abnormal']
    },
    evidence: [{                  // which test values flagged this
      serviceCode: String,        // e.g. 'SVC-IOP'
      fieldCode: String,          // e.g. 'iop_mmhg'
      value: mongoose.Schema.Types.Mixed,
      unit: String,
      refLow: Number,
      refHigh: Number,
      flag: String,               // 'high' / 'low' / 'asymmetric' / etc.
    }],
    candidateDiagnoses: [String],  // ICD/SNOMED codes or text
    flaggedBy: String,             // 'doctor:phong', 'rule:iop_gt_21', 'ai:glaucoma_v1'
    flaggedAt: String,
    note: String,
  }],
  default: [],
}
```

Three data-model adjustments to make at the same time (per AI-design discussion):

1. **Structured complaint at registration** — capture 6-7 complaint categories
   + onset + laterality + duration alongside the existing free-text
   `clinicalInfo`. Doesn't replace free text.
2. **Test outputs with units + reference ranges** — `assignedServices[].output`
   stays a Mixed bag, but writes go through a normalization helper that emits
   `{ value, unit, refLow, refHigh, flag }` for each numeric field. Index over
   "patient × service × field × time" for cheap longitudinal queries.
3. **Longitudinal indexes** — `(patientId, encounterDate)` so per-patient time
   series (IOP trend, RNFL progression, VA history) is cheap.

These three together keep the AI option open at zero current cost. If AI never
ships, the structured complaint and reference ranges still pay off in basic
analytics and report quality.

## Conventions to match (from `docs/eye-exam-primer.md`)

- First-principles framing — "why does this disease exist" before "what's the
  treatment"
- ASCII diagrams over screenshots in markdown — diff-able, no asset pipeline.
  Rich SVG visuals live in the HTML doc, not in `.md` files.
- VN-EN bilingual jargon tables in every doc; new terms appended, no duplication
  of `eye-exam-primer.md` entries
- Tight prose, no filler, no marketing
- "Hooks for MAEC software" closing section in every deep-dive — the
  load-bearing innovation that makes this primer ours, not a textbook
- Vietnamese gloss on every clinical noun on first use
- Reference existing modules / pages where relevant (Encounter, RIS.jsx,
  ReportTemplate, Equipment)

## NOT in scope

- Prescribable drug doses (mg/kg, drop frequency for a specific patient). Drug
  *classes* and typical-use framing only. Anything more would be a prescribing
  reference, not a primer.
- Surgical technique step-by-step. Concept-level only.
- Vietnamese MOH regulatory specifics. Separate doc when that work happens.
- Live citation harvesting per claim. Written from training-data ophthalmology
  knowledge. Anything uncertain gets a `[CHECK]` flag inline for a clinical
  reviewer to verify against AAO BCSC / AAO PPP / NICE / EuRetina.

## Verification (after build)

1. Render `clinical-anatomy.html` in browser; all SVGs display, hovers work,
   click-expand works.
2. Render `clinical-primer.md` + each `docs/clinical/*.md` in VS Code markdown
   preview. Confirm TOC anchors and cross-links resolve.
3. Spot-check 5 clinical claims per deep-dive against AAO BCSC or AAO PPP;
   fix or `[CHECK]`-flag mismatches.
4. With `maec-app/server/models/Encounter.js` open, confirm "Hooks for MAEC"
   sections reference real field names. Anything implying a new field goes into
   FOLLOWUPS, not silently into the doc.
5. Append the clinical-primer entry + `serviceFindings[]` proposal to
   `FOLLOWUPS.md`.

## Reference — current Encounter schema (read 2026-06-04)

Key fields from `maec-app/server/models/Encounter.js` so future-me doesn't have
to re-read it for the Hooks sections:

```
clinicalInfo       Lý do đến khám (chief complaint) — free text
presentIllness     Quá trình bệnh lý — narrative — free text
pastHistory        Tiền sử người bệnh — free text
diagnosis          Chẩn đoán — free text
conclusion         Kết luận / next steps — free text
examType           free-form String, 4 documented workflows + "Khác"
modality           free-form String (was enum, now any)
bodyPart           string — populate with OD / OS / OU for eye
assignedServices[] { serviceCode, status, output: Mixed, ... }
billItems[]        { kind, code, qty, unitPrice, vatRate, ... }
packages[]         { code, name, tier, addedAt }
status             scheduled / in_progress / pending_read / reading / reported /
                   verified / completed / partial / paid / cancelled
reviewStatus       '' / 'pending_review' / 'approved'  (import workflow)
```

The narrative diagnosis fields (clinicalInfo, presentIllness, pastHistory,
diagnosis, conclusion) are all free text today. `serviceFindings[]` proposal
sits *alongside* these, not replacing them — free text stays as the doctor's
voice, structured findings are the machine-readable parallel.

## How to resume from another machine

1. Pull latest `master`.
2. Read this file (`docs/clinical-primer-plan.md`).
3. Cross-check `docs/eye-exam-primer.md` to remember the voice / format.
4. Read `maec-app/server/models/Encounter.js` for current schema.
5. Start with deliverable 1 (HTML anatomy). Build order is in `## Status`.
6. Delete this file when all 4 deliverables ship.
