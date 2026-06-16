# TODO

_Nothing open right now._

## Recently completed

- **Dx engine — pertinent-negative down-ranking** (`ranker.js`). An emergency no
  longer leads the differential when its hallmark is explicitly absent. Refute
  applies to symptom-derived evocation only (observation/exam evidence keeps full
  weight); fires only on explicit `'none'` (never `unknown`); never touches a
  red-flag candidate; red-flag GATE untouched. Validation batch at baseline
  **77/91/93** (zero regression).
- **Pertinent-negative capture in the UI** — ComplaintForm has a "Không có (đã hỏi):
  [Không đau] [Không đỏ] [Thị lực bình thường]" toggle row (+ AI-parse captures
  parsed `'none'`), so the down-rank fires in the normal chip flow, not just via
  the API. Verified end-to-end: toggle "Không đau" on a halos complaint drops
  acute angle-closure.
- **Prod test-data prune** — `scripts/cleanup-testdata.js` (dry-run by default,
  `--apply` to delete; scoped to `_TEST*_`/`_ADVR_` names + open-orphan dx-sessions,
  keeps closed/confirmed sessions). Ran on prod: deleted 14 patients, 17 encounters,
  543 dx-sessions; 9 confirmed-outcome sessions preserved; 0 test rows remaining.
  Re-runnable any time.
