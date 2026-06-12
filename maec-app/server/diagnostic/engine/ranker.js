// Differential ranker — rule-based v0.
//
// For each candidate disease, score = sum(evokingStrength * frequency) over
// active findings, then weighted by disease prevalence + age-band fit.
// Red-flag candidate diseases get a score floor so they cannot be ranked away.
//
// "Active findings" = the union of complaint.symptoms (patient-reported tags)
// and any observations (clinician-entered findings during the exam).

const DxDisease = require('../models/DxDisease')
const DxEdge = require('../models/DxEdge')
const { expandFindings } = require('./findingExpansion')

const PREVALENCE_WEIGHT = {
  very_common: 1.0,
  common: 0.8,
  uncommon: 0.5,
  rare: 0.3,
  rare_critical: 0.45,  // intentionally NOT bottom — don't bury rare-deadly
}

const RED_FLAG_FLOOR = 0.05

async function collectActiveFindings(complaint, observations) {
  // Includes everything the implies graph entails — e.g. observing pain_severe
  // also activates the parent `pain` tag, so generic-pain edges contribute.
  return await expandFindings([
    ...(complaint.symptoms || []),
    ...(observations || []).map(o => o.findingId).filter(Boolean),
  ])
}

async function rankDifferential(complaint, observations, redFlags, limit = 10) {
  const activeFindings = await collectActiveFindings(complaint, observations)

  // Force-include any disease that a triggered red-flag points at.
  const redFlagDiseases = new Set()
  for (const rf of redFlags || []) {
    for (const did of rf.candidateDiseases || []) redFlagDiseases.add(did)
  }

  // Pull every edge keyed off an active finding.
  const edges = activeFindings.size
    ? await DxEdge.find({ findingId: { $in: [...activeFindings] } }).lean()
    : []

  const byDisease = {}
  for (const e of edges) {
    if (!byDisease[e.diseaseId]) byDisease[e.diseaseId] = []
    byDisease[e.diseaseId].push(e)
  }
  // Make sure red-flag diseases are scored even with no matching edges.
  for (const did of redFlagDiseases) {
    if (!byDisease[did]) byDisease[did] = []
  }

  const candidateIds = Object.keys(byDisease)
  if (!candidateIds.length) return []

  const diseases = await DxDisease.find({ _id: { $in: candidateIds } }).lean()
  const diseaseMap = Object.fromEntries(diseases.map(d => [d._id, d]))

  const age = complaint.patientContext?.ageYears
  const ranked = []

  for (const did of candidateIds) {
    const d = diseaseMap[did]
    if (!d) continue

    let baseScore = 0
    const supporting = []
    for (const e of byDisease[did]) {
      baseScore += (e.evokingStrength || 0) * (e.frequency || 0)
      supporting.push(e.findingId)
    }

    const prevalence = PREVALENCE_WEIGHT[d.prevalenceTag] ?? 0.5
    let ageFactor = 1.0
    if (typeof age === 'number') {
      if (typeof d.ageMin === 'number' && age < d.ageMin) ageFactor = 0.4
      if (typeof d.ageMax === 'number' && age > d.ageMax) ageFactor = 0.4
    }

    let score = baseScore * prevalence * ageFactor

    const isRedFlagCandidate = redFlagDiseases.has(did)
    if (isRedFlagCandidate && score < RED_FLAG_FLOOR) score = RED_FLAG_FLOOR

    // Drop pure-zero non-red-flag candidates — no signal at all.
    if (score <= 0 && !isRedFlagCandidate) continue

    ranked.push({
      diseaseId: did,
      name: d.name,
      nameVi: d.nameVi,
      services: d.services,
      score: Number(score.toFixed(3)),
      urgency: d.urgency,
      isRedFlagCandidate,
      supportingFindings: supporting,
      refutingFindings: [],
      summary: d.summary,
    })
  }

  ranked.sort((a, b) => {
    // Red-flag candidates float above the rest at any given score band,
    // then plain score-descending.
    if (a.isRedFlagCandidate !== b.isRedFlagCandidate) {
      return a.isRedFlagCandidate ? -1 : 1
    }
    return b.score - a.score
  })

  return ranked.slice(0, limit)
}

module.exports = { rankDifferential, collectActiveFindings }
