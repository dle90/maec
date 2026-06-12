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

async function runDiagnostic(complaint, observations = []) {
  const redFlags = await runRedFlagGate(complaint)
  const differential = await rankDifferential(complaint, observations, redFlags)
  const activeFindings = collectActiveFindings(complaint, observations)
  const recommendedNextTests = await suggestNextTests(differential, activeFindings)
  return {
    redFlags,
    differential,
    recommendedNextTests,
    disclaimer: DISCLAIMER,
  }
}

module.exports = { runDiagnostic, DISCLAIMER }
