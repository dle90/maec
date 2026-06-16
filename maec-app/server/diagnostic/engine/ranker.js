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

// Pertinent-negative down-ranking. Only a finding that a disease USUALLY has
// (frequency ≥ REFUTE_MIN_FREQ) counts as evidence-against when it's explicitly
// absent; the penalty scales with that frequency.
const REFUTE_MIN_FREQ = 0.6
const REFUTE_WEIGHT = 0.7

// Finding tags the complaint EXPLICITLY rules out (pertinent negatives). Derived
// ONLY from explicit 'none' qualifiers — never from 'unknown'/missing, so an
// incomplete intake is never penalised. Mirrors the qualifier→tag mapping the
// orchestrator uses when these qualifiers are POSITIVE (pain→pain*, vision→loss).
function negatedFindingTags(complaint) {
  const neg = new Set()
  if (complaint?.pain === 'none') {
    neg.add('pain'); neg.add('pain_severe'); neg.add('pain_severe_or_moderate')
  }
  if (complaint?.visionChange === 'none') {
    neg.add('vision_loss_sudden'); neg.add('vision_loss_subacute')
    neg.add('vision_drop'); neg.add('vision_blur_gradual')
  }
  // redness is a qualifier with no finding edge in the KB, so it can't refute via
  // the edge graph — it's consumed by the deterministic red-flag gate instead.
  return neg
}

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
  // Findings backed by an OBSERVATION (entered during the exam) — these are
  // objective and must NOT be down-ranked by a history pertinent-negative (a
  // confirmatory sign like closed-angle gonioscopy outweighs "no pain reported").
  const obsFindings = await expandFindings(
    (observations || []).map(o => o.findingId).filter(Boolean)
  )

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

  // Pertinent negatives: pull edges keyed off the explicitly-absent findings so we
  // know, per candidate, how usual each absent finding is for it.
  const negated = negatedFindingTags(complaint)
  const negByDisease = {}
  if (negated.size) {
    const negEdges = await DxEdge.find({ findingId: { $in: [...negated] } }).lean()
    for (const e of negEdges) (negByDisease[e.diseaseId] ||= []).push(e)
  }

  const diseases = await DxDisease.find({ _id: { $in: candidateIds } }).lean()
  const diseaseMap = Object.fromEntries(diseases.map(d => [d._id, d]))

  const age = complaint.patientContext?.ageYears
  const ranked = []

  for (const did of candidateIds) {
    const d = diseaseMap[did]
    if (!d) continue

    // Split evocation into symptom-derived (refutable by a pertinent negative)
    // and observation-derived (objective; full weight).
    let symScore = 0
    let obsScore = 0
    const supporting = []
    for (const e of byDisease[did]) {
      const w = (e.evokingStrength || 0) * (e.frequency || 0)
      if (obsFindings.has(e.findingId)) obsScore += w
      else symScore += w
      supporting.push(e.findingId)
    }

    const prevalence = PREVALENCE_WEIGHT[d.prevalenceTag] ?? 0.5
    // Graduated age penalty so a candidate wildly out of its age band drops
    // off the top of the list rather than hovering at 0.4× (which intruded
    // — e.g. cataract for a 12-year-old appearing at #2 with score 0.18).
    let ageFactor = 1.0
    if (typeof age === 'number') {
      let gap = 0
      if (typeof d.ageMin === 'number' && age < d.ageMin) gap = d.ageMin - age
      else if (typeof d.ageMax === 'number' && age > d.ageMax) gap = age - d.ageMax
      if (gap > 0) {
        ageFactor = gap > 20 ? 0.1 : gap > 10 ? 0.25 : 0.4
      }
    }

    const isRedFlagCandidate = redFlagDiseases.has(did)

    // Down-rank a candidate when the patient EXPLICITLY lacks a finding this
    // disease usually presents with (e.g. painless eye → angle-closure, which is
    // severe-pain in 95% of cases). The penalty applies ONLY to the symptom-derived
    // suspicion — observation-derived evidence keeps full weight, so a confirmatory
    // exam sign (e.g. closed-angle gonioscopy) is never overridden by a history
    // negative. Skipped entirely for red-flag candidates (a fired red-flag is
    // positive emergency evidence we don't second-guess).
    const refuting = []
    let refuteFactor = 1
    if (!isRedFlagCandidate && negByDisease[did]) {
      for (const e of negByDisease[did]) {
        if ((e.frequency || 0) >= REFUTE_MIN_FREQ) {
          refuteFactor *= 1 - (e.frequency || 0) * REFUTE_WEIGHT
          refuting.push(e.findingId)
        }
      }
    }

    const baseScore = symScore * refuteFactor + obsScore
    let score = baseScore * prevalence * ageFactor

    if (isRedFlagCandidate && score < RED_FLAG_FLOOR) score = RED_FLAG_FLOOR

    // Drop very-low non-red-flag candidates — keeps the differential
    // readable rather than padded with score < 0.05 noise.
    if (score < 0.05 && !isRedFlagCandidate) continue

    ranked.push({
      diseaseId: did,
      name: d.name,
      nameVi: d.nameVi,
      services: d.services,
      score: Number(score.toFixed(3)),
      urgency: d.urgency,
      isRedFlagCandidate,
      supportingFindings: supporting,
      refutingFindings: refuting,
      summary: d.summary,
      treatments: d.treatments || [],   // surfaced for the post-confirmation treatment panel
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
