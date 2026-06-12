// Build a stable, cacheable vocabulary block for the LLM parser prompt.
//
// The block is the KB's symptom/context/qualifier findings, formatted as a
// flat reference list — finding _id (the parser's target tag), VN display
// name, optional aliases. The LLM's job is to map free Vietnamese prose to
// one or more of these tag IDs.
//
// We deliberately:
// - Read directly from kb/findings.json (source of truth), not Mongo, so the
//   vocab is regenerated from JSON edits without re-seeding.
// - Filter to `symptom`, `context`, and `qualifier` kinds (signs and
//   test_results are entered by the clinician during the exam, not parsed
//   from complaint prose).
// - Cache the result in-process for the lifetime of the server.
// - Emit a stable string so prompt caching on the Anthropic side gets cache
//   hits across requests.

const fs = require('fs')
const path = require('path')

let _cached = null

function buildVocab() {
  if (_cached) return _cached
  const findingsPath = path.join(__dirname, '..', 'kb', 'findings.json')
  const findings = JSON.parse(fs.readFileSync(findingsPath, 'utf8'))

  const parseable = findings.filter(f =>
    f.kind === 'symptom' || f.kind === 'context' || f.kind === 'qualifier'
  )
  parseable.sort((a, b) => a._id.localeCompare(b._id))

  const lines = parseable.map(f => {
    const aliases = (f.aliases || []).join(', ')
    const aliasPart = aliases ? `; aliases: ${aliases}` : ''
    return `- ${f._id} — ${f.nameVi || f.name}${aliasPart}`
  })

  _cached = {
    vocab: lines.join('\n'),
    tagCount: parseable.length,
    validTagSet: new Set(parseable.map(f => f._id)),
  }
  return _cached
}

function resetCache() {
  _cached = null
}

module.exports = { buildVocab, resetCache }
