// Next-best-test recommender — rule-based v0.
//
// For the top candidates in the current differential, find their highest-
// evoking findings that are NOT yet observed, then map each finding to the
// test that produces it. Available-in-clinic + harm-of-missing weighting.
//
// v0 simplification: doesn't formally compute "expected information gain" /
// test that best splits the candidates. That's a v1 upgrade.

const DxEdge = require('../models/DxEdge')
const DxTest = require('../models/DxTest')

async function suggestNextTests(differential, activeFindings, limit = 5) {
  if (!differential || !differential.length) return []

  const topIds = differential.slice(0, 6).map(d => d.diseaseId)

  const edges = await DxEdge.find({ diseaseId: { $in: topIds } })
    .sort({ evokingStrength: -1, frequency: -1 })
    .lean()

  const tests = await DxTest.find({}).lean()
  // findingId -> first test that produces it
  const findingToTest = {}
  for (const t of tests) {
    for (const fid of t.producesFindings || []) {
      if (!findingToTest[fid]) findingToTest[fid] = t
    }
  }

  // For each edge whose finding isn't observed yet, find the test, weight, dedup.
  const byTest = new Map()
  for (const e of edges) {
    if (activeFindings.has(e.findingId)) continue
    const test = findingToTest[e.findingId]
    if (!test || !test.availableInClinic) continue

    const diseaseObj = differential.find(d => d.diseaseId === e.diseaseId)
    const rfMultiplier = diseaseObj?.isRedFlagCandidate ? 1.5 : 1.0
    const harmMult = (test.harmIfSkipped || 3) / 5
    const utility = (e.evokingStrength || 0) * (e.frequency || 0) * harmMult * rfMultiplier

    const existing = byTest.get(test._id)
    if (!existing || existing.expectedUtility < utility) {
      byTest.set(test._id, {
        testId: test._id,
        name: test.name,
        nameVi: test.nameVi,
        svcCode: test.svcCode,
        expectedUtility: Number(utility.toFixed(3)),
        availableInClinic: test.availableInClinic,
        rationale: `Targets finding "${e.findingId}" — disambiguates ${diseaseObj?.name || e.diseaseId}.`,
      })
    }
  }

  return Array.from(byTest.values())
    .sort((a, b) => b.expectedUtility - a.expectedUtility)
    .slice(0, limit)
}

module.exports = { suggestNextTests }
