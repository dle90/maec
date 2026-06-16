/**
 * Phase 1 GATE — read-only audit for duplicate natural keys.
 *
 * The old generators (countDocuments()+1, Math.random() suffixes) could mint
 * silent duplicates because no unique index enforced these keys. Before we add
 * unique indexes (Unit 3), this MUST report 0 duplicate groups — otherwise the
 * index build fails with E11000. Read-only; safe against prod per CLAUDE.md.
 *
 * Run:  railway ssh "node maec-app/server/scripts/audit-natural-key-dups.js"
 */
require('../db')
const mongoose = require('mongoose')
const Invoice = require('../models/Invoice')
const InventoryTransaction = require('../models/InventoryTransaction')
const StocktakeSession = require('../models/StocktakeSession')
const Patient = require('../models/Patient')
const Supply = require('../models/Supply')

async function dupsOf(Model, label, keys) {
  const fields = Array.isArray(keys) ? keys : [keys]
  const groupId = fields.length === 1
    ? `$${fields[0]}`
    : Object.fromEntries(fields.map(f => [f.replace(/\W/g, '_'), `$${f}`]))
  const matchNonNull = { $and: fields.map(f => ({ [f]: { $nin: [null, ''] } })) }
  const rows = await Model.aggregate([
    { $match: matchNonNull },
    { $group: { _id: groupId, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 50 },
  ])
  console.log(`\n${label}: ${rows.length} duplicate group(s)`)
  rows.slice(0, 20).forEach(r => console.log(`   ${JSON.stringify(r._id)}  ×${r.count}  e.g. ${r.ids.slice(0, 3).join(', ')}`))
  return rows.length
}

async function run() {
  console.log('\n=== audit-natural-key-dups (read-only) ===')
  let total = 0
  total += await dupsOf(Invoice, 'Invoice.invoiceNumber', 'invoiceNumber')
  total += await dupsOf(InventoryTransaction, 'InventoryTransaction.transactionNumber', 'transactionNumber')
  total += await dupsOf(StocktakeSession, 'StocktakeSession.sessionNumber', 'sessionNumber')
  total += await dupsOf(Patient, 'Patient.patientId', 'patientId')
  total += await dupsOf(Supply, 'Supply.{productKind,productCode}', ['productKind', 'productCode'])
  console.log(`\n${total === 0
    ? 'CLEAN — 0 duplicate groups. Safe to build unique indexes.'
    : `FOUND ${total} duplicate group(s) — dedup before the unique-index unit.`}`)
  await mongoose.disconnect()
}
run().catch(e => { console.error(e); process.exit(1) })
