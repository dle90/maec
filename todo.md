# TODO

## Dx engine — down-rank an emergency when its hallmark signs are explicitly ABSENT

**Problem.** The differential ranker is purely *additive* (Σ evokingStrength × frequency × prevalence × age over present findings). It never *subtracts* for explicitly-negative findings. So a complaint can surface an emergency even when the patient explicitly lacks that emergency's defining signs.

**Concrete case (the one that triggered this).** "38M, painless monocular halos 3 days, no pain/redness" → the engine led with **acute angle-closure glaucoma [emergency]** (evoked by `halos`), even though AACG is classically *painful + red* and the patient explicitly has neither. The absent `pain`/`redness` should have pushed AACG down.

**Where.**
- Scorer: `maec-app/server/diagnostic/engine/ranker.js` (additive scoring; add negative/refuting handling here).
- Complaint qualifiers carry explicit negatives: `complaint.pain: 'none'`, `complaint.redness: 'none'`, `complaint.visionChange`, etc. (see `models/DxSession.js` complaint schema). Currently only positive symptoms/qualifiers feed the score.
- The differential entry schema already has a `refutingFindings: [String]` field (`models/DxSession.js` ~line 90) that is **defined but unused/empty** — natural place to surface what argued against a candidate.

**Approach options (pick during implementation).**
1. **Per-disease expected qualifiers / refuting edges in the KB.** Add (to `kb/edges.json` or a new `refutes` list per disease) the hallmark qualifiers a disease *requires*; when the complaint explicitly negates one (e.g. AACG expects pain≥moderate + redness≥moderate, complaint says pain:none/redness:none), apply a penalty multiplier and record it in `refutingFindings`. Most principled; needs KB authoring.
2. **Heuristic dampening for urgency tiers.** Lighter: for emergency/urgent_referral diseases, if a key qualifier known to be near-universal for it (pain for AACG/scleritis/keratitis, redness for AACG/uveitis) is explicitly `'none'`, multiply the score by a dampening factor. Faster, less data, but coarser.
3. Keep red-flag GATE untouched (it's deterministic & permissive on missing data — correct). This change is for the *ranked differential* only, so a genuine emergency still can't be silently dropped (red-flag rules still fire on positive triggers).

**Guardrails.** Only down-rank on EXPLICIT negatives (`'none'`/`false`), never on `'unknown'`/missing (missing ≠ absent — don't penalize incomplete intake). Re-run the validation batches after (`tmp-playwright/` repro scripts; engine smoke `maec-app/server/diagnostic/smoke.js`) to confirm no emergency regressions.

**Refs.** FOLLOWUPS.md → "Dx engine — POST /sessions crash-hardening + CSC coverage gap" (CSC incident) and the adversarial-review backlog. This item is the "deeper gap" called out there.

---

## Also pending (housekeeping, not started)

- **Prune prod test data.** `_TEST_` / `_TESTFE_` / `_ADVR_` / `_TESTUI*_` patients + encounters and orphan `dx_*` sessions (no patient) accumulated during sims/reviews/repros. Hard-delete via `railway ssh` running a name-prefix `deleteMany` (see `tmp-playwright/cleanup-testfe.js` pattern). Non-urgent.
