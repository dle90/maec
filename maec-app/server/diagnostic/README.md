# Diagnostic decision-support — v0

API-only triage + ranked-differential service. Decision *support*, not autonomous
diagnosis: a clinician confirms and acts.

Design source: [docs/clinical/diagnostic-blueprint.md](../../../docs/clinical/diagnostic-blueprint.md).
Knowledge content: [docs/clinical/disease-index.md](../../../docs/clinical/disease-index.md)
and [docs/clinical-primer.md](../../../docs/clinical-primer.md).

## What v0 does

1. Take a structured **complaint** (free text + qualifiers + symptom tags + minimal
   patient context).
2. Run a **deterministic red-flag gate**. If any red-flag pattern matches, the
   response includes an emergency banner + referral guidance. Red-flags never get
   "narrowed away" — they stay live until actively excluded.
3. Compute a **ranked differential** (up to 10 candidate diseases) using ordinal
   weighted edges between findings ↔ diseases (rule-based v0; Bayesian-lite in v1).
4. Suggest the **next-best tests** to disambiguate — cheap, available at MAEC per
   Equipment inventory, weighted by *harm-of-missing* not just info gain.
5. Allow follow-up calls to add **observations** (findings as they come in from the
   exam) and re-rank.
6. Record clinician **outcome** for v1 calibration.

## What v0 does NOT do

- No autonomous diagnosis. Output is a *suggestion*, every response carries the
  decision-support disclaimer.
- No image classifiers, no time-series, no per-patient priors (those land in v1/v2).
- No drug doses or prescribing.
- No UI yet — API only. Frontend lands in a later iteration.

## Architecture (v0)

```
[ kb/*.json ]  ─seed─►  [ Mongo dx* collections ]
       │                          │
       └──── source of truth ─────┘
                          │
                          ▼
[ POST /api/diagnostic/sessions ]
                          │
                          ▼
[ redFlagGate ─► complaintMatcher ─► ranker ─► testSuggester ]
                          │
                          ▼
[ session response: redFlags + differential + nextTests + disclaimer ]
```

KB is read-mostly + versioned in git (`kb/*.json` is source of truth, Mongo is the
runtime mirror). Patient/runtime data lives in `dxsessions` (per-encounter).

## Layout

```
diagnostic/
├── README.md             ← this file
├── kb/                   ← hand-authored seed JSON (git-tracked, clinician-reviewable)
│   ├── services.json     ← 9 services (the framework's index)
│   ├── redFlags.json     ← red-flag rules — triggers + actions
│   ├── diseases.json     ← disease monographs
│   ├── findings.json     ← symptoms / signs / test-result findings
│   ├── tests.json        ← tests, device-aware (links to Equipment codes)
│   └── edges.json        ← disease ↔ finding edges (frequency + evokingStrength)
├── models/               ← Mongoose schemas matching the JSON
├── engine/               ← reasoning modules (no probabilistic math in v0)
├── routes.js             ← Express router mounted at /api/diagnostic
├── seed.js               ← npm-runnable seeder: JSON → Mongo, idempotent
└── smoke.js              ← smoke test: 6 worked examples + red-flag triggers
```

## Running

```bash
cd maec-app/server

# Seed the KB into Mongo (idempotent; deletes + re-inserts dx* collections)
node diagnostic/seed.js

# Smoke test (asserts plausible outputs for the 6 worked examples)
node diagnostic/smoke.js

# Start the server normally; /api/diagnostic/* is mounted automatically
npm start
```

## API surface

See [`docs/diagnostic-service-v0.md`](../../../docs/diagnostic-service-v0.md) for
the full reference. Quick view:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/diagnostic/sessions` | Open a session with a complaint; returns differential + red-flags + next-tests |
| `POST` | `/api/diagnostic/sessions/:id/observations` | Add findings as the exam progresses; re-rank |
| `POST` | `/api/diagnostic/sessions/:id/outcome` | Clinician confirms / rejects / refers |
| `GET`  | `/api/diagnostic/sessions/:id` | Current session state |
| `GET`  | `/api/diagnostic/kb/services` | List services |
| `GET`  | `/api/diagnostic/kb/diseases` | List diseases (filterable by service / red-flag) |
| `GET`  | `/api/diagnostic/kb/redFlags` | List active red-flag rules |

## Safety guardrails baked in

- Red-flag candidates are **never eliminated** from the differential — they stay
  on the list with a flag until a confirming/excluding test runs and the
  clinician acknowledges.
- Output **always** includes the decision-support disclaimer string.
- The disease list is **always** longer than 1 (no auto-narrowing to a single
  answer).
- Outcome capture writes to `dxsessions.clinicianOutcome` for calibration —
  feeds the v1 ranker.
- Surprise / outlier handling for v1 (not v0): when a finding doesn't fit any
  live hypothesis, flag the finding for re-check rather than suppress.

See `docs/clinical/diagnostic-blueprint.md §6` for the full robustness rationale.
