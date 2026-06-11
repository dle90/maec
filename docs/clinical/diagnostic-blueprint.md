# Diagnostic blueprint — design notes

> **Design/scratch doc** (not built). Captures the design for a future
> **diagnostic decision-support** layer over MAEC's EMR, organized by the
> [9-service framework](../clinical-primer.md). Output of an interactive design
> session + a web scan of prior art. Feeds the "AI-assisted diagnosis" roadmap
> idea in [`../clinical-primer-plan.md`](../clinical-primer-plan.md). Nothing here
> is committed to code. Pairs with [`disease-index.md`](disease-index.md) (the
> disease↔service↔test↔treatment content) and
> [`_walkthrough-notes.md`](_walkthrough-notes.md) (the clinical reasoning).

## 0. Framing & guardrails (read first)
- **Decision *support*, not autonomous diagnosis.** The system suggests a ranked
  differential + the next best test + red-flag alerts; **a clinician confirms and
  acts.** Autonomous diagnosis is a regulated medical-device space with liability
  and automation-bias risk. Scope and frame accordingly from day one.
- **It must be safe before it is smart.** The most important content here is §6
  (robustness/failure modes), not the ranking math.
- **The pieces also pay off without the AI.** Structured capture, patient context,
  local priors, and safety flags improve plain analytics, report quality, and
  patient safety (e.g. the steroid↔glaucoma flag) **even if the engine never ships**
  — the "keep the option open at near-zero cost" logic from the plan.

---

## 1. Don't reinvent — reuse vs build
A web scan (June 2026) shows the core idea already exists in several forms:
- **Eye Disease Ontology (EDO)** — Nature *Sci Rep* 2025; a 566-class eye knowledge
  graph linking diseases ↔ symptoms, risk factors, tests, treatments.
- **SNOMED CT / ICD-11 / HPO / LOINC** — standard terminologies for
  diseases / findings / lab+test codes.
- **QMR / INTERNIST-1** — the canonical *probabilistic* diagnostic engine design
  (40-year-validated).
- **Wills Eye Manual** — the clinical-reference structure (per-disease template +
  dual symptom/anatomy index).
- **Isabel, ASSORT, LLM triage** — commodity differential generation.

**Conclusion:** the medical *knowledge base* (diseases/findings/tests/treatments and
their links) is largely **solved and standardized — reuse it.** Stand on
SNOMED/ICD/HPO for terminology and consider EDO as a ready-made eye KG. The
**defensible build is the "last mile"**:
1. integration with *our* EMR + structured capture,
2. **local priors** (Vietnam / clinic prevalence, age mix),
3. **device-aware** test recommendation (tied to the Equipment inventory),
4. the **service / cascade index** as navigation + cascade model,
5. the **robustness & safety layer** (§6).

---

## 2. Structure — the layered model (lessons from prior art)
The mature designs do **not** use a single organizing axis. Key lessons:

- **Anatomy/service is an *index*, not the reasoning engine.** SNOMED keeps anatomy
  as an *attribute* (`Finding site`). Our 9-service split is a *better-motivated*
  index (functional, not just anatomical) + a cascade model — but it sits **on top
  of** a standard weighted graph; it is not the data model.
- **Separate the layers** (we had been conflating them):
  1. **terminology / taxonomy** — concepts + IS-A hierarchy → *reuse SNOMED/EDO*
  2. **defining attributes** — finding-site (anatomy), morphology, cause
  3. **weighted disease↔finding edges + priors** — the QMR engine (two weights)
  4. **human monograph** — the Wills template (for reading)
  5. **dual index** — forward (disease → its features) **and** reverse
     (complaint → differential)
- **Use polyhierarchy (multiple parents), not single buckets** — the established
  answer to compound/cascade diseases (neovascular glaucoma *is-a* glaucoma **and**
  a vascular complication). Solves our "rarely two services" hand-wave.
- **Split symptoms (history) vs signs (exam) vs tests (investigations)** — distinct
  layers entering at different stages with different weights (Wills does this).
- **The QMR edge carries TWO numbers**: `frequency` (how often disease → finding)
  and `evokingStrength` (how strongly finding → disease) + a disease `prior`.

---

## 3. Reasoning core — probabilistic, run as a loop

### Why probabilistic, not deterministic
`findings → disease` is **not a function**: findings are noisy (tests <100%
sens/spec; IOP normal in normal-tension glaucoma), diseases express variably
(frequency <1), the mapping is many-to-many and overlapping, **base rates decide
ties**, patients have **multiple diseases at once**, and you must rank + express
confidence + choose the next test under **missing data**. Deterministic rules
treat findings as facts and explode combinatorially. Probabilistic = **knowledge as
*data* (an editable weighted graph) + one inference engine** → clinicians curate
data, not code. (Ordinal weights are fine to start — INTERNIST-1 used 0–5 integer
scales, not measured probabilities.)

### Hybrid: deterministic shell, probabilistic core
```
INPUT → [deterministic red-flag gate]        → emergency? short-circuit
      → [deterministic safety/threshold rules] (don't-dilate-narrow-angle, steroid↔glaucoma)
      → [PROBABILISTIC core]                  → ranked differential + confidence + next-best-test
```
Pathognomonic findings are just **max-evoking-strength edges** — the probabilistic
model subsumes the deterministic case as its limit.

### The diagnostic loop (the operational model)
```
candidates = all diseases, weighted by prior(disease, patientContext)
observe complaint + cheap screening findings → re-weight
loop:
   if safely closeable                         → done   (see §6 termination)
   else if no affordable/available test helps   → stop   (refer / best differential)
   else:
       nextTest = argmax risk-weighted expected info gain   (cheap, available, safe)
       run it → observe result → re-weight (down-weight, do NOT eliminate)
```
- **"narrow down"** = re-weight, **not** cross-off (imperfect tests → soft narrowing).
- **next test** chosen by how much it *splits* the live candidates — **weighted by
  harm-of-missing**, not raw information gain (see §6, Run C).
- Mirrors the clinical diagnostic spine: cheap broad tests first, expensive specific
  tests to confirm ("minimize *expensive* testing").

---

## 4. Data model (MongoDB / Mongoose collections)
Two clusters: a curated **Knowledge Base** (slow-changing, graph-shaped, seeded from
version-controlled files) and **Patient/Runtime** data (per-visit, time-indexed).

### A — Knowledge Base
- **`services`** — 9-service index + cascade graph. `{ _id, name, nameVi, plane,
  color, cascadesTo:[{service, relation, mechanism, exampleDisease}] }`
- **`diseases`** — monograph + tags; `services` is an **array** (polyhierarchy).
  `{ _id, name, nameVi, codes{snomed,icd11,edo}, services:[], redFlag, urgency,
  stages:[], monograph{}, treatments:[], provenance{sources,lastReviewed,checkFlags} }`
- **`findings`** — symptoms / signs / test-result interpretations, typed.
  `{ _id, name, nameVi, kind:'symptom'|'sign'|'test_result', codes{snomed,hpo},
  producedByTest, serviceHints:[], qualifiers:[], validAfter }`
- **`tests`** — procedures, **device-aware**. `{ _id, name, service:[], expensive,
  invasiveness, availableInClinic, device:'TB-020', produces:[{unit,refLow,refHigh}] }`
- **`diseaseFindingEdges`** — the reasoning core (QMR bipartite weighted graph), its
  **own collection**, indexed both directions. `{ diseaseId, findingId, frequency,
  evokingStrength, appliesWhen, negativePredictiveWindow, provenance }`
- **`treatments`** — classes + safety cautions (the Maxitrol lesson lives here).
  `{ _id, name, class, cautions:[{condition, risk, action}] }`
- **`priors`** — base rates, **scoped so local beats global**.
  `{ diseaseId, scope:'global'|'site:KG'|'screening', ageBand, prevalence, source }`

### B — Patient / Runtime
- **`observations`** — structured inputs (substrate for engine + compare-over-time +
  analytics). `{ _id, patientId, encounterId, at, kind, findingId, eye,
  value, unit, refLow, refHigh, flag, qualifiers{laterality,onset,duration,painful},
  source:'device|manual|patient|import', device, qualityMetric{}, reliabilityWeight,
  surpriseScore, amended, supersededBy, enteredBy }`
  *Indexes:* `(patientId, findingId, at)` for trends; `(encounterId)` per visit.
- **`diagnosticSessions`** — engine output + feedback loop.
  `{ _id, encounterId, patientId, at, inputs:[obsIds],
  differential:[{diseaseId, score, supporting:[], refuting:[]}],
  recommendedNextTests:[{testId, expectedUtility, availableInClinic}],
  redFlags:[], openExclusions:[], engineVersion, kbVersion,
  clinicianOutcome:{confirmedDiseaseId, accepted} }`  ← trains/validates
- **Extend `Patient`** — pre-test context: `systemicConditions:[]`, `medications:[]`
  (enables steroid↔glaucoma flag), `familyHistory:[]`, `refractiveStatus{}`.
- **`Encounter`** — keep a lightweight embedded `serviceFindings[]` *display cache*;
  source of truth = `observations` (inputs) + `diagnosticSessions` (reasoning).

### Mongo design calls
- **Edges in their own collection**, not embedded — many-to-many, queried both
  directions; the dual index *is* the Wills forward/reverse split, for free.
- **Reference external ontologies by code**; don't import them.
- **Seed the KB from version-controlled JSON/markdown** (like Equipment + report
  templates) → medical knowledge reviewed in PRs, provenance/`[CHECK]` in git.
- Cascades are shallow → `$graphLookup` suffices; no graph DB now.
- KB is read-mostly + versioned; patient data is append-heavy + time-indexed — the
  A/B split is also an ops boundary.

---

## 5. Build path
- **v0 — Triage + differential suggester (rule-based).** Red-flag gate + the
  complaint-qualifier → candidate-service/disease rules we already have. No data
  needed; immediately useful as a safety net + "have you considered…" prompt.
  Needs only `services` + `diseases` + `diseaseFindingEdges` + red-flag tags.
- **v1 — Bayesian-lite ranking.** Add `priors` (local) + `observations` → ranked
  differential + risk-weighted next-best-test. Needs structured capture live.
- **v2 — Data/ML/AI-assisted.** Image classifiers (DR grading, disc/OCT) feed the
  same graph; `diagnosticSessions.clinicianOutcome` becomes training/validation
  data; add the inter-service reasoning layer. Needs validation + governance.

Each phase is useful alone and de-risks the next.

---

## 6. Robustness & safety requirements (the core of this doc)

### The objective-function flip (confirmed by every stress test)
Do **not** make the goal *"find the most likely disease."* Make it **"safely close a
case"**: keep going until **(a)** the findings are explained, **(b)** every red-flag
candidate is **actively excluded** (risk-weighted, with proactive questioning), and
**(c)** context-mandated screening is done — and **refer when local tests can't get
there.** Treat overconfidence and chart-momentum as **bugs to suppress**, not signals.

### Failure modes & fixes (from adversarial simulation)
| # | Failure (how it breaks) | Fix |
|---|---|---|
| A | **Premature closure** — stops when one disease "explains the complaint," missing coexisting disease (e.g. cataract found, DME missed) | multi-disease output; don't terminate on single explanation; explain *residual* findings |
| B | **Rare-deadly buried** under common; **only reasons over findings captured** (GCA missed because never asked) | red-flag gate drives **proactive questioning** ("rule out worst-case" ≠ "explain with likely"); no closure until danger actively excluded |
| C | **Risk-blind test choice** — pure info-gain under-orders the cheap test that catches a low-prior catastrophe (new PVD → must do dilated exam for a tear) | next-test = **risk-weighted** expected utility; force rule-out tests for any live red-flag |
| D | **Correlated-findings overconfidence** — independence assumption double-counts one syndrome (0.30→0.97 vs honest 0.56) → false closure | collapse correlated findings into composite nodes; cap per-cluster evidence; or model dependencies |
| E | **Diagnostic momentum** — feeding charted dx as a prior anchors; "worse on treatment" read as "more of the same" | alarm features trigger fresh eval ignoring chart-boost; failure-to-improve *lowers* the prior dx; keep chart-boost out of the red-flag path |

### Wrong / erroneous data (machine malfunction, human error)
Two signatures, two defenses:
- **One-off error** (typo, blink artifact, single bad reading) → shows as an
  **outlier that doesn't fit.** Defenses: capture-time validation (range/unit/
  laterality); **source-reliability weighting** (device > typed > patient-reported;
  ingest device quality metrics → soften the likelihood); **surprise-triggered
  re-test** (verify a high-impact, un-corroborated value before concluding);
  **never let one finding be decisive** — require independent corroboration before
  high-stakes/irreversible action.
- **Systematic error** (miscalibrated device, wrong units everywhere) → **plausible,
  self-consistent** every time; per-case checks **won't** catch it. Defenses:
  **QC / calibration logging** (ties to the Equipment module), **population-drift
  monitoring** (this device's mean shifts vs history/peers), **cross-modality
  reconciliation** for high stakes.
- **Trust depends on *corroboration*, not the value:** IOP 48 is *trusted* with
  halos+closed-angle, *distrusted* in a white quiet eye. The engine's own
  **surprise score** (low likelihood under *all* hypotheses) flags probable bad data.
- **Immutable, re-runnable log:** `observations` amended (not overwritten);
  correcting a value re-runs the `diagnosticSession`. Errors are recoverable.

### Edge cases
| Edge | Requirement |
|---|---|
| **Real outlier** (lone RAPD in a dry-eye picture) | **Asymmetric anomaly handling** — hard/objective outliers (RAPD, fixed pupil, white pupil, field defect) **open a new hypothesis**, never discarded. A misfit has 3 causes — bad data / atypical / **second disease** — don't default to "bad data." |
| **Screening base-rate trap** (2% prevalence → a "positive" is ~84% false) | **regime-aware priors** (screening vs symptomatic); mandatory confirmation before action; report honest **PPV**; beware distribution shift when deploying a clinic-trained engine for population screening |
| **Too early to exclude** (hyperacute CRAO before whitening; RAPD not yet developed) | findings carry **temporal validity** (`negativePredictiveWindow`); *"too early to exclude" ≠ "excluded"* → safety-net + scheduled re-eval |
| **Unreliable / absent historian** (kids, dementia, unconscious) | **objective-only mode** (retinoscopy, objective tonometry, fixation, white-reflex, imaging); don't equate "unreported" with "absent"; availability-aware test substitution |
| **Functional / non-organic loss** (big complaint, all objective tests normal) | "subjective ≫ objective mismatch" is **its own category — only after** excluding the "eye-looks-normal" organic causes (Transport); don't falsely reassure |
| **Treatment-masked / therapeutic conflict** | a **"currently treated"** modifier widens uncertainty (suppressed findings); treatment cross-checked against **all** active conditions, not just the target (Maxitrol generalized) |

### Meta-conclusion
After ~10 adversarial runs the **probabilistic core held** — almost none of the
dangerous failures were in the math (the two genuine core fixes are
**correlation-aware evidence** and **risk-weighted value-of-information**, both
well-understood). The danger lives in **the objective function, data
reliability/timing/context, and the humility to say "can't tell — verify / observe /
refer."** Build the safety layer first.

---

## 7. Dependencies & open questions
- **Hard dependency:** structured capture in `Encounter`/`observations` (the plan's
  `serviceFindings[]` + structured complaint + normalized results). *Nothing runs on
  free text.* → see [`../../FOLLOWUPS.md`](../../FOLLOWUPS.md).
- **Patient context** capture (systemic disease, meds, family hx, refractive status)
  — where priors and safety flags live.
- **Local priors / validation data** — cold-start; begin rule-based/expert-encoded,
  refine from `clinicianOutcome`. Sensitivity-check the ranking against prior changes.
- **Governance** — KB provenance/versioning, who edits, `[CHECK]` review, and the
  decision-support (not autonomous) regulatory framing.
- **Open:** naive-Bayes/noisy-OR vs full Bayesian network (modeling finding
  dependencies — relates to failure D); exact next-best-test utility function;
  buy-vs-build for terminology (EDO/SNOMED) and the differential generator.

---

*Design notes only — written from training-data knowledge + a June 2026 web scan;
clinical + regulatory review required before any build. See `disease-index.md` and
`clinical-primer.md` for the underlying content.*
