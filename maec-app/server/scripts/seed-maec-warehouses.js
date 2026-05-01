/**
 * Seed Departments + Warehouses for MAEC's 2 sites.
 * Idempotent — re-running upserts.
 *
 * Run: railway run node scripts/seed-maec-warehouses.js
 */
require('../db')
const mongoose = require('mongoose')
const Department = require('../models/Department')
const Warehouse = require('../models/Warehouse')

const now = () => new Date().toISOString()

const SITES = [
  { deptId: 'DEPT-TK', deptCode: 'TK', name: 'Trung Kính', address: 'Cầu Giấy, Hà Nội', whId: 'WH-TK', whCode: 'KHO-TK' },
  { deptId: 'DEPT-KG', deptCode: 'KG', name: 'Kim Giang', address: 'Thanh Xuân, Hà Nội', whId: 'WH-KG', whCode: 'KHO-KG' },
]

async function run() {
  console.log('Seeding Departments + Warehouses...')
  for (const s of SITES) {
    await Department.findByIdAndUpdate(
      s.deptId,
      {
        $set: { code: s.deptCode, name: s.name, type: 'branch', address: s.address, status: 'active', updatedAt: now() },
        $setOnInsert: { _id: s.deptId, createdAt: now() },
      },
      { upsert: true, new: true }
    )
    await Warehouse.findByIdAndUpdate(
      s.whId,
      {
        $set: {
          code: s.whCode,
          name: `Kho ${s.name}`,
          // Use the human site name in Warehouse.site so encounter.site (also
          // human name) matches without a Department lookup.
          site: s.name,
          address: s.address,
          status: 'active',
          updatedAt: now(),
        },
        $setOnInsert: { _id: s.whId, createdAt: now() },
      },
      { upsert: true, new: true }
    )
    console.log(`  ✓ ${s.name}: ${s.deptId} + ${s.whId}`)
  }
  console.log('Done.')
  await mongoose.connection.close()
}

run().catch(err => { console.error(err); process.exit(1) })
