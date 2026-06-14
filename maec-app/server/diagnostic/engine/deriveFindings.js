// Measurement → finding derivation.
//
// The engine is categorical (reasons over finding tags). This module turns a
// numeric/enum test measurement entered per eye into:
//   - raw observation rows (the typed value, kept for audit + display), and
//   - derived observation rows (the categorical finding the threshold implies).
// The categorical engine (ranker / red-flag gate) then runs unchanged — it only
// reads observation.findingId.
//
// Pure: no DB writes. The caller (routes.js) persists the returned rows and
// handles supersession of any prior rows for the same test+measurement+eye.
//
// Threshold ops on a measurement spec's `derives[]`:
//   '<' '<=' '>' '>=' '=='  — compare value to rule.value
//   'between'               — rule.lo <= value <= rule.hi
//   'abs>=' 'abs<='         — compare Math.abs(value) (cylinder magnitude etc.)

// Named compute formulas (no eval). Each gets the per-eye value map.
const COMPUTE = {
  // Spherical equivalent: Sph + Cyl/2 (cyl missing ⇒ 0). Matches the clinic's
  // examSummary `se` field. Returns null if sphere absent (nothing to compute).
  spherical_equivalent(vals) {
    const sph = vals.sphere
    if (sph == null) return null
    const cyl = vals.cyl == null ? 0 : vals.cyl
    return Math.round((sph + cyl / 2) * 100) / 100
  },
  // Visual-acuity gain from correction: best-corrected − uncorrected (decimal).
  // Needs both values; a large positive gain means the blur corrects with lenses.
  va_correction_gain(vals) {
    if (vals.bcva == null || vals.ucva == null) return null
    return Math.round((vals.bcva - vals.ucva) * 100) / 100
  },
}

function evalRule(op, value, rule) {
  switch (op) {
    case '<':  return value < rule.value
    case '<=': return value <= rule.value
    case '>':  return value > rule.value
    case '>=': return value >= rule.value
    case '==': return value === rule.value
    case 'between': return value >= rule.lo && value <= rule.hi
    case 'abs>=': return Math.abs(value) >= rule.value
    case 'abs<=': return Math.abs(value) <= rule.value
    default: return false
  }
}

// Validate a single typed value against its measurement spec. Returns a coerced
// number (for valueType:'number') or the value as-is, or throws-via-error string.
function coerce(spec, raw) {
  if (spec.valueType === 'number') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n)) return { error: `${spec.key}: "${raw}" is not a number` }
    if (spec.min != null && n < spec.min) return { error: `${spec.key}: ${n} below min ${spec.min}` }
    if (spec.max != null && n > spec.max) return { error: `${spec.key}: ${n} above max ${spec.max}` }
    return { value: n }
  }
  if (spec.valueType === 'enum') {
    if (spec.enumOptions && !spec.enumOptions.includes(raw)) return { error: `${spec.key}: "${raw}" not in [${spec.enumOptions.join(', ')}]` }
    return { value: raw }
  }
  if (spec.valueType === 'boolean') {
    return { value: raw === true || raw === 'true' }
  }
  return { value: raw }
}

// deriveFromMeasurement: given a test (with .measurements) and the values entered
// for ONE eye, return { rawObservations, derivedObservations, errors }.
//
//   test          — the DxTest doc (lean) with measurements[]
//   eye           — 'OD' | 'OS' | 'OU' | null
//   values        — { <measurementKey>: rawValue, ... } for this eye
//   enteredBy, source, at — observation provenance
function deriveForEye(test, eye, values, { enteredBy, source, at }) {
  const rawObservations = []
  const derivedObservations = []
  const errors = []
  const specs = test.measurements || []
  const byKey = Object.fromEntries(specs.map(s => [s.key, s]))

  // 1. Coerce + record raw inputs (input fields only — not computed).
  const coerced = {}   // key -> validated value
  for (const spec of specs) {
    if (spec.input === false) continue           // computed/derived-only, not typed
    if (!(spec.key in values)) continue           // not entered this round
    const raw = values[spec.key]
    if (raw == null || raw === '') continue        // blank = skip (NOT zero — see below)
    const c = coerce(spec, raw)
    if (c.error) { errors.push(c.error); continue }
    coerced[spec.key] = c.value
    rawObservations.push({
      at, findingId: null, eye, value: c.value, unit: spec.unit,
      measurementKey: spec.key, derivedFrom: `${test._id}:${spec.key}`,
      source: source || 'manual', enteredBy,
    })
  }

  if (Object.keys(coerced).length === 0) return { rawObservations, derivedObservations, errors }

  // 2. Compute derived measurement values (e.g. SE from sphere+cyl).
  const computedVals = {}
  for (const spec of specs) {
    if (spec.valueType !== 'computed') continue
    const fn = COMPUTE[spec.compute]
    if (!fn) { errors.push(`${spec.key}: unknown compute '${spec.compute}'`); continue }
    const v = fn(coerced)
    if (v != null) computedVals[spec.key] = v
  }

  // 3. Evaluate derive rules. A rule reads its OWN measurement's value:
  //    input fields use coerced[key]; computed fields use computedVals[key].
  const emitted = new Set()   // dedup findings within this eye
  for (const spec of specs) {
    const val = spec.valueType === 'computed' ? computedVals[spec.key] : coerced[spec.key]
    if (val == null) continue                      // not entered / not computable
    for (const rule of spec.derives || []) {
      if (!evalRule(rule.op, val, rule)) continue
      if (emitted.has(rule.finding)) continue
      emitted.add(rule.finding)
      derivedObservations.push({
        at, findingId: rule.finding, eye, value: val, unit: spec.unit,
        derivedFrom: `${test._id}:${spec.key}`, source: 'derived', enteredBy,
      })
    }
  }

  return { rawObservations, derivedObservations, errors }
}

// Top-level: values come keyed by eye. measurementsByEye = { OD:{...}, OS:{...}, OU:{...} }.
function deriveFromMeasurement({ test, measurementsByEye, enteredBy, source, at }) {
  const rawObservations = []
  const derivedObservations = []
  const errors = []
  if (!test || !Array.isArray(test.measurements) || test.measurements.length === 0) {
    return { rawObservations, derivedObservations, errors: ['test has no measurements spec'] }
  }
  for (const eye of ['OD', 'OS', 'OU']) {
    const vals = measurementsByEye[eye]
    if (!vals || typeof vals !== 'object') continue
    const r = deriveForEye(test, eye, vals, { enteredBy, source, at })
    rawObservations.push(...r.rawObservations)
    derivedObservations.push(...r.derivedObservations)
    errors.push(...r.errors)
  }
  return { rawObservations, derivedObservations, errors }
}

module.exports = { deriveFromMeasurement, deriveForEye, COMPUTE, evalRule }
