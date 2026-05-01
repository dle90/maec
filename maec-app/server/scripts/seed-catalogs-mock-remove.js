/**
 * Remove all mock catalog data seeded by seed-catalogs-mock.js.
 *
 * Matches any doc whose _id contains "MOCK-" across the seeded
 * collections. Run before real-data import to clear the demo stubs.
 *
 * Usage: node scripts/seed-catalogs-mock-remove.js
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
require('../db')

const Specialty = require('../models/Specialty')
const ServiceType = require('../models/ServiceType')
const TaxGroup = require('../models/TaxGroup')
const Service = require('../models/Service')
const ReferralDoctor = require('../models/ReferralDoctor')
const PartnerFacility = require('../models/PartnerFacility')
const CommissionGroup = require('../models/CommissionGroup')
const CommissionRule = require('../models/CommissionRule')
const Study = require('../models/Study')

const TARGETS = [
  [Specialty,            'Chuyên khoa'],
  [TaxGroup,             'Nhóm thuế dịch vụ'],
  [ServiceType,          'Loại dịch vụ'],
  [Service,              'Dịch vụ'],
  [ReferralDoctor,       'Bác sĩ giới thiệu'],
  [PartnerFacility,      'Cơ sở y tế đối tác'],
  [CommissionGroup,      'Nhóm hoa hồng'],
  [CommissionRule,       'Hoa hồng'],
  [Study,                'Studies (Ca chụp / Ca đọc)'],
]

async function run() {
  console.log('Removing mock catalog data (_id matching /MOCK-/)...\n')
  for (const [Model, label] of TARGETS) {
    const r = await Model.deleteMany({ _id: { $regex: 'MOCK-' } })
    console.log(`✓ ${String(r.deletedCount).padStart(3)} ${label}`)
  }
  console.log('\nDone.')
  process.exit(0)
}

run().catch(err => { console.error(err); process.exit(1) })
