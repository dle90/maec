/**
 * Phase 1 Unit 3 — build the unique backstop indexes in a controlled session.
 *
 * Runs syncIndexes() per model (creates the new unique partial indexes and, for
 * Patient, replaces the old non-unique patientId index). Each model is wrapped
 * in try/catch so an E11000 surfaces the offending key instead of crashing app
 * boot. GATE: run scripts/audit-natural-key-dups.js first and confirm 0 dups.
 *
 * Run:  railway ssh "node maec-app/server/scripts/build-unique-indexes.js"
 */
require('../db')
const mongoose = require('mongoose')

const models = [
  ['Invoice', require('../models/Invoice')],
  ['InventoryTransaction', require('../models/InventoryTransaction')],
  ['StocktakeSession', require('../models/StocktakeSession')],
  ['Patient', require('../models/Patient')],
  ['Supply', require('../models/Supply')],
]

async function run() {
  console.log('\n=== build-unique-indexes (syncIndexes) ===')
  let failures = 0
  for (const [name, Model] of models) {
    try {
      const dropped = await Model.syncIndexes()
      const idx = await Model.collection.indexes()
      const uniques = idx.filter(i => i.unique).map(i => `${i.name}${i.partialFilterExpression ? ' (partial)' : ''}`)
      console.log(`${name.padEnd(22)} OK   dropped=[${dropped.join(',')}]   unique=[${uniques.join(', ')}]`)
    } catch (e) {
      failures++
      console.log(`${name.padEnd(22)} FAILED ${e.code || ''} — ${e.message}`)
    }
  }
  console.log(`\n${failures === 0 ? 'All unique indexes built.' : `${failures} model(s) failed — dedup the offending key(s) and re-run.`}`)
  await mongoose.disconnect()
  if (failures) process.exit(1)
}
run().catch(e => { console.error(e); process.exit(1) })
