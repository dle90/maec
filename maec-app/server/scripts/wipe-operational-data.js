/**
 * Wipe operational (per-patient) data so the clinic can start fresh.
 *
 * Clears: patients + everything that references them (encounters, appointments,
 * invoices, payments, entitlements, partner referrals, patient accounts,
 * feedback, notifications, radiology-era reports/key-images/annotations).
 *
 * Keeps: catalogs (Service/Package/Kinh/Thuoc/...), users, departments,
 * permissions, partners (ReferralDoctor/PartnerFacility/CommissionGroup/Rule),
 * inventory state (Lots/Transactions/Stocktakes/Warehouses), audit log,
 * promotions, KVStore config.
 *
 * Run: railway run node scripts/wipe-operational-data.js
 *      (or: MONGODB_URI=... node scripts/wipe-operational-data.js)
 */
require('../db')
const mongoose = require('mongoose')

const TARGETS = [
  ['Patient',          require('../models/Patient')],
  ['Encounter',        require('../models/Encounter')],
  ['Appointment',      require('../models/Appointment')],
  ['Invoice',          require('../models/Invoice')],
  ['Payment',          require('../models/Payment')],
  ['Entitlement',      require('../models/Entitlement')],
  ['PartnerReferral',  require('../models/PartnerReferral')],
  ['PatientAccount',   require('../models/PatientAccount')],
  ['PatientFeedback',  require('../models/PatientFeedback')],
  ['Notification',     require('../models/Notification')],
  ['Report',           require('../models/Report')],
  ['KeyImage',         require('../models/KeyImage')],
  ['StudyAnnotation',  require('../models/StudyAnnotation')],
]

async function run() {
  console.log('Wiping operational data...')
  for (const [name, Model] of TARGETS) {
    const before = await Model.countDocuments()
    const r = await Model.deleteMany({})
    console.log(`  ✓ ${name.padEnd(18)} ${String(before).padStart(6)} → 0  (deleted ${r.deletedCount})`)
  }
  console.log('Done. Catalogs / users / partners / inventory / audit log untouched.')
  await mongoose.disconnect()
}

run().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
