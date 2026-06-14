// Map an encounter's recorded exam values → diagnostic-engine measurement entries.
//
// Exam results live in encounter.assignedServices[].output as flat key/value objects
// (keys defined in config/serviceOutputFields.js, convention od_*/os_*). We flatten
// them (last-write-wins, like the patient printout) and translate the NUMERIC fields
// into the engine's Shape-B measurement form ({testId, measurementsByEye}). The engine
// then derives the categorical findings (IOP≥22→elevated_IOP, SE≤−0.5→refractive_myopia,
// BCVA<0.5→va_reduced, …) — so an incidental screening abnormality drives the
// differential even when the patient had no complaint.
//
// We deliberately map ONLY numeric/structured fields. Free-text fundus/slit-lamp notes
// (od_findings = "đáy mắt bình thường" / "đục T3") are NOT auto-mapped — turning
// Vietnamese prose into categorical findings is unreliable; the clinician enters those
// signs explicitly if relevant.

// Each rule pulls one engine measurement key from the first present source field per eye.
// `od`/`os` list candidate flattened keys (first non-empty wins); `ou` for binocular.
// `parse:'va'` runs the Snellen/decimal VA parser.
const RULES = [
  { testId: 't-tonometry',      key: 'iop',          od: ['od_goldmann', 'od_icare'], os: ['os_goldmann', 'os_icare'] },
  { testId: 't-autorefraction', key: 'sphere',       od: ['od_sphere'], os: ['os_sphere'] },
  { testId: 't-autorefraction', key: 'cyl',          od: ['od_cyl'],    os: ['os_cyl'] },
  { testId: 't-autorefraction', key: 'axis',         od: ['od_axis'],   os: ['os_axis'] },
  { testId: 't-autorefraction', key: 'k1',           od: ['od_k1'],     os: ['os_k1'] },
  { testId: 't-autorefraction', key: 'k2',           od: ['od_k2'],     os: ['os_k2'] },
  { testId: 't-va',             key: 'ucva',         od: ['od_va_uncorrected'], os: ['os_va_uncorrected'], parse: 'va' },
  { testId: 't-va',             key: 'bcva',         od: ['od_va_corrected'],   os: ['os_va_corrected'],   parse: 'va' },
  { testId: 't-oct-rnfl',       key: 'rnfl_avg',     od: ['od_rnfl_avg'], os: ['os_rnfl_avg'] },
  { testId: 't-pachymetry',     key: 'cct',          od: ['od_pachymetry'], os: ['os_pachymetry'] },
  { testId: 't-biometry',       key: 'axial_length', od: ['od_axial_length'], os: ['os_axial_length'] },
  { testId: 't-schirmer',       key: 'schirmer_mm',  od: ['od_mm'], os: ['os_mm'] },
  { testId: 't-tbut',           key: 'tbut_sec',     od: ['tbut_od'], os: ['tbut_os'] },
  { testId: 't-stereopsis',     key: 'stereoacuity', ou: ['stereopsis'] },
]

// Snellen ("20/60", "6/12") or decimal ("0.8", "0,8") → decimal acuity. Returns null
// for counting-fingers / hand-motion / text (ĐNT, BBT, ST(+)) — too coarse to quantify.
function parseVA(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') return raw > 0 && raw <= 2 ? raw : null
  const t = String(raw).trim().replace(',', '.')
  if (/^\d*\.?\d+$/.test(t)) { const n = +t; return n > 0 && n <= 2 ? n : null }
  const m = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if (m) { const v = +m[1] / +m[2]; return v > 0 && v <= 2 ? Math.round(v * 100) / 100 : null }
  return null
}

function flatten(encounter) {
  const out = {}
  for (const svc of encounter?.assignedServices || []) {
    const o = svc?.output || {}
    for (const k of Object.keys(o)) {
      const v = o[k]
      if (v != null && v !== '') out[k] = v   // last-write-wins across services
    }
  }
  return out
}

function pick(flat, keys, parse) {
  for (const k of keys || []) {
    if (!(k in flat)) continue
    let v = flat[k]
    if (parse === 'va') { v = parseVA(v); if (v == null) continue; return v }
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

// Returns { measurements: [{ testId, measurementsByEye }], context: { ageYears?, sex? } }.
function mapEncounterExam(encounter, now = new Date()) {
  const flat = flatten(encounter)
  const byTest = {}   // testId -> { OD:{}, OS:{}, OU:{} }
  for (const r of RULES) {
    const od = pick(flat, r.od, r.parse)
    const os = pick(flat, r.os, r.parse)
    const ou = pick(flat, r.ou, r.parse)
    if (od === undefined && os === undefined && ou === undefined) continue
    const m = (byTest[r.testId] = byTest[r.testId] || {})
    if (od !== undefined) (m.OD = m.OD || {})[r.key] = od
    if (os !== undefined) (m.OS = m.OS || {})[r.key] = os
    if (ou !== undefined) (m.OU = m.OU || {})[r.key] = ou
  }
  const measurements = Object.entries(byTest).map(([testId, measurementsByEye]) => ({ testId, measurementsByEye }))

  // Patient context for age/sex-gated red-flag rules (e.g. GCA needs age ≥ 50).
  const context = {}
  if (encounter?.dob) {
    const d = new Date(encounter.dob)
    if (!isNaN(d)) {
      let age = now.getFullYear() - d.getFullYear()
      const mo = now.getMonth() - d.getMonth()
      if (mo < 0 || (mo === 0 && now.getDate() < d.getDate())) age--
      if (age >= 0 && age < 130) context.ageYears = age
    }
  }
  if (encounter?.gender === 'M' || encounter?.gender === 'F') context.sex = encounter.gender

  return { measurements, context }
}

module.exports = { mapEncounterExam, parseVA, _RULES: RULES }
