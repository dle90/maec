// Diagnostic decision-support — Express router. Mounted at /api/diagnostic.
//
// Auth: any authenticated user can run sessions and read the KB. Only admins
// can re-seed (the seeder is the canonical write path; the API does not edit
// KB content live).

const express = require('express')
const crypto = require('crypto')

const { requireAuth } = require('../middleware/auth')
const { runDiagnostic, DISCLAIMER } = require('./engine/orchestrator')
const { parseComplaint } = require('./llm/parseComplaint')

const DxSession = require('./models/DxSession')
const DxService = require('./models/DxService')
const DxDisease = require('./models/DxDisease')
const DxFinding = require('./models/DxFinding')
const DxTest = require('./models/DxTest')
const DxRedFlag = require('./models/DxRedFlag')

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
// Body: { findingId, eye?, value?, unit?, flag? }
// Adds an observation, re-runs the engine, returns updated session.
router.post('/sessions/:id/observations', requireAuth, async (req, res) => {
  const { findingId, eye, value, unit, flag, source } = req.body || {}
  if (!findingId) return res.status(400).json({ error: 'findingId is required' })

  const session = await DxSession.findById(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  if (session.clinicianOutcome?.closedAt) {
    return res.status(409).json({ error: 'session already closed' })
  }

  session.observations.push({
    at: nowIso(),
    findingId,
    eye: eye || null,
    value,
    unit,
    flag,
    source: source || 'manual',
    enteredBy: req.user?.username || 'unknown',
  })

  const result = await runDiagnostic(session.complaint, session.observations)
  // Preserve any clinician-excluded red-flags rather than dropping them.
  const excludedById = Object.fromEntries(
    (session.redFlags || [])
      .filter(rf => rf.excludedAt)
      .map(rf => [rf.redFlagId, rf])
  )
  const merged = result.redFlags.map(rf =>
    excludedById[rf.redFlagId] ? { ...rf, ...excludedById[rf.redFlagId] } : rf
  )
  // Re-include previously-triggered red-flags that no longer fire — they keep
  // their excludedAt or stay live (safety: never silently drop a fired flag).
  for (const prev of session.redFlags || []) {
    if (!merged.find(m => m.redFlagId === prev.redFlagId)) merged.push(prev)
  }

  session.redFlags = merged
  session.differential = result.differential
  session.recommendedNextTests = result.recommendedNextTests
  session.updatedAt = nowIso()
  await session.save()
  res.json(session)
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
//         referred?, referredReason?, notes? }
router.post('/sessions/:id/outcome', requireAuth, async (req, res) => {
  const body = req.body || {}
  const session = await DxSession.findById(req.params.id)
  if (!session) return res.status(404).json({ error: 'session not found' })
  session.clinicianOutcome = {
    confirmedDiseaseId: body.confirmedDiseaseId,
    confirmedDiseaseName: body.confirmedDiseaseName,
    accepted: !!body.accepted,
    rejected: !!body.rejected,
    referred: !!body.referred,
    referredReason: body.referredReason,
    notes: body.notes,
    closedAt: nowIso(),
    closedBy: req.user?.username || 'unknown',
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

router.get('/kb/disclaimer', requireAuth, async (_req, res) => {
  res.json({ disclaimer: DISCLAIMER })
})

module.exports = router
