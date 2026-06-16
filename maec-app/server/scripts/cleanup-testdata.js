/**
 * Prune test/throwaway data created during sims / reviews / repros.
 *
 * Deletes ONLY:
 *   - Patients whose NAME starts with a test prefix (_TEST… / _ADVR…)
 *   - Encounters belonging to those patients (by patientId) or whose patientName
 *     has a test prefix
 *   - DxSessions linked to those test patients/encounters, AND truly-orphan
 *     DxSessions (no patientId AND no encounterId — decision-support scratch from
 *     standalone repros, not part of any patient's EMR)
 *
 * Real patient data is never matched (real names don't start with "_TEST"/"_ADVR").
 *
 * Run (DRY-RUN, just reports):  railway ssh "node maec-app/server/scripts/cleanup-testdata.js"
 * Run (APPLY, deletes):         railway ssh "node maec-app/server/scripts/cleanup-testdata.js --apply"
 */
require('../db')
const mongoose = require('mongoose')
const Patient = require('../models/Patient')
const Encounter = require('../models/Encounter')
const DxSession = require('../diagnostic/models/DxSession')

const APPLY = process.argv.includes('--apply')
const PREFIX = /^_(?:TEST|ADVR)/i
const noPatientEnc = {
  $and: [
    { $or: [{ patientId: null }, { patientId: '' }, { patientId: { $exists: false } }] },
    { $or: [{ encounterId: null }, { encounterId: '' }, { encounterId: { $exists: false } }] },
  ],
}
const notClosed = { $or: [{ 'clinicianOutcome.closedAt': null }, { 'clinicianOutcome.closedAt': '' }, { 'clinicianOutcome.closedAt': { $exists: false } }] }
// Open scratch → delete. CLOSED orphan sessions are kept (confirmed-outcome =
// training signal, even without a patient link).
const orphan = { $and: [noPatientEnc, notClosed] }
const orphanClosed = { $and: [noPatientEnc, { 'clinicianOutcome.closedAt': { $nin: [null, ''] } }] }

async function run() {
  console.log(`\n=== cleanup-testdata  (${APPLY ? 'APPLY — will delete' : 'DRY-RUN — no deletes'}) ===`)

  const testPatients = await Patient.find({ name: PREFIX }).select('_id name').lean()
  const patientIds = testPatients.map(p => p._id)
  console.log(`\nTest patients: ${testPatients.length}`)
  testPatients.slice(0, 10).forEach(p => console.log(`   ${p._id}  ${p.name}`))

  const encFilter = { $or: [{ patientName: PREFIX }, { patientId: { $in: patientIds } }] }
  const testEncs = await Encounter.find(encFilter).select('_id patientName').lean()
  const encIds = testEncs.map(e => e._id)
  console.log(`\nTest encounters: ${testEncs.length}`)
  testEncs.slice(0, 10).forEach(e => console.log(`   ${e._id}  ${e.patientName}`))

  const linkedSess = await DxSession.countDocuments({ $or: [{ patientId: { $in: patientIds } }, { encounterId: { $in: encIds } }] })
  const orphanSess = await DxSession.countDocuments(orphan)
  const orphanKept = await DxSession.countDocuments(orphanClosed)
  console.log(`\nDxSessions — linked to test data: ${linkedSess}, open-orphan (delete): ${orphanSess}, closed-orphan (KEEP, training signal): ${orphanKept}`)

  if (!APPLY) {
    console.log('\nDRY-RUN only. Re-run with --apply to delete the above.')
    await mongoose.disconnect(); return
  }

  const s1 = await DxSession.deleteMany({ $or: [{ patientId: { $in: patientIds } }, { encounterId: { $in: encIds } }, orphan] })
  const e1 = await Encounter.deleteMany(encFilter)
  const p1 = await Patient.deleteMany({ name: PREFIX })
  console.log(`\nDeleted: ${p1.deletedCount} patients, ${e1.deletedCount} encounters, ${s1.deletedCount} dx-sessions.`)
  await mongoose.disconnect()
}

run().catch(e => { console.error(e); process.exit(1) })
