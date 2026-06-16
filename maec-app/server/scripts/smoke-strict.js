/**
 * Phase 1 Unit 4 — prove strict:'throw' is active on the hot models WITHOUT
 * touching the DB. strict:'throw' throws at construction time, so for each model:
 *   - construct with a KNOWN field      → must NOT throw
 *   - construct with an UNKNOWN field    → must throw StrictModeError
 * No DB connection needed — runs locally or on the container.
 *
 * Run:  node maec-app/server/scripts/smoke-strict.js
 */
const models = [
  ['Encounter', require('../models/Encounter'), { _id: 'smoke', patientName: 'x' }],
  ['Invoice', require('../models/Invoice'), { _id: 'smoke', invoiceNumber: 'x' }],
  ['Payment', require('../models/Payment'), { _id: 'smoke', amount: 1 }],
  ['InventoryTransaction', require('../models/InventoryTransaction'), { _id: 'smoke', warehouseId: 'w' }],
  ['StocktakeSession', require('../models/StocktakeSession'), { _id: 'smoke', warehouseId: 'w' }],
  ['Patient', require('../models/Patient'), { _id: 'smoke', name: 'x' }],
]

let fail = 0
for (const [name, Model, valid] of models) {
  let okValid = true
  let rejects = false
  try { new Model(valid) } catch { okValid = false }
  try { new Model({ ...valid, __strictprobe__: 1 }) } catch (e) {
    rejects = e.name === 'StrictModeError' || /strict mode/i.test(e.message || '')
  }
  const pass = okValid && rejects
  if (!pass) fail++
  console.log(`${name.padEnd(22)} validConstructs=${okValid} rejectsUnknown=${rejects} → ${pass ? 'PASS' : 'FAIL'}`)
}
console.log(`\n${fail === 0 ? 'PASS — strict:throw active on all hot models; valid payloads OK' : `FAIL — ${fail} model(s)`}`)
process.exit(fail ? 1 : 0)
