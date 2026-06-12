// Verbose end-to-end trace for ONE clinical case.
// Used to write docs/diagnostic-walkthrough-*.md — emits the internal state
// at each stage of the pipeline.

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
require('../db')

const mongoose = require('mongoose')
const { parseComplaint } = require('./llm/parseComplaint')
const { expandFindings } = require('./engine/findingExpansion')
const { runRedFlagGate } = require('./engine/redFlagGate')
const DxEdge = require('./models/DxEdge')
const DxDisease = require('./models/DxDisease')
const DxTest = require('./models/DxTest')

const PROSE = 'Bệnh nhân nữ 62 tuổi đến cấp cứu vì đau dữ dội mắt phải 6 giờ nay, kèm đỏ mắt nhiều, nhìn thấy quầng sáng quanh đèn, buồn nôn và nôn. Tiền sử viễn thị.'

function hr(label) { console.log('\n' + '═'.repeat(70) + '\n  ' + label + '\n' + '═'.repeat(70)) }

async function main() {
  hr('STEP 0 — DOCTOR TYPES PROSE')
  console.log(PROSE)

  hr('STEP 1 — LLM PARSER (Sonnet 4.6, structured output)')
  const t0 = Date.now()
  const parsed = await parseComplaint(PROSE)
  console.log('latency:', (Date.now() - t0) + 'ms')
  console.log('confidence:', parsed.confidence)
  console.log('explanationVi:', parsed.explanationVi)
  console.log('structured complaint:', JSON.stringify(parsed.complaint, null, 2))
  console.log('usage:', JSON.stringify(parsed.usage))

  const complaint = parsed.complaint

  hr('STEP 2 — IMPLIES EXPANSION (engine/findingExpansion.js)')
  const inputTags = complaint.symptoms
  const expanded = await expandFindings(inputTags)
  console.log('input tags:    ', JSON.stringify(inputTags))
  console.log('after expansion:', JSON.stringify([...expanded]))
  const newTags = [...expanded].filter(t => !inputTags.includes(t))
  console.log('tags added by implies graph:', JSON.stringify(newTags))

  hr('STEP 3 — RED-FLAG GATE (engine/redFlagGate.js)')
  const redFlags = await runRedFlagGate(complaint, [])
  console.log('rules fired:', redFlags.length)
  for (const rf of redFlags) {
    console.log('  ──', rf.redFlagId)
    console.log('     name:           ', rf.nameVi)
    console.log('     urgency:        ', rf.urgency)
    console.log('     matchedBy:      ', JSON.stringify(rf.matchedBy))
    console.log('     candidateDx:    ', rf.candidateDiseases.join(', '))
    console.log('     action (VN):    ', rf.actionGuidance.slice(0, 120) + '...')
  }

  hr('STEP 4 — EDGES QUERY (which edges match the active findings)')
  const edges = await DxEdge.find({ findingId: { $in: [...expanded] } }).lean()
  console.log('matching edges:', edges.length)
  const byDx = {}
  for (const e of edges) {
    if (!byDx[e.diseaseId]) byDx[e.diseaseId] = []
    byDx[e.diseaseId].push(e)
  }
  // Show edges grouped by disease, only diseases with edges
  for (const [did, edgeList] of Object.entries(byDx)) {
    console.log('  ' + did)
    for (const e of edgeList) {
      const contribution = (e.evokingStrength * e.frequency).toFixed(3)
      console.log(`     edge ${e.findingId.padEnd(20)} freq=${e.frequency} × evoke=${e.evokingStrength} = +${contribution}`)
    }
  }

  hr('STEP 5 — RANKER (score = Σedges × prevalence × ageFactor; red-flag floor)')
  const dxIds = Object.keys(byDx)
  const diseases = await DxDisease.find({ _id: { $in: dxIds } }).lean()
  const dxMap = Object.fromEntries(diseases.map(d => [d._id, d]))
  const PREV = { very_common: 1.0, common: 0.8, uncommon: 0.5, rare: 0.3, rare_critical: 0.45 }
  const age = complaint.patientContext.ageYears
  const rfDxs = new Set(redFlags.flatMap(rf => rf.candidateDiseases))

  const scored = []
  for (const did of dxIds) {
    const d = dxMap[did]
    let base = 0
    for (const e of byDx[did]) base += (e.evokingStrength || 0) * (e.frequency || 0)
    const prev = PREV[d.prevalenceTag] ?? 0.5
    let ageF = 1.0
    if (typeof age === 'number') {
      if (typeof d.ageMin === 'number' && age < d.ageMin) ageF = 0.4
      if (typeof d.ageMax === 'number' && age > d.ageMax) ageF = 0.4
    }
    let score = base * prev * ageF
    const isRf = rfDxs.has(did)
    if (isRf && score < 0.05) score = 0.05
    scored.push({ did, name: d.nameVi || d.name, base: base.toFixed(3), prev, ageF, score: score.toFixed(3), isRf, urgency: d.urgency })
  }
  scored.sort((a, b) => {
    if (a.isRf !== b.isRf) return a.isRf ? -1 : 1
    return parseFloat(b.score) - parseFloat(a.score)
  })

  console.log('rank | disease                                    | base × prev × age = score      | rf | urgency')
  console.log('-'.repeat(120))
  for (let i = 0; i < Math.min(8, scored.length); i++) {
    const s = scored[i]
    console.log(
      `  ${String(i+1).padEnd(3)}| ${s.name.padEnd(43)}| ${s.base} × ${s.prev} × ${s.ageF} = ${s.score.padStart(5)} | ${s.isRf ? '⚠ ' : '  '} | ${s.urgency}`
    )
  }

  hr('STEP 6 — TEST SUGGESTER (which tests would disambiguate the top candidates)')
  // Mirror the suggester logic to show how each test was chosen
  const topIds = scored.slice(0, 6).map(s => s.did)
  const topEdges = await DxEdge.find({ diseaseId: { $in: topIds } }).sort({ evokingStrength: -1, frequency: -1 }).lean()
  const tests = await DxTest.find({}).lean()
  const findingToTest = {}
  for (const t of tests) {
    for (const fid of t.producesFindings || []) {
      if (!findingToTest[fid]) findingToTest[fid] = t
    }
  }
  const activeFindings = expanded
  const byTest = new Map()
  for (const e of topEdges) {
    if (activeFindings.has(e.findingId)) continue
    const test = findingToTest[e.findingId]
    if (!test || !test.availableInClinic) continue
    const isRfDx = rfDxs.has(e.diseaseId)
    const rfMult = isRfDx ? 1.5 : 1.0
    const harmMult = (test.harmIfSkipped || 3) / 5
    const utility = (e.evokingStrength || 0) * (e.frequency || 0) * harmMult * rfMult
    const existing = byTest.get(test._id)
    if (!existing || existing.utility < utility) {
      byTest.set(test._id, {
        testId: test._id, name: test.nameVi || test.name,
        targetFinding: e.findingId, targetDisease: e.diseaseId,
        evoke: e.evokingStrength, freq: e.frequency, harm: test.harmIfSkipped,
        rfMult, utility: utility.toFixed(3), svcCode: test.svcCode,
      })
    }
  }
  const ranked = Array.from(byTest.values()).sort((a, b) => parseFloat(b.utility) - parseFloat(a.utility)).slice(0, 5)
  for (const t of ranked) {
    console.log('  ──', t.name, '(' + t.svcCode + ')')
    console.log(`     utility=${t.utility} (target ${t.targetFinding} → ${t.targetDisease})`)
    console.log(`     calc: evoke ${t.evoke} × freq ${t.freq} × (harmIfSkipped ${t.harm}/5) × rfMult ${t.rfMult}`)
  }

  hr('SUMMARY')
  console.log('top differential:', scored.slice(0, 5).map(s => s.did).join(', '))
  console.log('red-flags fired: ', redFlags.map(rf => rf.redFlagId).join(', ') || '(none)')
  console.log('top tests:       ', ranked.map(t => t.testId).join(', '))
}

main()
  .then(() => mongoose.connection.close())
  .catch(err => { console.error(err); mongoose.connection.close(); process.exit(1) })
