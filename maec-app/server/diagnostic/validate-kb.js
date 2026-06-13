#!/usr/bin/env node
// Pure-JSON cross-reference validator for the diagnostic KB.
//
// Runs in CI on every push that touches diagnostic/kb/**. Does NOT need Mongo
// or an LLM key — just reads the 6 JSON files and verifies every cross-ref
// resolves.
//
// Catches the most common regression: typo in a tag, missing edge, dangling
// reference. Exits non-zero on any error so CI fails loudly.
//
// Run locally too:
//   node diagnostic/validate-kb.js

const fs = require('fs')
const path = require('path')

const KB_DIR = path.join(__dirname, 'kb')
const load = (n) => JSON.parse(fs.readFileSync(path.join(KB_DIR, n), 'utf8'))

const services  = load('services.json')
const diseases  = load('diseases.json')
const findings  = load('findings.json')
const tests     = load('tests.json')
const redFlags  = load('redFlags.json')
const edges     = load('edges.json')
const treatments = load('treatments.json')

const sIds = new Set(services.map(s => s._id))
const dIds = new Set(diseases.map(d => d._id))
const fIds = new Set(findings.map(f => f._id))
const tIds = new Set(tests.map(t => t._id))
const txIds = new Set(treatments.map(t => t._id))

const errors = []

// 1. ID uniqueness
function checkUnique(name, items) {
  const seen = new Set()
  for (const it of items) {
    if (seen.has(it._id)) errors.push(`${name}: duplicate _id "${it._id}"`)
    seen.add(it._id)
  }
}
checkUnique('services', services)
checkUnique('diseases', diseases)
checkUnique('findings', findings)
checkUnique('tests',    tests)
checkUnique('redFlags', redFlags)

// 2. Disease cross-refs
checkUnique('treatments', treatments)
for (const d of diseases) {
  for (const s of d.services || []) {
    if (!sIds.has(s)) errors.push(`disease ${d._id}: unknown service "${s}"`)
  }
  for (const tx of d.treatments || []) {
    if (!txIds.has(tx)) errors.push(`disease ${d._id}: treatment "${tx}" not in treatments.json`)
  }
  if (typeof d.ageMin === 'number' && typeof d.ageMax === 'number' && d.ageMin > d.ageMax) {
    errors.push(`disease ${d._id}: ageMin > ageMax`)
  }
}

// 3. Finding cross-refs (serviceHints, producedByTest, implies)
for (const f of findings) {
  for (const s of f.serviceHints || []) {
    if (!sIds.has(s)) errors.push(`finding ${f._id}: unknown serviceHint "${s}"`)
  }
  if (f.producedByTest && !tIds.has(f.producedByTest)) {
    errors.push(`finding ${f._id}: unknown producedByTest "${f.producedByTest}"`)
  }
  for (const implied of f.implies || []) {
    if (!fIds.has(implied)) errors.push(`finding ${f._id}: implies unknown finding "${implied}"`)
    if (implied === f._id) errors.push(`finding ${f._id}: self-implies (cycle)`)
  }
}

// 3b. Implies cycle detection (DFS, cheap because graph is small)
function detectCycle() {
  const map = new Map(findings.map(f => [f._id, f.implies || []]))
  const WHITE = 0, GREY = 1, BLACK = 2
  const color = new Map([...fIds].map(id => [id, WHITE]))
  function dfs(node, stack) {
    color.set(node, GREY)
    for (const next of map.get(node) || []) {
      if (color.get(next) === GREY) {
        errors.push(`finding implies cycle: ${[...stack, next].join(' → ')}`)
        return
      }
      if (color.get(next) === WHITE) dfs(next, [...stack, next])
    }
    color.set(node, BLACK)
  }
  for (const id of fIds) if (color.get(id) === WHITE) dfs(id, [id])
}
detectCycle()

// 4. Test cross-refs
const OPS = new Set(['<', '<=', '>', '>=', '==', 'between', 'abs>=', 'abs<='])
const VALUE_TYPES = new Set(['number', 'enum', 'boolean', 'computed'])
for (const t of tests) {
  for (const fid of t.producesFindings || []) {
    if (!fIds.has(fid)) errors.push(`test ${t._id}: unknown finding "${fid}"`)
  }
  for (const s of t.services || []) {
    if (!sIds.has(s)) errors.push(`test ${t._id}: unknown service "${s}"`)
  }
  // 4b. Measurement specs
  const keys = new Set((t.measurements || []).map(m => m.key))
  for (const m of t.measurements || []) {
    if (!m.key) errors.push(`test ${t._id}: measurement missing key`)
    if (m.valueType && !VALUE_TYPES.has(m.valueType)) errors.push(`test ${t._id}:${m.key}: bad valueType "${m.valueType}"`)
    if (m.valueType === 'enum' && !(m.enumOptions || []).length) errors.push(`test ${t._id}:${m.key}: enum needs enumOptions`)
    if (m.valueType === 'computed') {
      for (const k of m.computeFrom || []) {
        if (!keys.has(k)) errors.push(`test ${t._id}:${m.key}: computeFrom unknown key "${k}"`)
      }
    }
    for (const r of m.derives || []) {
      if (!OPS.has(r.op)) errors.push(`test ${t._id}:${m.key}: bad derive op "${r.op}"`)
      if (r.op === 'between' && (typeof r.lo !== 'number' || typeof r.hi !== 'number' || r.lo > r.hi)) {
        errors.push(`test ${t._id}:${m.key}: 'between' needs lo<=hi`)
      }
      if (!fIds.has(r.finding)) errors.push(`test ${t._id}:${m.key}: derives unknown finding "${r.finding}"`)
      // A derived finding MUST be in producesFindings, else testSuggester can never
      // recommend the test that yields it.
      if (!(t.producesFindings || []).includes(r.finding)) {
        errors.push(`test ${t._id}:${m.key}: derives "${r.finding}" not in producesFindings`)
      }
    }
  }
}

// 5. Red-flag cross-refs
for (const r of redFlags) {
  for (const did of r.candidateDiseases || []) {
    if (!dIds.has(did)) errors.push(`redFlag ${r._id}: unknown candidate disease "${did}"`)
  }
  for (const s of r.services || []) {
    if (!sIds.has(s)) errors.push(`redFlag ${r._id}: unknown service "${s}"`)
  }
  const allTags = [
    ...(r.trigger?.hasAllSymptoms || []),
    ...(r.trigger?.hasAnySymptoms || []),
  ]
  for (const tag of allTags) {
    if (!fIds.has(tag)) errors.push(`redFlag ${r._id}: trigger tag "${tag}" is not a known finding`)
  }
}

// 6. Edge cross-refs
const seenEdge = new Set()
for (const e of edges) {
  if (!dIds.has(e.diseaseId)) errors.push(`edge: unknown disease "${e.diseaseId}"`)
  if (!fIds.has(e.findingId)) errors.push(`edge: unknown finding "${e.findingId}"`)
  if (typeof e.frequency !== 'number' || e.frequency < 0 || e.frequency > 1) {
    errors.push(`edge ${e.diseaseId}↔${e.findingId}: frequency out of [0,1]`)
  }
  if (typeof e.evokingStrength !== 'number' || e.evokingStrength < 0 || e.evokingStrength > 1) {
    errors.push(`edge ${e.diseaseId}↔${e.findingId}: evokingStrength out of [0,1]`)
  }
  const key = e.diseaseId + '|' + e.findingId
  if (seenEdge.has(key)) errors.push(`edge: duplicate ${e.diseaseId}↔${e.findingId}`)
  seenEdge.add(key)
}

// 7. Service cascade cross-refs
for (const s of services) {
  for (const c of s.cascadesTo || []) {
    if (!sIds.has(c.service)) errors.push(`service ${s._id}: cascadesTo unknown service "${c.service}"`)
  }
}

if (errors.length) {
  console.error(`\n✘ KB validation failed: ${errors.length} error(s)\n`)
  for (const e of errors) console.error('  -', e)
  process.exit(1)
}

console.log('✓ KB cross-refs OK')
console.log(`  ${services.length} services / ${diseases.length} diseases / ${findings.length} findings / ${tests.length} tests / ${redFlags.length} red-flags / ${edges.length} edges / ${treatments.length} treatments`)
