# Diagnostic service — v0 API reference

Decision-support API for MAEC. Returns a ranked differential, red-flag triggers,
and next-best-test suggestions from a structured complaint. A licensed clinician
must confirm before acting on any output.

**Design source:** [clinical/diagnostic-blueprint.md](clinical/diagnostic-blueprint.md).
**Implementation:** [`maec-app/server/diagnostic/`](../maec-app/server/diagnostic/).
**Status:** API only, no UI.

## What v0 is and isn't

| Does | Doesn't |
|---|---|
| Triage (red-flag gate) | Diagnose autonomously |
| Ranked differential (≤10) | Replace clinician judgment |
| Next-best-test suggestions | Prescribe doses |
| Per-session observation tracking | Use image classifiers |
| Capture clinician outcome | Use patient-specific priors |

## Run

```bash
cd maec-app/server

# 1) Seed the KB into Mongo (idempotent; validates JSON cross-refs first).
node diagnostic/seed.js

# 2) Smoke test — 14 cases, 6 worked examples + 8 red-flag triggers.
node diagnostic/smoke.js

# 3) Normal server start — diagnostic mounts at /api/diagnostic.
npm start
```

The seeder is safe to re-run; it deletes the `dx*` collections only (KB
read-mostly, sessions are not touched).

## KB at a glance

Seeded from version-controlled JSON in `maec-app/server/diagnostic/kb/`:

| Collection | Entries | Source file |
|---|---|---|
| `dxservices` | 9 | `kb/services.json` |
| `dxdiseases` | 69 | `kb/diseases.json` |
| `dxfindings` | 105 | `kb/findings.json` (all aliased) |
| `dxtests` | 35 | `kb/tests.json` (28 in-clinic + 7 referral-only / external) |
| `dxredflags` | 19 | `kb/redFlags.json` |
| `dxedges` | 214 | `kb/edges.json` |

Edit the JSON, re-run the seeder. Clinical reviewers work in the JSON, not the
DB. Cross-references are validated at seed time — typos in disease IDs, missing
findings, etc. fail loudly before any insert.

## Complaint schema

```js
{
  text: String,                     // free-text complaint, optional
  eyeAffected: 'OD'|'OS'|'OU'|'unknown',
  onset: 'sudden'|'subacute'|'gradual'|'unknown',
  durationDays: Number,
  pain: 'none'|'mild'|'moderate'|'severe'|'unknown',
  redness: 'none'|'mild'|'moderate'|'severe'|'unknown',
  visionChange: 'none'|'mild'|'severe'|'lost'|'unknown',
  symptoms: [String],               // finding IDs — see kb/findings.json kind:'symptom'|'context'
  patientContext: {
    ageYears: Number,
    sex: 'M'|'F'|'unknown',
    isContactLensWearer: Boolean,
    recentTrauma: Boolean,
    recentIntraocularSurgeryOrInjection: Boolean,
    systemic: [String],
    medications: [String],
    familyHistory: [String],
  }
}
```

Missing fields are treated as **unknown** rather than "no" — red-flag rules
err on the side of triggering, never silently filtering out emergencies.

## API endpoints

All endpoints require auth via `Authorization: Bearer <token>`. Errors return
`{ error: '...' }`.

### `POST /api/diagnostic/sessions`

Open a session for a complaint; engine runs once, response includes everything.

**Request**
```json
{
  "patientId": "BN-...",
  "encounterId": "ENC-...",
  "complaint": {
    "text": "Đau dữ dội mắt phải, đỏ, nhìn thấy quầng sáng",
    "eyeAffected": "OD",
    "onset": "sudden",
    "pain": "severe",
    "redness": "severe",
    "symptoms": ["pain_severe", "halos", "nausea_vomiting"],
    "patientContext": { "ageYears": 62 }
  }
}
```

**Response (200)**
```json
{
  "_id": "dx_a1b2c3d4e5f6",
  "patientId": "BN-...",
  "encounterId": "ENC-...",
  "createdAt": "2026-06-12T08:15:00.000Z",
  "complaint": { /* echoed */ },
  "observations": [],
  "redFlags": [{
    "redFlagId": "rf-acute-angle-closure",
    "name": "Acute angle-closure glaucoma",
    "nameVi": "Glôcôm góc đóng cấp",
    "urgency": "emergency",
    "services": ["pressure"],
    "candidateDiseases": ["d-acute-angle-closure"],
    "actionGuidance": "Cấp cứu. Đo nhãn áp ngay...",
    "actionGuidanceEn": "Emergency. Measure IOP...",
    "triggeredAt": "2026-06-12T08:15:00.000Z"
  }],
  "differential": [{
    "diseaseId": "d-acute-angle-closure",
    "name": "Acute angle-closure glaucoma",
    "nameVi": "Glôcôm góc đóng cấp",
    "services": ["pressure"],
    "score": 0.74,
    "urgency": "emergency",
    "isRedFlagCandidate": true,
    "supportingFindings": ["halos", "pain_severe", "nausea_vomiting"],
    "summary": "Iris suddenly covers the drainage angle..."
  }],
  "recommendedNextTests": [{
    "testId": "t-tonometry",
    "name": "Tonometry (IOP)",
    "nameVi": "Đo nhãn áp",
    "svcCode": "SVC-IOP",
    "expectedUtility": 0.69,
    "availableInClinic": true,
    "rationale": "Targets finding \"elevated_IOP\" — disambiguates Acute angle-closure glaucoma."
  }],
  "disclaimer": "Decision support only. A licensed clinician must confirm..."
}
```

### `GET /api/diagnostic/sessions/:id`

Returns the current session state.

### `POST /api/diagnostic/sessions/:id/observations`

Add a finding from the exam (e.g. tonometry just measured 48 mmHg, slit-lamp
showed cells and flare). The engine re-ranks. **Observations also feed the
red-flag gate** — a dendritic corneal ulcer added during slit-lamp will fire
`rf-hsv-keratitis` even though it was not in the initial complaint.

**Request**
```json
{
  "findingId": "elevated_IOP",
  "eye": "OD",
  "value": 48,
  "unit": "mmHg",
  "flag": "high"
}
```

Returns the updated session document. The previously triggered red-flags stay
on the session — they are not silently dropped if the new ranking would have
de-prioritised them.

### `POST /api/diagnostic/sessions/:id/redFlags/:redFlagId/exclude`

Clinician actively excludes a red-flag (e.g. ruled out by a test). The red-flag
stays on the session record with `excludedAt`/`excludedBy`/`excludedReason` for
the audit trail.

**Request**
```json
{ "reason": "Gonioscopy showed open angle." }
```

### `POST /api/diagnostic/sessions/:id/outcome`

Clinician closes the session with their decision. This is the training signal
for the v1 ranker.

**Request**
```json
{
  "confirmedDiseaseId": "d-acute-angle-closure",
  "confirmedDiseaseName": "Acute angle-closure glaucoma",
  "accepted": true,
  "referred": false,
  "notes": "LPI scheduled tomorrow."
}
```

### KB read endpoints (GET, auth-only)

| Path | Returns |
|---|---|
| `/api/diagnostic/kb/services` | The 9 services |
| `/api/diagnostic/kb/diseases` | All diseases (`?service=optical` or `?redFlag=true` filter) |
| `/api/diagnostic/kb/findings` | All findings (`?kind=symptom` filter) |
| `/api/diagnostic/kb/tests` | All tests (`?service=pressure` filter) |
| `/api/diagnostic/kb/redFlags` | All red-flag rules |
| `/api/diagnostic/kb/disclaimer` | The decision-support disclaimer string |

## How the engine ranks (v0)

For each candidate disease *d* with active findings *F*:

```
score(d) = ( Σ over edges (d, f) where f ∈ F  of  evokingStrength × frequency )
          × prevalenceFactor(d)
          × ageFactor(d, patientAge)

if disease is a red-flag candidate AND score < 0.05:
    score = 0.05            // floor — never rank below visible
```

- `prevalenceFactor`: `very_common: 1.0, common: 0.8, uncommon: 0.5, rare: 0.3,
  rare_critical: 0.45` (rare-critical lifted to avoid burying the dangerous-rare).
- `ageFactor`: 1.0 if `ageMin ≤ patientAge ≤ ageMax`, else 0.4.
- Sorting: red-flag candidates float above non-red-flag candidates, then by score
  descending. Top 10 returned.

This is intentionally simple. Bayesian-lite priors land in v1; per-patient
priors and ML classifiers in v2.

## Safety guarantees baked in

1. **Red-flags trigger permissively.** Missing data does not block a red-flag
   match; only contradictory data does. The cost of over-triggering is small.
2. **Red-flags are sticky.** Once fired, they stay on the session until the
   clinician actively excludes them via the `/exclude` endpoint. They are never
   silently dropped by re-ranking.
3. **Decision-support disclaimer is on every session response.**
4. **Differential is never auto-narrowed to one.** Top 10 returned, with each
   candidate carrying its supporting findings (so the clinician can audit *why*
   it is on the list).
5. **Outcome capture is the calibration loop.** Every closed session writes
   `clinicianOutcome` — accepted / rejected / referred — for v1 training.

See [`docs/clinical/diagnostic-blueprint.md §6`](clinical/diagnostic-blueprint.md)
for the full robustness rationale (premature closure, rare-deadly buried,
correlated-finding overconfidence, diagnostic momentum, wrong-data handling).

## Roadmap from v0

| v0 | v1 | v2 |
|---|---|---|
| Rule-based ordinal weights | Bayesian-lite (noisy-OR) | Image classifiers feed graph |
| Global priors | Local VN / clinic priors | Per-patient priors |
| Single-pass ranker | Loop with information gain | Inter-service reasoning layer |
| Manual outcome capture | Outcome → ranker recalibration | Active learning |
| API only | UI in Khám encounter pane | Mobile app screening |

## Implementation files

| Layer | File |
|---|---|
| Knowledge base (source-of-truth) | `maec-app/server/diagnostic/kb/*.json` |
| Mongoose models | `maec-app/server/diagnostic/models/Dx*.js` |
| Seeder + validator | `maec-app/server/diagnostic/seed.js` |
| Red-flag matcher | `maec-app/server/diagnostic/engine/redFlagGate.js` |
| Differential ranker | `maec-app/server/diagnostic/engine/ranker.js` |
| Test suggester | `maec-app/server/diagnostic/engine/testSuggester.js` |
| Orchestrator | `maec-app/server/diagnostic/engine/orchestrator.js` |
| HTTP routes | `maec-app/server/diagnostic/routes.js` |
| Smoke test | `maec-app/server/diagnostic/smoke.js` |
| Mount | `maec-app/server/index.js` (`app.use('/api/diagnostic', diagnosticRouter)`) |

## Hooks back to the existing MAEC EMR

- **Encounter linkage:** sessions carry `encounterId`. The next iteration adds a
  thin `Encounter.serviceFindings[]` cache so the encounter pane can render the
  current differential without re-querying.
- **Equipment linkage:** every test in `kb/tests.json` carries an `svcCode`
  matching `Equipment.serviceCodes`. The test suggester's `availableInClinic`
  flag should eventually be derived from the live Equipment inventory rather
  than the static JSON, so a Kim Giang patient gets tests the KG hardware can
  actually run.
- **Audit log:** the project's `auditMiddleware` already wraps `/api`. Writes
  to `/api/diagnostic/sessions/*` are captured automatically.
