// Seed the diagnostic KB into Mongo from the version-controlled JSON in kb/.
// Idempotent: deletes the dx* collections (KB only — sessions stay) and
// re-inserts everything from the JSON source-of-truth.
//
// Usage:
//   cd maec-app/server
//   node diagnostic/seed.js

const path = require('path')
const fs = require('fs')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
require('../db')

const mongoose = require('mongoose')
const DxService = require('./models/DxService')
const DxDisease = require('./models/DxDisease')
const DxFinding = require('./models/DxFinding')
const DxTest = require('./models/DxTest')
const DxRedFlag = require('./models/DxRedFlag')
const DxEdge = require('./models/DxEdge')
const DxTreatment = require('./models/DxTreatment')

const KB_DIR = path.join(__dirname, 'kb')

function loadJson(name) {
  const filePath = path.join(KB_DIR, name)
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

async function seed() {
  const services = loadJson('services.json')
  const diseases = loadJson('diseases.json')
  const findings = loadJson('findings.json')
  const tests = loadJson('tests.json')
  const redFlags = loadJson('redFlags.json')
  const edges = loadJson('edges.json')
  const treatments = loadJson('treatments.json')

  // Sanity checks before touching Mongo — catch typos early.
  const serviceIds = new Set(services.map(s => s._id))
  const diseaseIds = new Set(diseases.map(d => d._id))
  const findingIds = new Set(findings.map(f => f._id))
  const testIds = new Set(tests.map(t => t._id))
  const treatmentIds = new Set(treatments.map(t => t._id))

  const errors = []

  for (const d of diseases) {
    for (const s of d.services || []) {
      if (!serviceIds.has(s)) errors.push(`disease ${d._id}: unknown service ${s}`)
    }
    for (const tx of d.treatments || []) {
      if (!treatmentIds.has(tx)) errors.push(`disease ${d._id}: treatment "${tx}" missing from treatments.json vocabulary`)
    }
  }
  for (const f of findings) {
    for (const s of f.serviceHints || []) {
      if (!serviceIds.has(s)) errors.push(`finding ${f._id}: unknown serviceHint ${s}`)
    }
    if (f.producedByTest && !testIds.has(f.producedByTest)) {
      errors.push(`finding ${f._id}: unknown producedByTest ${f.producedByTest}`)
    }
  }
  for (const t of tests) {
    for (const fid of t.producesFindings || []) {
      if (!findingIds.has(fid)) errors.push(`test ${t._id}: unknown finding ${fid}`)
    }
    for (const s of t.services || []) {
      if (!serviceIds.has(s)) errors.push(`test ${t._id}: unknown service ${s}`)
    }
    // Measurement derive targets must exist AND be listed in producesFindings
    // (else the test-suggester can never recommend the test that yields them).
    const mKeys = new Set((t.measurements || []).map(m => m.key))
    for (const m of t.measurements || []) {
      if (m.valueType === 'computed') {
        for (const k of m.computeFrom || []) {
          if (!mKeys.has(k)) errors.push(`test ${t._id}: measurement ${m.key} computeFrom unknown key ${k}`)
        }
      }
      for (const r of m.derives || []) {
        if (!findingIds.has(r.finding)) errors.push(`test ${t._id}: measurement ${m.key} derives unknown finding ${r.finding}`)
        if (!(t.producesFindings || []).includes(r.finding)) {
          errors.push(`test ${t._id}: measurement ${m.key} derives ${r.finding} not in producesFindings`)
        }
      }
    }
  }
  for (const r of redFlags) {
    for (const did of r.candidateDiseases || []) {
      if (!diseaseIds.has(did)) errors.push(`redFlag ${r._id}: unknown candidate disease ${did}`)
    }
    const allTags = [...(r.trigger?.hasAllSymptoms || []), ...(r.trigger?.hasAnySymptoms || [])]
    for (const tag of allTags) {
      if (!findingIds.has(tag)) errors.push(`redFlag ${r._id}: trigger tag ${tag} is not a known finding`)
    }
  }
  for (const e of edges) {
    if (!diseaseIds.has(e.diseaseId)) errors.push(`edge: unknown disease ${e.diseaseId}`)
    if (!findingIds.has(e.findingId)) errors.push(`edge: unknown finding ${e.findingId}`)
  }

  if (errors.length) {
    console.error('Seed validation failed:')
    for (const err of errors) console.error('  -', err)
    process.exit(1)
  }

  console.log(`KB summary: ${services.length} services, ${diseases.length} diseases, ` +
              `${findings.length} findings, ${tests.length} tests, ` +
              `${redFlags.length} red-flags, ${edges.length} edges, ${treatments.length} treatments`)

  await DxService.deleteMany({})
  await DxDisease.deleteMany({})
  await DxFinding.deleteMany({})
  await DxTest.deleteMany({})
  await DxRedFlag.deleteMany({})
  await DxEdge.deleteMany({})
  await DxTreatment.deleteMany({})

  await DxService.insertMany(services)
  await DxDisease.insertMany(diseases)
  await DxFinding.insertMany(findings)
  await DxTest.insertMany(tests)
  await DxRedFlag.insertMany(redFlags)
  await DxEdge.insertMany(edges)
  await DxTreatment.insertMany(treatments)

  console.log('Seed complete.')
}

seed()
  .then(() => mongoose.connection.close())
  .catch(err => {
    console.error(err)
    mongoose.connection.close()
    process.exit(1)
  })
