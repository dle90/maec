// Diagnostic decision-support — Express router. Mounted at /api/diagnostic.
//
// Auth: any authenticated user can run sessions and read the KB. Only admins
// can re-seed (the seeder is the canonical write path; the API does not edit
// KB content live).

const express = require('express')
const crypto = require('crypto')

const { requireAuth } = require('../middleware/auth')
const { runDiagnostic, DISCLAIMER } = require('./engine/orchestrator')
const { deriveFromMeasurement } = require('./engine/deriveFindings')
const { parseComplaint } = require('./llm/parseComplaint')
const { parseTestResult } = require('./llm/parseTestResult')
const { explainDx } = require('./llm/explainDx')
const { collectActiveFindings } = require('./engine/ranker')
const { getKnownFindingIds } = require('./engine/findingExpansion')
const { mapEncounterExam } = require('./examMapping')
const Encounter = require('../models/Encounter')

const DxSession = require('./models/DxSession')
const DxService = require('./models/DxService')
const DxDisease = require('./models/DxDisease')
const DxFinding = require('./models/DxFinding')
const DxTest = require('./models/DxTest')
const DxRedFlag = require('./models/DxRedFlag')
const DxTreatment = require('./models/DxTreatment')
const DxEdge = require('./models/DxEdge')

const router = express.Router()

function sessionId() {
  return 'dx_' + crypto.randomBytes(6).toString('hex')
}

function nowIso() {
  return new Date().toISOString()
}

// ── LLM complaint parser ────────────────────────────────────

// POST /api/diagnostic/parse-complaint
// Body: { text: "Vietnamese prose from the doctor" }
// Returns: { complaint: {...structured...}, confidence, explanationVi, droppedUnknownTags, usage, model }
// The clinician then reviews / edits the structured complaint before calling
// POST /sessions. The parser never opens a session itself.
router.post('/parse-complaint', requireAuth, async (req, res) => {
  const { text } = req.body || {}
  try {
    const result = await parseComplaint(text)
    res.json(result)
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({
      error: err.message,
      code: err.code || 'PARSE_FAILED',
    })
  }
})

// POST /api/diagnostic/parse-test-result
// Body: { testId, text } — free-text result for a qualitative test (slit-lamp,
// fundus, OCT…) → finding tags scoped to that test. Clinician reviews before the
// chips become observations. Returns 503 if the LLM key isn't configured.
router.post('/parse-test-result', requireAuth, async (req, res) => {
  const { testId, text } = req.body || {}
  try {
    const result = await parseTestResult(testId, text)
    res.json(result)
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({ error: err.message, code: err.code || 'PARSE_FAILED' })
  }
})

// Merge a fresh engine result into the session: preserve clinician red-flag
// exclusions and never silently drop a previously-fired flag (safety).
function applyEngineResult(session, result) {
  const excludedById = Object.fromEntries(
    (session.redFlags || []).filter(rf => rf.excludedAt).map(rf => [rf.redFlagId, rf])
  )
  const merged = result.redFlags.map(rf =>
    excludedById[rf.redFlagId] ? { ...rf, ...excludedById[rf.redFlagId] } : rf
  )
  for (const prev of session.redFlags || []) {
    if (!merged.find(m => m.redFlagId === prev.redFlagId)) merged.push(prev)
  }
  session.redFlags = merged
  session.differential = result.differential
  session.recommendedNextTests = result.recommendedNextTests
  session.updatedAt = nowIso()
}

// Push measurement-derived rows for a test onto a session, superseding that test's
// prior live rows for the same eyes (so re-entry never double-counts). Returns the
// derived finding ids added (for a sync summary). Shared by the observations and
// exam-sync endpoints.
function applyMeasurementRows(session, testId, rows, at) {
  const eyesEntered = new Set(rows.map(r => r.eye))
  for (const o of session.observations) {
    if (o.amended || o.supersededBy || !o.derivedFrom) continue
    if (o.derivedFrom.split(':')[0] === testId && eyesEntered.has(o.eye)) {
      o.amended = true
      o.supersededBy = at
    }
  }
  session.observations.push(...rows)
  return rows.filter(r => r.source === 'derived').map(r => r.findingId)
}

// ── Sessions ────────────────────────────────────────────────

// POST /api/diagnostic/sessions
// Body: { patientId?, encounterId?, complaint }
router.post('/sessions', requireAuth, async (req, res) => {
  const { patientId, encounterId, complaint } = req.body || {}
  if (!complaint || typeof complaint !== 'object') {
    return res.status(400).json({ error: 'complaint is required' })
  }
  const result = await runDiagnostic(complaint, [])
  const session = await DxSession.create({
    _id: sessionId(),
    patientId,
    encounterId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    complaint,
    observations: [],
    redFlags: result.redFlags,
    differential: result.differential,
    recommendedNextTests: result.recommendedNextTests,
    kbVersion: nowIso().slice(0, 10),
    disclaimer: result.disclaimer,
  })
  res.json(session)
})

// GET /api/diagnostic/sessions/:id
router.get('/sessions/:id', requireAuth, async (req, res) => {
  const session = await DxSession.findById(req.params.id).lean()
  if (!session) return res.status(404).json({ error: 'session not found' })
  res.json(session)
})

// POST /api/diagnostic/sessions/:id/observations
// Two body shapes, both re-run the engine and return the updated session:
//   A) legacy direct finding:  { findingId, eye?, value?, unit?, flag?, source? }
//   B) measurement entry:      { testId, measurements: { OD:{...}, OS:{...}, OU:{...} } }
//      — numeric/enum values per eye; the engine derives the categorical findings
//        via the test's threshold rules (see engine/deriveFindings.js). Re-entering
//        a test's measurement supersedes that test's prior rows for the same eyes.
router.post('/sessions/:id/observations', requireAuth, async (req, res) => {
  const body = req.body || {}
  const session = await DxSession.findById(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  if (session.clinicianOutcome?.closedAt) {
    return res.status(409).json({ error: 'session already closed' })
  }
  const enteredBy = req.user?.username || 'unknown'
  const at = nowIso()

  if (body.measurements && typeof body.measurements === 'object') {
    // Shape B — structured measurement entry.
    const { testId } = body
    if (!testId) return res.status(400).json({ error: 'testId is required for measurement entry' })
    const test = await DxTest.findById(testId).lean()
    if (!test) return res.status(404).json({ error: `test ${testId} not found` })

    const { rawObservations, derivedObservations, errors } = deriveFromMeasurement({
      test, measurementsByEye: body.measurements, enteredBy, source: body.source, at,
    })
    const rows = [...rawObservations, ...derivedObservations]
    if (rows.length === 0) {
      return res.status(400).json({ error: 'no valid measurement values', details: errors })
    }
    applyMeasurementRows(session, testId, rows, at)
  } else {
    // Shape A — direct finding (manual sign chip). testId optional, recorded so
    // the suggester knows this test was performed.
    const { findingId, eye, value, unit, flag, source, testId } = body
    if (!findingId) return res.status(400).json({ error: 'either findingId or { testId, measurements } is required' })
    // KB-vocabulary guard: an unknown finding tag matches no edge and no red-flag
    // trigger, so storing it would silently do nothing (and could mask a missed
    // emergency). Reject it loudly instead.
    const known = await getKnownFindingIds()
    if (!known.has(findingId)) {
      return res.status(400).json({ error: `unknown finding tag "${findingId}" — not in the KB vocabulary` })
    }
    session.observations.push({
      at, findingId, eye: eye || null, value, unit, flag, testId,
      source: source || 'manual', enteredBy,
    })
  }

  // The engine reasons only over live (non-superseded) observations.
  const live = session.observations.filter(o => !o.amended && !o.supersededBy)
  const result = await runDiagnostic(session.complaint, live)
  applyEngineResult(session, result)
  await session.save()
  res.json(session)
})

// POST /api/diagnostic/sessions/:id/sync-exam
// Body: { encounterId }. Pull the encounter's recorded NUMERIC exam values (IOP,
// refraction, VA, RNFL, …) into this session as measurement observations, so the
// engine reacts to incidental screening findings even when the patient had no
// complaint (the routine-checkup safety net). Each test's rows supersede that test's
// prior rows, so re-syncing after more exam data is entered is idempotent. Also
// backfills patientContext age/sex from the encounter for age-gated red-flags.
// Free-text fundus/slit-lamp notes are NOT mapped (clinician enters those signs).
router.post('/sessions/:id/sync-exam', requireAuth, async (req, res) => {
  const { encounterId } = req.body || {}
  if (!encounterId) return res.status(400).json({ error: 'encounterId is required' })
  const session = await DxSession.findById(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  if (session.clinicianOutcome?.closedAt) return res.status(409).json({ error: 'session already closed' })
  const encounter = await Encounter.findById(encounterId).lean()
  if (!encounter) return res.status(404).json({ error: `encounter ${encounterId} not found` })

  const enteredBy = req.user?.username || 'exam-sync'
  const at = nowIso()
  const { measurements, context } = mapEncounterExam(encounter)

  const synced = []
  for (const m of measurements) {
    const test = await DxTest.findById(m.testId).lean()
    if (!test) continue
    const { rawObservations, derivedObservations } = deriveFromMeasurement({
      test, measurementsByEye: m.measurementsByEye, enteredBy, source: 'import', at,
    })
    const rows = [...rawObservations, ...derivedObservations]
    if (rows.length === 0) continue
    const derivedFindings = applyMeasurementRows(session, m.testId, rows, at)
    synced.push({ testId: m.testId, label: test.nameVi || test.name || m.testId, derivedFindings })
  }

  // Backfill patient context (never overwrite values already set from the complaint).
  const pc = session.complaint?.patientContext || {}
  if (context.ageYears != null && pc.ageYears == null) pc.ageYears = context.ageYears
  if (context.sex && (!pc.sex || pc.sex === 'unknown')) pc.sex = context.sex
  if (session.complaint) { session.complaint.patientContext = pc; session.markModified('complaint') }

  const live = session.observations.filter(o => !o.amended && !o.supersededBy)
  const result = await runDiagnostic(session.complaint, live)
  applyEngineResult(session, result)
  await session.save()
  res.json({ ...session.toObject(), syncedExam: synced })
})

// POST /api/diagnostic/sessions/:id/complaint
// Replace the complaint on an OPEN session and re-run the engine — lets the
// clinician add/adjust symptoms revealed during the exam without losing
// observations or the outcome-in-progress. Observations are preserved.
router.post('/sessions/:id/complaint', requireAuth, async (req, res) => {
  const { complaint } = req.body || {}
  if (!complaint || typeof complaint !== 'object') {
    return res.status(400).json({ error: 'complaint is required' })
  }
  const session = await DxSession.findById(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  if (session.clinicianOutcome?.closedAt) {
    return res.status(409).json({ error: 'session already closed' })
  }
  // KB-vocabulary guard on the symptom tags (same rationale as observations).
  if (Array.isArray(complaint.symptoms) && complaint.symptoms.length) {
    const known = await getKnownFindingIds()
    const unknown = complaint.symptoms.filter(t => !known.has(t))
    if (unknown.length) {
      return res.status(400).json({ error: `unknown symptom tag(s): ${unknown.join(', ')} — not in the KB vocabulary` })
    }
  }
  session.complaint = complaint
  const live = session.observations.filter(o => !o.amended && !o.supersededBy)
  const result = await runDiagnostic(complaint, live)
  applyEngineResult(session, result)
  await session.save()
  res.json(session)
})

// POST /api/diagnostic/sessions/:id/explain
// Body: { diseaseId, lang? } — LLM explanation of WHY a candidate diagnosis is
// in this patient's differential, grounded in the engine's own matched/refuting
// evidence. On-demand; returns 503 if the LLM key isn't configured.
router.post('/sessions/:id/explain', requireAuth, async (req, res) => {
  const { diseaseId, lang } = req.body || {}
  if (!diseaseId) return res.status(400).json({ error: 'diseaseId is required' })
  const session = await DxSession.findById(req.params.id).lean()
  if (!session) return res.status(404).json({ error: 'session not found' })
  const disease = await DxDisease.findById(diseaseId).lean()
  if (!disease) return res.status(404).json({ error: 'disease not found' })

  const diff = session.differential || []
  const idx = diff.findIndex(d => d.diseaseId === diseaseId)
  const entry = idx >= 0 ? diff[idx] : null
  const edges = await DxEdge.find({ diseaseId }).lean()
  const live = (session.observations || []).filter(o => !o.amended && !o.supersededBy)
  const active = await collectActiveFindings(session.complaint, live)

  const supporting = edges.filter(e => e.evokingStrength > 0)
    .map(e => ({ finding: e.findingId, evoking: e.evokingStrength, frequency: e.frequency, present: active.has(e.findingId) }))
    .sort((a, b) => b.evoking - a.evoking)
  const refuting = edges.filter(e => e.evokingStrength <= 0 && active.has(e.findingId))
    .map(e => ({ finding: e.findingId, evoking: e.evokingStrength }))
  const presentSupporting = supporting.filter(s => s.present)
  const notYetObserved = supporting.filter(s => !s.present).slice(0, 6).map(s => s.finding)
  const ctx = session.complaint?.patientContext || {}

  try {
    const result = await explainDx({
      lang: lang === 'en' ? 'en' : 'vi',
      patient: {
        ageYears: ctx.ageYears, sex: ctx.sex,
        context: [...(ctx.systemic || []), ...(ctx.isContactLensWearer ? ['contact lens wearer'] : []), ...(ctx.recentTrauma ? ['recent trauma'] : [])],
      },
      complaintSymptoms: session.complaint?.symptoms || [],
      observations: live.map(o => o.findingId).filter(Boolean),
      candidate: {
        nameVi: disease.nameVi, name: disease.name, summary: disease.summary,
        prevalenceTag: disease.prevalenceTag, urgency: entry?.urgency || disease.urgency,
        score: entry ? entry.score : 'not in current top list', rank: idx >= 0 ? idx + 1 : '—',
      },
      supporting: (presentSupporting.length ? presentSupporting : supporting).slice(0, 8),
      refuting,
      notYetObserved,
    })
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'EXPLAIN_FAILED' })
  }
})

// POST /api/diagnostic/sessions/:id/redFlags/:redFlagId/exclude
// Clinician actively excludes a red-flag (with a reason). It stays on the
// session but won't show as "live" — the safety log is preserved.
router.post('/sessions/:id/redFlags/:redFlagId/exclude', requireAuth, async (req, res) => {
  const { reason } = req.body || {}
  const session = await DxSession.findById(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  const rf = (session.redFlags || []).find(r => r.redFlagId === req.params.redFlagId)
  if (!rf) return res.status(404).json({ error: 'red flag not found on session' })
  rf.excludedAt = nowIso()
  rf.excludedBy = req.user?.username || 'unknown'
  rf.excludedReason = reason || ''
  session.markModified('redFlags')
  session.updatedAt = nowIso()
  await session.save()
  res.json(session)
})

// POST /api/diagnostic/sessions/:id/outcome
// Body: { confirmedDiseaseId?, confirmedDiseaseName?, accepted?, rejected?,
//         referred?, referredReason?, selectedTreatments?, notes?, close? }
// Two-step: confirming a diagnosis (no `close`) records it but keeps the session
// OPEN so the clinician can review treatment suggestions; `close: true` (the final
// "save & close" action) is what actually closes the session.
router.post('/sessions/:id/outcome', requireAuth, async (req, res) => {
  const body = req.body || {}
  const session = await DxSession.findById(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  if (session.clinicianOutcome?.closedAt) return res.status(409).json({ error: 'session already closed' })
  const prev = session.clinicianOutcome || {}
  session.clinicianOutcome = {
    confirmedDiseaseId: body.confirmedDiseaseId,
    confirmedDiseaseName: body.confirmedDiseaseName,
    accepted: !!body.accepted,
    rejected: !!body.rejected,
    referred: !!body.referred,
    referredReason: body.referredReason,
    selectedTreatments: Array.isArray(body.selectedTreatments) ? body.selectedTreatments : (prev.selectedTreatments || []),
    notes: body.notes != null ? body.notes : prev.notes,
    closedAt: body.close ? nowIso() : (prev.closedAt || null),
    closedBy: body.close ? (req.user?.username || 'unknown') : (prev.closedBy || null),
  }
  session.updatedAt = nowIso()
  await session.save()
  res.json(session)
})

// ── KB read endpoints (auth-only, read-only) ────────────────

router.get('/kb/services', requireAuth, async (_req, res) => {
  res.json(await DxService.find({}).lean())
})

router.get('/kb/diseases', requireAuth, async (req, res) => {
  const q = {}
  if (req.query.service) q.services = req.query.service
  if (req.query.redFlag === 'true') q.redFlag = true
  res.json(await DxDisease.find(q).lean())
})

router.get('/kb/findings', requireAuth, async (req, res) => {
  const q = {}
  if (req.query.kind) q.kind = req.query.kind
  res.json(await DxFinding.find(q).lean())
})

router.get('/kb/tests', requireAuth, async (req, res) => {
  const q = {}
  if (req.query.service) q.services = req.query.service
  res.json(await DxTest.find(q).lean())
})

router.get('/kb/redFlags', requireAuth, async (_req, res) => {
  res.json(await DxRedFlag.find({}).lean())
})

router.get('/kb/treatments', requireAuth, async (_req, res) => {
  res.json(await DxTreatment.find({}).lean())
})

router.get('/kb/disclaimer', requireAuth, async (_req, res) => {
  res.json({ disclaimer: DISCLAIMER })
})

module.exports = router
