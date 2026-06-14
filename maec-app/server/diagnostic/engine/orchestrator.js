// Orchestrator — ties the three engine modules into one call.
//
// runDiagnostic(complaint, observations) → { redFlags, differential,
// recommendedNextTests, disclaimer }. Pure function over the KB + inputs; the
// session lifecycle (persist, amend, close out) lives in routes.js.

const { runRedFlagGate } = require('./redFlagGate')
const { rankDifferential, collectActiveFindings } = require('./ranker')
const { suggestNextTests } = require('./testSuggester')

const DISCLAIMER = 'Decision support only. A licensed clinician must confirm before acting on any output. ' +
  'This system suggests possibilities and next tests; it does not diagnose.'

// Bridge structured qualifiers into the finding-tag space the gate + ranker
// reason over. Two qualifiers carry diagnostic weight but are often only stored
// as enums, not emitted as tags by the LLM parser:
//
//  - Laterality (`eyeAffected`): a one-eye complaint IS monocular by definition.
//    OD/OS → `monocular`, OU → `binocular`. Several red-flag rules (rf-rao,
//    rf-naion, rf-rvo, rf-gca) require the `monocular` tag.
//  - Pain severity (`pain`): some rules/edges express pain as a tag
//    (`pain_severe`, `pain_severe_or_moderate`) rather than a qualifier, and the
//    implies graph only flows specific→general — so generic `pain` never yields
//    the severity tag. Derive it: severe → `pain_severe`, moderate →
//    `pain_severe_or_moderate`, mild → `pain` (expansion handles the rest).
//
// Idempotent; never removes an already-present tag.
function normalizeComplaint(complaint) {
  const c = complaint || {}
  const symptoms = new Set(c.symptoms || [])
  const before = symptoms.size

  if (c.eyeAffected === 'OD' || c.eyeAffected === 'OS') symptoms.add('monocular')
  else if (c.eyeAffected === 'OU') symptoms.add('binocular')

  if (c.pain === 'severe') symptoms.add('pain_severe')
  else if (c.pain === 'moderate') symptoms.add('pain_severe_or_moderate')
  else if (c.pain === 'mild') symptoms.add('pain')

  if (symptoms.size === before) return c
  return { ...c, symptoms: [...symptoms] }
}

async function runDiagnostic(rawComplaint, observations = []) {
  const complaint = normalizeComplaint(rawComplaint)
  const redFlags = await runRedFlagGate(complaint, observations)
  const differential = await rankDifferential(complaint, observations, redFlags)
  const activeFindings = await collectActiveFindings(complaint, observations)
  // Tests already administered: a measurement row carries `<testId>:<key>` in
  // derivedFrom; a manual sign row carries `testId`. Either marks a test done.
  const performedTestIds = new Set(
    (observations || [])
      .map(o => (o.derivedFrom ? String(o.derivedFrom).split(':')[0] : o.testId))
      .filter(Boolean)
  )
  const recommendedNextTests = await suggestNextTests(differential, activeFindings, performedTestIds)
  return {
    redFlags,
    differential,
    recommendedNextTests,
    disclaimer: DISCLAIMER,
  }
}

module.exports = { runDiagnostic, DISCLAIMER }
