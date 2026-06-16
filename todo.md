# TODO

## Active: production-grade upgrade (Phases 0–6)
Full plan + status table: [docs/prod-upgrade-plan.md](docs/prod-upgrade-plan.md).
Shipping one phase at a time (build → deploy → verify on prod → review before next).

- **Phase 0 — Security** ✅ done (prod-verified). bcrypt + lazy-upgrade (23/23
  hashed) + token iat/exp + account-status gate + timingSafeEqual + `SESSION_SECRET`
  rotated in Railway (literal removed, fail-fast).
- **Phase 1 — Data safety** ▶ in progress (Units 1–4 of 9 done + prod-verified):
  atomic Counter + wired generators + unique partial indexes + strict:'throw' on
  6 hot models. **Next:** Unit 5 (atomic FIFO `$gte` decrement + optimistic
  concurrency) → Unit 6 (multi-doc transactions) — both HIGH risk (live billing/
  checkout). Then 7 (audit plugin), 8 (integer-VND), 9 (strict on catalog).
- Phases 2–6: queued (see [docs/prod-upgrade-plan.md](docs/prod-upgrade-plan.md)).

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
