/**
 * Wipe LinkRad-era leftover data the rebrand pass kept around.
 *
 * Companion to wipe-operational-data.js. Targets the catalogs / config
 * collections we deliberately preserved during the operational wipe but
 * later confirmed contain only LinkRad-era seed data:
 *
 *   ReferralDoctor, PartnerFacility, CancelReason, Specialty,
 *   ReportTemplate, AuditLog, Task — full delete.
 *   KVStore — delete the 7 financial blobs (annual-pl, annual-cf,
 *   monthly-pl, monthly-cf, balance-sheet, breakeven, actuals); keep
 *   the `sites` doc which holds the live MAEC 2-site config.
 *
 * Kept untouched (verified MAEC-era 2026-05-02): CustomerSource,
 * Inventory family (Warehouse / InventoryLot / InventoryTransaction /
 * StocktakeSession), KVStore.sites.
 *
 * Run: railway run node scripts/wipe-linkrad-leftover.js
 *      (or: MONGODB_URI=... node scripts/wipe-linkrad-leftover.js)
 */
require('../db')
const mongoose = require('mongoose')

const FULL_WIPE = [
  ['ReferralDoctor',  require('../models/ReferralDoctor')],
  ['PartnerFacility', require('../models/PartnerFacility')],
  ['CancelReason',    require('../models/CancelReason')],
  ['Specialty',       require('../models/Specialty')],
  ['ReportTemplate',  require('../models/ReportTemplate')],
  ['AuditLog',        require('../models/AuditLog')],
  ['Task',            require('../models/Task')],
]

const KVStore = require('../models/KVStore')
const KVSTORE_KEEP_IDS = ['sites']

async function run() {
  console.log('Wiping LinkRad-era leftover...')
  for (const [name, Model] of FULL_WIPE) {
    const before = await Model.countDocuments()
    const r = await Model.deleteMany({})
    console.log(`  ✓ ${name.padEnd(18)} ${String(before).padStart(6)} → 0  (deleted ${r.deletedCount})`)
  }
  const kvBefore = await KVStore.countDocuments()
  const kvResult = await KVStore.deleteMany({ _id: { $nin: KVSTORE_KEEP_IDS } })
  const kvAfter = await KVStore.countDocuments()
  console.log(`  ✓ ${'KVStore'.padEnd(18)} ${String(kvBefore).padStart(6)} → ${kvAfter}  (deleted ${kvResult.deletedCount}; kept: ${KVSTORE_KEEP_IDS.join(', ')})`)
  console.log('Done. CustomerSource / Inventory / KVStore.sites untouched.')
  await mongoose.disconnect()
}

run().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
