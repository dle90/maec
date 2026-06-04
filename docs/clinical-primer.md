# Clinical primer — the medicine the equipment serves

Hub doc for anyone (dev or clinical) who needs to reason about *the diseases*, not
just the machines. Where [`eye-exam-primer.md`](eye-exam-primer.md) explains the
**equipment + jargon** side — why each device in the inventory exists and what it
measures — this primer explains the **clinical logic underneath**: how the eye
works, how it breaks, and how a doctor reasons from a complaint to a diagnosis.

Written from first principles. The organizing idea is an **engineering-lens
decomposition of the eye into 9 services** — read it once and most of
ophthalmology stops being a flat list of disease names and becomes "which service
broke, and which test confirms it."

## How to read this

- **Who it's for.** A non-clinician building MAEC's EMR who wants to have competent
  conversations with doctors, vendors, and inspectors; make better data-model
  decisions (Encounter fields, exam forms, report templates, cycloplegic timers,
  IOL workflow); and read society guidelines (AAO PPP, NICE, EuRetina) without
  bouncing off the jargon.
- **Companion docs.**
  - Visuals live in [`clinical-anatomy.html`](clinical-anatomy.html) — 8 SVG diagrams,
    color-coded by the same 9 services used here. Open it alongside this doc.
  - Equipment + imaging jargon live in [`eye-exam-primer.md`](eye-exam-primer.md).
  - Clinic workflows live in
    [`CLAUDE.md`](../CLAUDE.md#documented-patient-workflows-4).
- **What's deferred.** This hub stays operator-level (~30 min read). Disease detail
  lives in 8 deep-dives under [`docs/clinical/`](clinical/) — see the TOC at the end.
- **Accuracy bar.** Written from training-data ophthalmology knowledge. Anything
  uncertain is flagged `[CHECK]` for a clinical reviewer to verify against AAO BCSC /
  AAO PPP. No prescribable doses here — drug *classes* only (see
  [Not in scope](#not-in-scope)).

---

## 1. The 9-service architecture

The eye is several organs in one 24 mm sphere. Instead of memorizing it by
anatomical chapter (cornea, lens, retina…), decompose it by **the job each part
does**. Every disease then drops into exactly one — rarely two — of nine services.

```
DATA PLANE  (carry the picture from world to brain)
  • OPTICAL STACK    cornea → aqueous → pupil → lens → vitreous   "in focus?"
  • SENSOR (retina)  RPE + photoreceptors + bipolar + ganglion    "detecting?"
                       ├─ macula sub-service  (high-res central)
                       └─ periphery
  • TRANSPORT        optic nerve → chiasm → tract → LGN → V1       "signal out?"

CROSS-PLANE  (two eyes as one instrument)
  • COORDINATION     6 muscles × 2 eyes, CN III/IV/VI, fusion      "aligned?"

SUPPORT PLANE  (keep the data plane alive)
  • SURFACE          tear film + lids + conjunctiva                "front wet?"
  • PRESSURE         ciliary production → trabecular outflow       "inflated right?"
  • VASCULAR         central retinal a/v + choroid                 "fed?"
  • IMMUNE           uvea + lacrimal + lid lymphoid                "policed?"
  • AUTONOMIC        sympathetic + parasympathetic                 "tuned?"
```

The color code (used in every diagram + deep-dive) is:

| Service | Color | Plane | One-line job |
|---|---|---|---|
| Optical | blue `#2563eb` | data | Get light to the back, in focus |
| Sensor | purple `#7c3aed` | data | Convert light to signal |
| Transport | indigo `#4338ca` | data | Carry signal to the brain |
| Coordination | teal `#0d9488` | cross | Aim both eyes together |
| Surface | cyan `#0891b2` | support | Keep the front wet + protected |
| Pressure | orange `#ea580c` | support | Inflate the globe correctly |
| Vascular | red `#dc2626` | support | Feed the tissue |
| Immune | green `#16a34a` | support | Police the inside |
| Autonomic | amber `#ca8a04` | support | Tune pupil + focus + lid tone |

**The load-bearing caveat — shared hardware.** Services are not fully independent.
The **uvea** (mống mắt + thể mi + hắc mạc = iris + ciliary body + choroid) is one
continuous vascular tissue that participates in pressure, optical, *and* vascular at
once. Inflammation in one part spills into the others. That is why **compound
diseases** exist:

- **Glaucoma**: pressure → transport (high IOP damages the optic nerve)
- **Diabetic retinopathy**: vascular → sensor (capillary failure starves the retina)
- **Uveitis**: immune → optical + pressure + vascular simultaneously
- **NAION**: vascular → transport (the optic-nerve-head blood supply infarcts)
- **Neovascular glaucoma**: vascular → pressure (ischemia grows new vessels that
  block the drainage angle, and IOP rockets)

Keep the engineering instinct that services have *interfaces*, *failure cascades*,
and *SLOs* (IOP 10–21 mmHg, VA 20/20, tear break-up time >10 s). Drop the instinct
that they're independent — any real diagnostic logic needs an inter-service
reasoning layer, not nine isolated classifiers voting.

---

## 2. Anatomy in 5 minutes

Concise textual tour; the visuals are in
[`clinical-anatomy.html`](clinical-anatomy.html) (§ numbers below point at its
diagrams). Vietnamese gloss on first use of each clinical noun.

**Three concentric walls** (anatomy HTML §1):
1. *Fibrous* — **cornea** (giác mạc) in front, **sclera** (củng mạc) the white shell.
2. *Vascular* — the **uvea**: **iris** (mống mắt) + **ciliary body** (thể mi) +
   **choroid** (hắc mạc).
3. *Neural* — the **retina** (võng mạc).

**Three chambers, front to back:** anterior chamber (tiền phòng, aqueous) → posterior
chamber (hậu phòng, aqueous source) → vitreous cavity (buồng dịch kính, gel).

**Optical stack** (HTML §1–2): **cornea** is a +43 D *fixed* lens doing two-thirds of
the focusing; the **pupil** (đồng tử) is the aperture; the **crystalline lens** (thủy
tinh thể) is a +20 D *variable* lens that accommodates via the ciliary muscle.

**Retina, the three load-bearing layers** (HTML §3): **RNFL** (lớp sợi thần kinh —
ganglion-cell axons, thins in glaucoma), **photoreceptors** (tế bào cảm thụ — rods
peripheral, cones central), **RPE** (biểu mô sắc tố — recycles pigment, fails in AMD).
The **macula / fovea** (hoàng điểm / hố trung tâm, HTML §4) is the central high-res
patch — all cones, no redundancy, which is why macular disease is so disabling.

**The drainage circuit** (HTML §2): ciliary body → posterior chamber → pupil →
anterior chamber → angle → **trabecular meshwork** (vùng bè) → **Schlemm's canal**
(ống Schlemm) → episcleral veins. Block it anywhere → IOP rises → glaucoma.

**Two blood trees** (HTML §5): **central retinal artery** (động mạch trung tâm võng
mạc) feeds the *inner* retina; the **choroid** feeds the *outer* retina
(photoreceptors + RPE). Two supplies → two ischemic syndromes (CRAO vs choroidal).

**The visual pathway** (HTML §6): retina → optic nerve → **chiasm** (giao thoa, nasal
fibers cross) → tract → LGN → optic radiations → **V1** cortex. Each lesion site
produces a signature field defect — the single most useful localization diagram.

**The motor plant** (HTML §7–8): 6 extraocular muscles per eye on 3 nerves
(**LR₆SO₄** — lateral rectus is CN VI, superior oblique is CN IV, the rest CN III),
plus 5 cranial nerves and the sympathetic chain that run sensation, lid, and pupil.

---

## 3. Physiology — how each service actually works

Five mechanisms worth understanding because they explain *why* whole disease
families exist.

### Refraction & accommodation — why presbyopia is inevitable
The cornea does the bulk, fixed; the lens fine-tunes by changing shape. To focus
near, the ciliary muscle contracts and the lens bulges. The lens keeps growing new
fibers for life and stiffens — by ~40 it can no longer bulge enough, so near focus
fails. **Presbyopia (lão thị) is not a disease, it's a clock.** Refractive *errors*
(myopia/hyperopia/astigmatism, cận/viễn/loạn thị) are mismatches between eye length
and optical power — see the [refractive-error deep-dive](clinical/refractive-error.md).

### Aqueous dynamics — why one circuit drives glaucoma
Aqueous is made continuously by the ciliary body and must drain at the same rate, or
pressure builds. ~90% leaves through the trabecular meshwork (the "conventional"
route); the rest via the uveoscleral route. **IOP is a flow-vs-resistance equation.**
Raise resistance (clogged meshwork = open-angle) or block the route (iris covers the
angle = angle-closure) and IOP climbs, mechanically strangling optic-nerve axons.
Every glaucoma drug either turns down production or opens up outflow. See
[glaucoma.md](clinical/glaucoma.md).

### Tear film — why MGD dominates dry eye
The tear film is three layers: an outer **oil** layer (from meibomian glands, tuyến
Meibomian) that stops evaporation, a middle **aqueous** layer (lacrimal gland), and an
inner **mucin** layer that lets it stick. Most dry eye is *evaporative* — the oil
layer fails because meibomian glands clog (meibomian gland dysfunction, MGD) — not
aqueous-deficient. That's why warm compresses and lid hygiene, not just artificial
tears, are first-line. See [cornea-and-ocular-surface.md](clinical/cornea-and-ocular-surface.md).

### Phototransduction & RPE recycling — why AMD is an RPE disease
Photoreceptors catch light with a pigment that must be regenerated after each
"flash"; the **RPE** does that recycling and clears the photoreceptors' daily debris.
Over decades the debris (drusen) accumulates and the RPE falters. Dry AMD is RPE
attrition; wet AMD is choroidal vessels breaking through Bruch's membrane into the
retina. **AMD is fundamentally a failure of the RPE support cell, not the
photoreceptor itself.** See [retina.md](clinical/retina.md).

### Visual pathway → cortex — lesion localization basics
Because nasal fibers cross at the chiasm, the rule is binary and powerful:
**monocular** field loss → at or in front of the chiasm (one eye's nerve);
**homonymous** loss (same side in both eyes) → behind the chiasm. Bitemporal loss =
the chiasm itself (classically a pituitary tumor). See
[neuro-ophth-and-systemic.md](clinical/neuro-ophth-and-systemic.md) and HTML §6.

---

## 4. The diagnostic spine

The reasoning backbone, read **left-to-right in clinic**, **right-to-left when you're
designing software** (encounter forms, report templates, screening pipelines):

```
COMPLAINT → candidate SERVICES → candidate COMPONENTS → TESTS → DIAGNOSIS → TREATMENT
```

A complaint narrows you to a few services; each service has a few components that can
fail; cheap broad tests run first, expensive specific tests confirm. The "minimum
testing" goal is really minimum *expensive* testing — there's a floor of screening
tests (auto-refraction, slit-lamp, IOP) every patient gets regardless of complaint.

The **6–7 complaint subtrees**, each pointing at different services:

| VN | EN | Suggests broken service(s) |
|---|---|---|
| Mờ | Blur | Optical **or** Sensor **or** Transport |
| Đau | Pain | Surface, Pressure (acute glaucoma), Immune |
| Đỏ | Red eye | Surface, Immune (anterior chamber) |
| Khô / cộm | Dry / gritty | Surface |
| Nhìn đôi | Double vision | Coordination |
| Chớp sáng / ruồi bay | Flashes / floaters | Sensor (detachment risk) |
| Mất thị trường | Field loss | Sensor, Transport, brain |
| *(none)* | Asymptomatic screening | Pressure, Vascular fail silently |

### Six worked examples (one per subtree)

1. **"Blur, gradual, both eyes, age 68" (Mờ).** Services: optical, sensor.
   Tests: pinhole (does it correct? → optical), auto-refraction, slit-lamp (lens
   clarity), OCT macula. → **Cataract** (optical) ± early **AMD** (sensor). Treat:
   cataract surgery; AMD monitoring/anti-VEGF.
2. **"Sudden severe pain + red + halos, one eye" (Đau).** Service: pressure
   (angle-closure). Tests: IOP (very high), gonioscopy (closed angle), slit-lamp
   (mid-dilated fixed pupil). → **Acute angle-closure glaucoma** — an emergency.
   Treat: IOP-lowering drops + laser peripheral iridotomy.
3. **"Red, watery, gritty, no pain, contagious in the family" (Đỏ).** Service:
   surface ± immune. Tests: slit-lamp, history. → **Conjunctivitis** (viral vs
   bacterial vs allergic). Treat: supportive / topical by cause.
4. **"Gritty, worse on screens, drops barely help" (Khô).** Service: surface.
   Tests: tear break-up time, meibography (gland dropout), staining. → **MGD /
   evaporative dry eye**. Treat: lid hygiene, warm compress, then aqueous/anti-inflammatory.
5. **"Double vision, gone when one eye covered" (Nhìn đôi).** Service: coordination.
   Tests: cover test, motility H-pattern, pupil. → cranial-nerve palsy or
   **strabismus** — and a CN III with a blown pupil is a *neurosurgical* emergency.
6. **"Flashes then a curtain across the vision" (Chớp sáng/ruồi bay).** Service:
   sensor. Tests: dilated fundus exam, OCT, ultrasound. → **Retinal detachment** —
   urgent surgical referral.

Each example is the seed of a screening pipeline. The right-to-left reading is what
the future `serviceFindings[]` schema encodes (see §7 / FOLLOWUPS).

---

## 5. The clinical encounter

How a visit is actually structured — maps onto MAEC's `Encounter` model and the
4 documented workflows.

**History (bệnh sử)** — the order a doctor asks, and the matching `Encounter` fields:

| Step | VN | Encounter field |
|---|---|---|
| Chief complaint (CC) | Lý do đến khám | `clinicalInfo` |
| History of present illness (HPI) | Quá trình bệnh lý | `presentIllness` |
| Past ocular / medical / family / social history | Tiền sử | `pastHistory` |
| Medications, allergies | Thuốc, dị ứng | *(within `pastHistory` today)* |

**Exam sequence (trình tự khám)** — broad-and-cheap first, then targeted:

```
VA (thị lực) → pupils (đồng tử) → IOP (nhãn áp) → motility (vận nhãn)
   → confrontation fields (thị trường) → slit-lamp anterior (sinh hiển vi)
   → dilated fundus exam / DFE (soi đáy mắt)  ± OCT / fundus photo / topography
```

Two iron rules: **always check both eyes** (asymmetry is itself a finding — RAPD,
IOP difference, anisocoria), and **triage red flags first** — sudden vision loss,
sudden onset of flashes/floaters/curtain, painful red eye with halos, new diplopia
with a headache, chemical splash, trauma. Each is a same-day pathway.

These steps populate the `assignedServices[]` station modules on the encounter and
drive `examType` (the 4 workflows). The **45-minute cycloplegic wait** in workflows #2
and #3 is a physiology constraint — cycloplegic drops (liệt điều tiết) need time to
relax the focus muscle so a child's true refraction shows — and is exactly why
[FOLLOWUPS](../FOLLOWUPS.md) calls for a timer/queue UX.

---

## 6. Treatment toolbox at a glance

The whole therapeutic arsenal, grouped. **Classes only — no doses** (see
[Not in scope](#not-in-scope)). Each maps back to the service it rescues.

**Drops (thuốc nhỏ mắt)** — eight workhorse classes:
- Lubricants / artificial tears (surface)
- Anti-inflammatory: steroids + NSAIDs (immune/surface)
- Antibiotics / antivirals / antifungals (surface/immune)
- Anti-allergy: antihistamine + mast-cell stabilizer (immune/surface)
- IOP-lowering: prostaglandin analogs, beta-blockers, alpha-agonists, carbonic-
  anhydrase inhibitors, rho-kinase inhibitors (pressure)
- Mydriatics / cycloplegics (autonomic — exam + therapy)
- Anti-VEGF (intravitreal injection, not a drop, but the retina mainstay — vascular/sensor)
- Glaucoma fixed-combinations (pressure)

**Lasers** — SLT (trabecular meshwork, glaucoma), YAG capsulotomy (clouded
posterior capsule after cataract surgery), YAG/laser peripheral iridotomy
(angle-closure), PRP panretinal photocoagulation (proliferative DR), focal/grid
(macular edema), excimer/femtosecond (refractive surgery — LASIK/SMILE/PRK).

**Incisional surgery** — phacoemulsification + IOL (cataract); trabeculectomy, tubes,
MIGS (glaucoma); vitrectomy + scleral buckle (retina); corneal transplant PK/DSAEK/
DMEK (cornea); oculoplastic (lids, lacrimal, orbit).

**Lenses** — spectacles (kính gọng); contact lenses (soft / RGP / scleral / ortho-K);
intraocular lenses (IOL — monofocal, toric, multifocal/EDOF). Lens choice is itself a
clinical decision with its own workup (biometry → IOL formula).

---

## 7. Hooks for MAEC software

The load-bearing reason this primer is *ours*, not a textbook. The clinical logic
above implies specific EMR design moves. None are committed here — they're logged in
[FOLLOWUPS.md](../FOLLOWUPS.md); the deep-dives each close with their own "Hooks"
section.

- **`examType` ↔ workflows.** The 4 documented workflows already drive `examType`
  and the report-template dropdown. The diagnostic spine (§4) is the skeleton for the
  deferred **encounter form** that replaces the radiology ReportEditor in `RIS.jsx`.
- **Structured findings alongside free text.** Today `clinicalInfo`, `presentIllness`,
  `pastHistory`, `diagnosis`, `conclusion` are all free text — and should stay so
  (the doctor's voice). The proposed **`Encounter.serviceFindings[]`** sits *beside*
  them as a machine-readable parallel: per-service status + the test values that
  flagged it + candidate diagnoses + who/what flagged it (doctor / rule / AI). Schema
  sketch is in [FOLLOWUPS.md](../FOLLOWUPS.md).
- **Structured complaint at registration.** Capture the 6–7 complaint categories
  (§4) + onset + laterality + duration next to the free-text complaint. Cheap now,
  pays off in analytics and in any future screening pipeline.
- **Test outputs with units + reference ranges.** `assignedServices[].output` stays a
  Mixed bag, but numeric writes go through a normalization helper emitting
  `{ value, unit, refLow, refHigh, flag }` — so IOP, RNFL, VA, axial length become
  comparable and flaggable.
- **Longitudinal indexes.** `(patientId, encounterDate)` makes per-patient time series
  (IOP trend, RNFL progression, VA history) cheap — the substrate for the deferred
  **compare-over-time** UI.
- **Cycloplegic timer.** §5's 45-minute wait is a real workflow constraint needing a
  timer/queue (FOLLOWUPS P1).

Together these keep the AI-assisted-diagnosis option open at near-zero current cost,
while paying off immediately in report quality and basic analytics.

---

## 8. Deep-dives — table of contents

Eight sub-specialty docs under [`docs/clinical/`](clinical/), each ~300–600 lines with
a consistent inner structure (quick map → mechanism → presentation → diagnosis →
treatment hierarchy → subtleties → VN-EN table → **Hooks for MAEC**). Build order
reflects clinic prevalence + revenue.

> **Status:** the deep-dives are *not yet written* — this hub pauses here for a
> depth/tone review before they're authored (per `clinical-primer-plan.md`).

| # | File | Primary service(s) | Teaser |
|---|---|---|---|
| 1 | `refractive-error.md` | Optical | Myopia/hyperopia/astigmatism/presbyopia; peds myopia control; refractive surgery. Every patient gets one. |
| 2 | `glaucoma.md` | Pressure → Transport | The silent IOP→RNFL→VF triad; drop classes; SLT, MIGS, trab, tubes. |
| 3 | `cataract-and-iol.md` | Optical | Lens opacity; biometry; IOL formulas + types; phaco; YAG for PCO. The highest-revenue procedure. |
| 4 | `cornea-and-ocular-surface.md` | Surface, Optical | Dry eye (DEWS II); keratoconus + CXL; keratitis; transplant (PK/DSAEK/DMEK). |
| 5 | `retina.md` | Sensor, Vascular | DR + DME; AMD dry/wet + anti-VEGF; RVO/RAO; detachment; reading OCT/FA/OCT-A. |
| 6 | `pediatric-and-strabismus.md` | Coordination, Optical | Amblyopia; strabismus; cycloplegic logic; the myopia-control + cyclo-timer driver. |
| 7 | `neuro-ophth-and-systemic.md` | Transport, Autonomic | Optic neuritis, NAION, papilledema; CN III/IV/VI palsies; diabetic/thyroid/GCA. |
| 8 | `oculoplastics-trauma-onco.md` | Surface, others | Lids, NLD, orbit; trauma triage (chemical, open globe, hyphema); ocular oncology. |

**Cross-linking:** each deep-dive back-links here and forward-links its peers (glaucoma
↔ cataract for combined surgery; retina ↔ neuro-ophth for NAION vs CRAO), links out to
[`eye-exam-primer.md`](eye-exam-primer.md) for equipment and to
[`CLAUDE.md`](../CLAUDE.md#documented-patient-workflows-4) for workflows, and links
service names to the color-coded card in
[`clinical-anatomy.html`](clinical-anatomy.html).

---

## Not in scope

- **Prescribable doses** (mg/kg, drop frequency for a specific patient). Drug
  *classes* and typical-use framing only — more would be a prescribing reference.
- **Surgical technique step-by-step.** Concept-level only.
- **Vietnamese MOH regulatory specifics.** A separate doc when that work happens.
- **Live citation harvesting.** Written from training-data knowledge; `[CHECK]` flags
  mark anything a clinical reviewer should verify against AAO BCSC / AAO PPP / NICE /
  EuRetina.

---

*Hub for the MAEC clinical primer. See [`clinical-anatomy.html`](clinical-anatomy.html)
for visuals and [`eye-exam-primer.md`](eye-exam-primer.md) for the equipment side.
Deep-dives land under [`docs/clinical/`](clinical/) after the depth/tone review.*
