# TODO

## ✅ DONE — Dx engine: down-rank an emergency when its hallmark signs are explicitly ABSENT

Shipped (`ranker.js`). The differential ranker was purely additive; now a complaint's
explicit `'none'` qualifiers (pain, visionChange) map to the finding tags they'd
otherwise produce, and for each NON-red-flag candidate the **symptom-derived**
suspicion is dampened ×(1 − frequency·0.7) per absent *usual* finding (frequency
≥ 0.6). Recorded in the previously-unused `refutingFindings`.

Key design point (a regression caught by the validation batch forced this): the
penalty applies **only to symptom-derived evocation**, not observation-derived —
`baseScore = symScore · refuteFactor + obsScore`. So a confirmatory exam sign
(e.g. closed-angle gonioscopy) is never overridden by a history negative.

Guardrails (all verified on prod): fires only on explicit `'none'` (never
`unknown`/missing); never touches a red-flag candidate; red-flag GATE untouched.
Validation batch back to baseline **77 / 91 / 93** (top-1 / top-3 / red-flag) — zero
net regression. Painless-halos correctly drops acute angle-closure; exam-confirmed
AACG stays top.

### Follow-up (open) — capture pertinent negatives in the chip UI
The down-rank only fires on explicit `pain:'none'` / `visionChange:'none'`. The
**AI free-text parser** sets those (from e.g. "không đau đỏ"), so it works on that
path. But the **chip-based intake leaves them `'unknown'`**, so the feature is
latent for chip users. To make it fire in normal use, add a small "pertinent
negatives" capture to `ComplaintForm` (Diagnostic.jsx) — e.g. a "Không có:
[Đau] [Đỏ] [Giảm thị lực]" toggle row that sets the qualifiers to `'none'`.
(`redness:'none'` has no ranker effect — no redness finding edge — but is read by
the red-flag gate, so capturing it is still useful.)

---

## Also pending (housekeeping, not started)

- **Prune prod test data.** `_TEST_` / `_TESTFE_` / `_ADVR_` / `_TESTUI*_` patients +
  encounters and orphan `dx_*` sessions (no patient) accumulated during sims /
  reviews / repros. Hard-delete via `railway ssh` running a name-prefix
  `deleteMany` (see `tmp-playwright/cleanup-testfe.js`). Non-urgent.
