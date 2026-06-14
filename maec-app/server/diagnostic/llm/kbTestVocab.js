// Build a cacheable vocabulary block for ONE test's result parser.
//
// Unlike kbVocab (complaint symptoms), this is scoped to a single test's
// `producesFindings` — the qualitative signs a clinician describes in prose
// after performing that test (e.g. slit-lamp: cells_and_flare, keratic_precipitates,
// hypopyon…). The LLM maps the free-text description to one or more of these tags.
//
// Read from kb JSON (source of truth, no re-seed needed) + cached per testId.

const fs = require('fs')
const path = require('path')

let _findingsById = null
let _testsById = null
const _cache = {}

function loadKb() {
  if (_findingsById) return
  const kb = path.join(__dirname, '..', 'kb')
  const findings = JSON.parse(fs.readFileSync(path.join(kb, 'findings.json'), 'utf8'))
  const tests = JSON.parse(fs.readFileSync(path.join(kb, 'tests.json'), 'utf8'))
  _findingsById = Object.fromEntries(findings.map(f => [f._id, f]))
  _testsById = Object.fromEntries(tests.map(t => [t._id, t]))
}

// Returns { test, vocab, validTagSet } or null if the test is unknown / has no findings.
function buildTestVocab(testId) {
  loadKb()
  if (_cache[testId]) return _cache[testId]
  const test = _testsById[testId]
  if (!test) return null
  const tags = test.producesFindings || []
  if (!tags.length) return null

  const lines = tags.map(id => {
    const f = _findingsById[id]
    const aliases = (f?.aliases || []).join(', ')
    const aliasPart = aliases ? `; aliases: ${aliases}` : ''
    return `- ${id} — ${f?.nameVi || f?.name || id}${aliasPart}`
  })

  const res = {
    test: { _id: test._id, name: test.name, nameVi: test.nameVi },
    vocab: lines.join('\n'),
    validTagSet: new Set(tags),
  }
  _cache[testId] = res
  return res
}

function resetCache() { _findingsById = null; _testsById = null; for (const k of Object.keys(_cache)) delete _cache[k] }

module.exports = { buildTestVocab, resetCache }
