# MAEC — Production-grade upgrade plan

**Decided 2026-06-16.** Bring the MAEC codebase + database to production-grade:
safe, correct, observable, maintainable. **Stays on MongoDB/Mongoose** (no DB
engine change) and **adds no new product features** — "prod-grade" here means
hardening what already exists. Scope chosen: **Full (Phases 0–6)**, shipped
**one phase at a time** (build → deploy → verify on prod → review before next).

> Standalone from Medisync/his-core (Postgres). We borrow *patterns* from
> his-core (atomic sequence-counter, per-facility pricing shape, audit columns,
> int money), not the engine. The diagnostic engine is the crown jewel and will
> keep expanding — Mongo is the right fit for it.

## Principles
- **Incremental & reversible.** Every step is independently shippable and
  verified on prod before the next. No big-bang rewrites.
- **Don't break the React client.** API changes are additive / backward-compatible;
  response-envelope + pagination migrate endpoint-by-endpoint.
- **Zero-downtime by default.** Anything with user impact (e.g. logging everyone
  out on a secret rotation) is called out and timed deliberately.
- **Verify on prod** with the test→deploy→verify loop already in use; document in
  [FOLLOWUPS.md](../FOLLOWUPS.md).

## Status
| Phase | Title | Status |
|---|---|---|
| 0 | Security | ✅ done |
| 1 | Data safety (Mongo hardening) | ▶ in progress (Units 1–4 of 9 done) |
| 2 | API hygiene (validation/errors) | ☐ todo |
| 3 | Observability & ops | ☐ todo |
| 4 | Testing & CI gate | ☐ todo |
| 5 | Maintainability refactor | ☐ todo |
| 6 | Diagnostic-engine hardening | ☐ todo |

---

## Phase 0 — Security `[S, urgent]` ✅ shipped 2026-06-16 (`043be36`)
Live holes, all in [auth.js](../maec-app/server/routes/auth.js).

- [x] **bcrypt passwords.** Hash on user-create/update; on login, `bcrypt.compare`
      for hashed values and **lazy-upgrade** legacy plaintext on successful login
      (zero-downtime). `bcryptjs` (pure-JS, Railway-safe).
- [x] **Straggler migration** `scripts/hash-passwords.js` (dry-run default,
      `--apply`) — run on prod, 23/23 users hashed, 0 plaintext remaining.
- [x] **Account-status gate** on login (reject `employmentStatus` inactive/resigned).
- [x] **Token expiry.** Add `iat`/`exp` to signed tokens (env TTL,
      `AUTH_TOKEN_TTL_SEC`, default 12h); `verify()` rejects expired, **grandfathers
      legacy tokens with no `exp`** (zero-downtime). Return `expiresAt` to client.
- [x] **Secret to env + rotate** — `SESSION_SECRET` rotated to a fresh 96-char value
      in Railway, committed literal removed, fail-fast if unset, `timingSafeEqual`
      on compare. Done while no one was using the app (all prior tokens invalidated).
      Move signing secret to required env (`SESSION_SECRET`), remove the committed
      `'maec-secret-2026'` literal, fail-fast if unset, `timingSafeEqual` on compare.
      **Done as a deliberate off-hours step** (rotating the secret invalidates all
      live tokens → everyone re-logs in once).

Files: [auth.js](../maec-app/server/routes/auth.js),
[User.js](../maec-app/server/models/User.js), `scripts/hash-passwords.js` (new),
`package.json` (+bcryptjs). **Verify:** login still works; new token carries `exp`;
plaintext password gets hashed after one login; inactive account is blocked.

---

## Phase 1 — Data safety (Mongo hardening) `[M]`
The correctness core. Atlas is a replica set → transactions work. Sequenced into
9 independently-shippable units (mapped by a read-only audit workflow 2026-06-16).
The dup-audit gate came back **CLEAN** (0 duplicate codes), so unique indexes
built with no dedup migration.

- [x] **Unit 1 — Counter primitive + dup-audit (inert prep)** (`40cddd9`).
      `models/Counter.js` + `lib/counters.js` (atomic `nextSeq` via
      `findOneAndUpdate $inc upsert`) + `scripts/audit-natural-key-dups.js` +
      `scripts/smoke-counter.js`. Prod: 50 concurrent → 50 distinct; audit CLEAN.
- [x] **Unit 2 — wire generators to the atomic counter** (`5abb209`).
      invoice / inventory-tx / stocktake / patient(+booking+partner-admin) codes
      now drawn atomically, exact formats preserved. Kills the count+1 /
      `Math.random()` collision races at the source. Prod-verified.
- [x] **Unit 3 — unique partial indexes** (`6aab9d8`). invoiceNumber,
      transactionNumber, sessionNumber, patientId, Supply(productKind,productCode)
      — unique partial `{$gt:''}`. Built on prod, re-audit CLEAN.
- [x] **Unit 4 — `strict:'throw'` on the safe hot models** (`55584eb`).
      Encounter/Invoice/Payment/InventoryTransaction/StocktakeSession/Patient
      (+ explicit item subschemas). Verified no `...req.body` spread in their
      write paths. In-memory + prod probe: valid OK, unknown fields rejected.
- [ ] **Unit 5 — atomic lot decrement + optimistic concurrency** `[high risk]`
      Conditional `$gte` FIFO decrement (no oversell) + `optimisticConcurrency`
      on Encounter/Invoice/StocktakeSession (lost-update → 409).
- [ ] **Unit 6 — multi-document transactions** `[high risk]` `withTxn` (topology-
      aware) around checkout / confirm / stocktake-approve / refund.
- [ ] **Unit 7 — audit plugin** (`createdBy`/`updatedBy`/`updatedAt` via
      AsyncLocalStorage request context). Keep dates as ISO Strings.
- [ ] **Unit 8 — integer-VND money setters** (`Math.round` setter on amount
      fields only; leave percent/rate/step/conversion as floats).
- [ ] **Unit 9 — `strict:'throw'` on catalog + inventory-master models** `[high risk]`
      after a `req.body`-spread → schema-paths-whitelist cleanup (gated by a field audit).

**Open clinic question (does not block):** should invoice (HD-) / inventory
(NK-/XK-) numbers be **per-site** (2 locations) rather than the current global
per-day counter? VN accounting often wants per-site books. Shipped global-per-day;
revisit on confirmation.

---

## Phase 2 — API hygiene (validation / errors / responses) `[M]`
- [ ] **zod validation middleware** per write route → clean `400`, never a crash.
      Start with the crash-prone routes (dx sessions, encounters, invoicing).
- [ ] **Shared enum/field-values registry** (value + VN label) feeding validators
      *and* client dropdowns (one source of truth).
- [ ] **`ApiError` + terminal Express error middleware + `asyncHandler`** — maps
      Mongoose `ValidationError`/`CastError`/`E11000` → 4xx. Replaces the global
      crash-net guards added during the outage with proper handling.
- [ ] **Response envelope + pagination helper** — introduced on new/changed
      endpoints, migrated gradually so the client keeps working.

**Verify:** malformed payloads return structured 4xx with field errors; list
endpoints paginate; no unhandled rejection reaches `process`.

---

## Phase 3 — Observability & ops `[S]`
- [ ] **`pino` structured logging** + request-id; replace `console.log`.
- [ ] **`/healthz` + `/readyz`** (Mongo ping), registered before the SPA catch-all;
      point Railway healthcheck at `/readyz`.
- [ ] **`config.js`** that validates required env at boot (fail-fast), CORS
      allowlist, Mongo pool/timeout tuning.

**Verify:** `/readyz` reflects DB connectivity; missing required env fails the
boot loudly; logs carry request ids.

---

## Phase 4 — Testing & CI gate `[M]`
- [ ] **Smoke test** (boot → `/healthz` → key reads) + unit tests on risky logic:
      FIFO inventory, invoicing/counters, dx ranker + red-flag gate + down-rank.
- [ ] **GitHub Actions**: lint + tests on push/PR → **block red builds before
      Railway deploys** (closes the "no tests → crash reached prod" gap).
- [ ] (Optional) `mongodb-memory-server` for hermetic DB tests.

**Verify:** a deliberately broken change fails CI and does not deploy.

---

## Phase 5 — Maintainability refactor `[L, incremental]`
Opportunistic, on touched code — not a rewrite.
- [ ] **Thin service layer** extracted from the fattest routers
      ([encounters.js](../maec-app/server/routes/encounters.js) ~960 LOC,
      [inventory.js](../maec-app/server/routes/inventory.js) ~1173) — routes become
      transport wrappers over services.
- [ ] **`integrations/` layer**: consolidate the 3 duplicated Anthropic
      `getClient()` caches, generalize [r2.js](../maec-app/server/lib/r2.js),
      pre-build the home for a future PACS gateway.
- [ ] **Read-model projections** (`.select()`/aggregation) for list endpoints.

---

## Phase 6 — Diagnostic-engine hardening `[M]`
The crown jewel — where crashes happened and where growth is.
- [ ] **Finish route hardening:** try/catch + validation on the remaining dx
      session routes (observations / sync-exam / complaint) — `/sessions` done.
- [ ] **Consolidate `llm/` client** + timeouts/retries/structured errors.
- [ ] **KB versioning** + keep `validate-kb` in the seed path.
- [ ] **Tests** for ranker, red-flag gate, pertinent-negative down-rank.
- [ ] **OpenAPI** (via `zod-to-openapi`) for the dx API → supports future
      mobile-app type-sharing.

---

## Out of scope (separate roadmap — *features*, not "prod-grade")
The hardening makes each easier later; hooks noted where relevant.
- Per-site `ServicePrice` collection/module (catalog split).
- Orders / encounter-form model (composable station modules).
- PACS/imaging stack (Orthanc + OHIF), watched-folder ingestor, DICOM path.
- IOL calculation workflow.
- Mobile staff app (Expo / React Native).

## Recommended sequencing
Strictly **0 → 1 → 2 → 3 → 4**, then **5 / 6** interleaved opportunistically.
0–3 are the real prod-grade bar; 4 keeps it that way; 5–6 are maturity/ongoing.
