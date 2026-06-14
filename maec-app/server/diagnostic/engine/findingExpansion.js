// Finding expansion — walk the `implies` graph so that observing a specific
// finding entails its more-general parents.
//
// Examples (defined in the KB, not here):
//   pain_severe → pain_severe_or_moderate → pain
//   vf_altitudinal → field_loss_altitudinal → field_loss
//   discharge_purulent → discharge
//
// Both the red-flag gate and the ranker call expandFindings() so that a rule
// requiring "pain" matches a patient who reported "pain_severe," and the
// ranker's edges from generic findings still contribute when only specific
// findings are observed.
//
// The implies map is read once on first call and cached for the process
// lifetime (KB is read-mostly; restart on edit).

const DxFinding = require('../models/DxFinding')

let _impliesMap = null
let _knownIds = null

async function getImpliesMap() {
  if (_impliesMap) return _impliesMap
  const findings = await DxFinding.find({}).select('_id implies').lean()
  const map = new Map()
  const ids = new Set()
  for (const f of findings) {
    ids.add(f._id)
    if (Array.isArray(f.implies) && f.implies.length) {
      map.set(f._id, f.implies)
    }
  }
  _impliesMap = map
  _knownIds = ids
  return _impliesMap
}

// Cached Set of every known finding _id (all kinds). The KB-vocabulary guard:
// the observations + complaint endpoints reject any finding tag not in here, so
// a typo'd findingId (e.g. `periorbial_swelling`) can never be silently stored
// where it would match no edge or red-flag trigger and quietly kill an alert.
async function getKnownFindingIds() {
  if (_knownIds) return _knownIds
  await getImpliesMap()   // populates _knownIds as a side effect
  return _knownIds
}

// Take an iterable of finding tags and return a Set that includes every tag
// transitively implied. BFS with a visited set to prevent cycles.
async function expandFindings(tags) {
  const impliesMap = await getImpliesMap()
  const expanded = new Set()
  const queue = []
  for (const t of tags || []) {
    if (!expanded.has(t)) {
      expanded.add(t)
      queue.push(t)
    }
  }
  while (queue.length) {
    const tag = queue.shift()
    const implied = impliesMap.get(tag) || []
    for (const next of implied) {
      if (!expanded.has(next)) {
        expanded.add(next)
        queue.push(next)
      }
    }
  }
  return expanded
}

// Test-only / debug — clear the cache so a re-seed is picked up without restart.
function _resetCache() { _impliesMap = null; _knownIds = null }

module.exports = { expandFindings, getKnownFindingIds, _resetCache }
