# Diagnostic v1 — gap analysis & implementation plan

**Date:** 2026-06-12 · **Author:** design session (paired)
**Inputs:** [`docs/clinical/diagnostic-blueprint.md`](clinical/diagnostic-blueprint.md) §6,
the v0 engine (`maec-app/server/diagnostic/`), and
[`docs/diagnostic-eval-2026-06-12.md`](diagnostic-eval-2026-06-12.md).

This is a **gap analysis of the shipped v0 against the blueprint, turned into a
prioritized v1 build list.** It does **not** repeat the action items already in the
eval report (implies bridges, migraine-with-aura, NAION trigger — those landed in
v1.6–1.8). It covers the **structural/safety gaps** that are *not* on that list.

> Framing unchanged: **decision support, not autonomous diagnosis.** Safety before
> accuracy. Build the screening/safety items before the calibration math.

---

## Status snapshot (blueprint → v0)
✅ implemented · ◐ partial · ○ deferred-to-v1 (acknowledged) · ✗ missing

| Requirement | Status |
|---|---|
| Decision-support framing (disclaimer, no auto-narrow, differential >1) | ✅ |
| Deterministic red-flag gate, never narrowed away, score floor | ✅ |
| Permissive matching (missing ≠ "no") | ✅ |
| Two-weight edges (frequency × evokingStrength) | ✅ |
| Don't-bury-rare-deadly (`rare_critical = 0.45`) | ✅ |
| KB-as-git-JSON, clinician-reviewable | ✅ |
| Device-aware test suggestion (`availableInClinic`) | ✅ |
| Observations re-rank + outcome capture | ✅ |
| Polyhierarchy schema (services array) | ✅ / co-ranking ◐ |
| Risk-weighted next-test (harm-of-missing) | ◐ (harm yes; info-gain no) |
| Patient context as priors (age/systemic/meds/family hx) | ◐ (age only; rest captured-but-unused) |
| Probabilistic core + local/scoped priors | ○ v1 |
| Reliability weighting / surprise→verify | ○ v1 |
| **Context-driven screening track** (silent/coexisting, regardless of complaint) | ✗ |
| Proactive danger-excluding questioning | ◐ |
| Refer / "insufficient local data" exit | ◐ |
| Regime-aware priors (screening base-rate) | ✗ |
| Temporal validity (too-early ≠ excluded) | ○ |
| Treatment-masking / therapeutic conflict (steroid↔glaucoma) | ✗ |
| Functional / non-organic category | ✗ |

**The eval confirmed the predicted failure modes:** compound 33% = no co-ranking;
hit@1 48% = ranking calibration (the Bayesian path); Mode-1 "needs a clinician sign,
parser won't invent it" = correct objective-only handling. v0 nailed the
safety-critical half and deferred the calibration half explicitly.

---

## Prioritized v1 work items

Each item: **problem → build → files → acceptance**. Effort is rough.

### P1 — Context-driven screening track  ⟵ the real omission, highest value
**Problem.** The engine is purely *complaint-driven*, so it misses **silent** disease
(glaucoma, early DR — they don't cause the presenting symptom) and **coexisting**
disease (cataract found ⇒ stops, DME missed). This is the gap between "answers the
complaint" and the blueprint's **"safely close a case."** (Drives the compound-case
failures and the buried-silent-disease danger from Runs A/B.)

**Build.** A parallel screening track that runs off **patient context**, not the
complaint:
- New KB `kb/screening.json` — rules like
  `{ when: { systemic: ['diabetes'] }, recommend: ['dilated-fundus','oct-macula'], reminder: 'DR screen' }`,
  `{ when: { ageMinYears: 50, anySymptom: ['headache','vision_loss'] }, prompt: 'GCA review-of-systems', tests: ['esr-crp'] }`,
  `{ when: { examType: 'comprehensive' }, recommend: ['tonometry','disc-exam'] }`.
- New `models/DxScreening.js`, `engine/screeningTrack.js`.
- Wire into `engine/orchestrator.js` → add `contextScreening: []` to the response
  (separate from `differential`, runs every call).
- Surface in `client/src/pages/Diagnostic.jsx` as a "Screening due" card.

**Acceptance.** Diabetic with complaint "blurry vision" → response includes a
retina-screen recommendation **even when cataract is the top candidate.** Compound
hit@3 improves.
**Effort:** ~1 day.

### P2 — Multi-disease co-ranking
**Problem.** `ranker.js` returns one competitive list; it can't represent "A **and** B
coexist." Compound eval = 33%.

**Build.** After ranking, a **residual-coverage** pass: compute which active findings
the #1 candidate explains; if findings remain **unexplained**, elevate the best
explainer of the *residual* and tag both as `mayCoexist: true` (rather than treating
them as competitors / explaining-away). Optional: noisy-OR-style coverage scoring.
- Files: `engine/ranker.js` (add residual pass) or new `engine/coexistence.js`.

**Acceptance.** Cataract + DME case surfaces **both**, flagged as coexisting, with the
residual (macular) findings attributed to DME.
**Effort:** ~1 day.

### P3 — Wire patient context into ranking + therapeutic-conflict alerts
**Problem.** `complaint.patientContext.{systemic,medications,familyHistory}` is
**captured in `DxSession` but never read by the ranker** (confirmed — engine only uses
`ageYears`). So no risk-factor priors and, critically, **no steroid↔glaucoma alert**
(the real-world Maxitrol case goes uncaught).

**Build.**
- (a) Context-modifier factors in `ranker.js`: ordinal multipliers, e.g. `diabetes`
  ↑ retinal diseases, family-hx glaucoma ↑ glaucoma. Encode in new
  `kb/contextModifiers.json` (`{ condition, affectsDisease|affectsService, factor }`).
- (b) **Safety/caution checker** `engine/safetyChecks.js` + `kb/cautions.json`:
  `{ medicationClass: 'steroid', withCondition: 'glaucoma'|'glaucoma_risk', alert: 'monitor IOP', severity: 'warning' }`.
  Surface as `safetyAlerts: []` in the orchestrator output (a *non-red-flag* warning lane).

**Acceptance.** Patient on a steroid + glaucoma history → a "monitor IOP" safety alert.
Diabetic → retinal candidates get a prior bump.
**Effort:** ~1 day. *(High safety value, no Bayesian dependency — ship with P1.)*

### P4 — Risk-weighted **information-gain** test selection (finish Run C)
**Problem.** `testSuggester.js` weights by `harmIfSkipped` + red-flag multiplier (good)
but **not** by how well a test *splits* the live candidates (it just targets the
highest-evoking unobserved finding — noted as a v0 simplification).

**Build.** For each available test, estimate **expected discrimination** — how its
possible results would separate the current top candidates (entropy/variance
reduction) — then multiply by the existing harm weighting. Keep the
`availableInClinic` filter.
- Files: `engine/testSuggester.js`.

**Acceptance.** When top-2 share the highest-evoking finding, the engine picks the
test that **distinguishes** them, not the one that merely confirms #1.
**Effort:** ~1 day.

### P5 — Regime-aware + scoped priors (local prevalence)
**Problem.** Single global `prevalenceTag`. **Screening base-rate trap:** a "positive"
in a low-prevalence screening population is mostly a false positive — the same engine
that's right in the symptomatic clinic over-refers in screening.

**Build.** Priors keyed by **scope** (`symptomatic` | `screening` | `site:KG`) and
age band; a `regime` field on the session selects the prior. In `screening` regime:
require confirmation before action and report a PPV-style confidence, not a bare
"positive."
- Files: new `kb/priors.json` + `models/DxPrior.js` (or extend `DxDisease`),
  `ranker.js` (select scoped prior), `DxSession` (+`regime`).

**Acceptance.** The same finding yields **lower** confidence under `regime:'screening'`
than `regime:'symptomatic'`.
**Effort:** ~1–2 days. *(Required before any DR-screening deployment.)*

### P6 — Temporal validity (too-early ≠ excluded)
**Problem.** An early **negative** test must not *exclude* an evolving emergency
(hyperacute CRAO before the retina whitens; RAPD not yet developed).

**Build.** `negativePredictiveWindow` (hours from onset) on edges/findings; the engine
refuses to count an early negative as exclusion and emits **"too early to exclude →
safety-net + recheck"** for evolving red-flag candidates.
- Files: `models/DxEdge.js` / `DxFinding.js` schema + gate/ranker logic.

**Acceptance.** Hyperacute artery-occlusion with a not-yet-pale retina still flagged
"cannot exclude, recheck," not cleared.
**Effort:** ~half day.

### P7 — Wrong-data defenses (reliability + surprise) — pairs with the Bayesian upgrade
**Problem.** No defense against a single bad reading (typo, artifact, miscalibration).
v0 has provenance fields (`source`, `amended`, `supersededBy`) but no
`reliabilityWeight`/`qualityMetric`/`surpriseScore` and no logic.

**Build.**
- `source`-based reliability (`device > manual > patient`) **softening** a finding's
  evidence; ingest device quality metrics where available.
- **Surprise score**: a finding with low likelihood under *all* live hypotheses →
  **flag for re-check**, don't let it drive (the "trust depends on corroboration"
  rule; IOP 48 trusted with corroboration, distrusted in a white quiet eye).
- Files: `DxSession.observations` (+ fields), `ranker.js` (soften by reliability),
  new `engine/surprise.js`.

**Acceptance.** A lone implausible IOP in an otherwise-normal eye is **flagged for
re-check**, not acted on. Correcting an amended observation re-runs the session.
**Effort:** ~1–2 days. *(Build alongside the Bayesian ranker.)*

### P8 — Smaller items
- **Functional / non-organic category:** recognize "subjective ≫ objective mismatch"
  — **but only after** the looks-normal organic causes (optic nerve / cortex) are
  excluded. Don't falsely reassure.
- **Explicit ambiguity → refer exit:** when no available test can separate the top
  candidates, emit a `referSuggested` outcome rather than forcing a pick.
- **Objective-only affordances** for the no-historian case (peds): lean on
  observations + caregiver report; the conservative LLM parser already supports this.

---

## v1 WATCH-LIST (dormant in v0, wakes up *with* the Bayesian ranker)
v0's **additive, non-probabilistic** scoring currently sidesteps two failure modes
**for free**. They become live the moment ranking goes multiplicative/Bayesian — add
the mitigations **in the same change**, not after:
- **D — correlated-findings overconfidence.** Multiplying likelihoods over correlated
  findings inflates certainty (0.30→0.97 vs honest 0.56) → premature closure.
  *Mitigation:* collapse correlated findings into composite nodes; cap per-cluster
  evidence; or model the dependency.
- **E — diagnostic momentum.** If charted/prior diagnoses get fed as priors, they
  anchor. *Mitigation:* keep chart-boost **out of the red-flag path**; let
  "worsening on treatment" **lower** the prior dx, not reinforce it.

---

## Suggested phasing
1. **Safety + low-effort, no Bayesian dependency:** **P1** (screening track) + **P3**
   (context + steroid↔glaucoma alert). Biggest safety lift, ~2 days.
2. **Accuracy:** **P2** (co-ranking) + **P4** (info-gain test selection).
3. **Calibration block (do together):** **P5** (scoped/regime priors) + **P7**
   (reliability/surprise) + the **Bayesian-lite ranker** + the **D/E mitigations** from
   the watch-list. **P6** (temporal) folds in here.
4. **Polish:** **P8**.

Items 1–2 raise real-world safety + compound accuracy without touching the scoring
math; the calibration block is the v1→v2 inflection where the probabilistic core and
its known hazards land as one coherent change.

---

*Design notes only. Clinical + regulatory review required before any build ships to
patients. Pairs with `diagnostic-blueprint.md` (rationale) and
`diagnostic-eval-2026-06-12.md` (the v0 baseline these items move).*
