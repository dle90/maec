// Migration: introduces the warehouse-per-site + kho tổng data model.
//
// Safe to run multiple times. Does NOT drop any data; only backfills.
//
//   1. Creates one Warehouse per branch Department (type='branch'), plus one
//      central warehouse (Kho Tổng) with site=null.
//   2. Backfills InventoryLot.warehouseId and InventoryTransaction.warehouseId
//      from the existing `site` field for any doc missing it.
//   3. Leaves Supply.site + Supply.currentStock in place. Supply.site is no
//      longer read; currentStock is treated as a deprecated cache.
//
// Run:    node maec-app/server/scripts/migrate-warehouse-model.js
// Dry:    node maec-app/server/scripts/migrate-warehouse-model.js --dry

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')
require('../db') // auto-connects via env MONGODB_URI
const Department = require('../models/Department')
const Warehouse = require('../models/Warehouse')
const InventoryLot = require('../models/InventoryLot')
const InventoryTransaction = require('../models/InventoryTransaction')

const DRY = process.argv.includes('--dry')
const now = () => new Date().toISOString()

async function waitForConnection() {
  if (mongoose.connection.readyState === 1) return
  await new Promise((resolve, reject) => {
    mongoose.connection.once('open', resolve)
    mongoose.connection.once('error', reject)
  })
}

async function main() {
  await waitForConnection()

  // 1. Warehouses
  const branches = await Department.find({ type: 'branch', status: 'active' }).lean()
  console.log(`Found ${branches.length} active branch departments.`)

  const plan = []
  for (const b of branches) {
    const whId = `WH-${b.code}`
    const existing = await Warehouse.findById(whId).lean()
    if (!existing) {
      plan.push({
        op: 'create-branch-warehouse',
        doc: {
          _id: whId,
          code: `KHO-${b.code}`,
          name: `Kho ${b.name}`,
          site: b._id,
          manager: b.headName || '',
          phone: b.phone || '',
          address: b.address || '',
          status: 'active',
          createdAt: now(),
          updatedAt: now(),
        },
      })
    } else if (!existing.site) {
      plan.push({ op: 'patch-warehouse-site', id: whId, site: b._id })
    }
  }

  const tongId = 'WH-TONG'
  const tongExisting = await Warehouse.findById(tongId).lean()
  if (!tongExisting) {
    plan.push({
      op: 'create-central-warehouse',
      doc: {
        _id: tongId,
        code: 'KHO-TONG',
        name: 'Kho Tổng',
        site: null,
        status: 'active',
        createdAt: now(),
        updatedAt: now(),
      },
    })
  }

  // 2. Backfill lots
  const lotsNeeding = await InventoryLot.find({ $or: [{ warehouseId: { $exists: false } }, { warehouseId: '' }, { warehouseId: null }] }).lean()
  console.log(`Found ${lotsNeeding.length} lots missing warehouseId.`)

  const siteToWh = new Map()
  for (const b of branches) siteToWh.set(b._id, `WH-${b.code}`)
  // Also allow docs that stored site as the department code (e.g. "HN") rather than _id.
  for (const b of branches) siteToWh.set(b.code, `WH-${b.code}`)

  const lotPatches = []
  const lotUnresolved = []
  for (const lot of lotsNeeding) {
    const wh = siteToWh.get(lot.site)
    if (wh) lotPatches.push({ _id: lot._id, warehouseId: wh })
    else lotUnresolved.push(lot._id)
  }

  // 3. Backfill transactions
  const txsNeeding = await InventoryTransaction.find({ $or: [{ warehouseId: { $exists: false } }, { warehouseId: '' }, { warehouseId: null }] }).lean()
  console.log(`Found ${txsNeeding.length} transactions missing warehouseId.`)

  const txPatches = []
  const txUnresolved = []
  for (const tx of txsNeeding) {
    const wh = siteToWh.get(tx.site)
    if (wh) txPatches.push({ _id: tx._id, warehouseId: wh })
    else txUnresolved.push(tx._id)
  }

  // Summary
  console.log('\n=== PLAN ===')
  for (const p of plan) {
    if (p.op === 'create-branch-warehouse') console.log(`  + Warehouse ${p.doc._id} (${p.doc.name}, site=${p.doc.site})`)
    else if (p.op === 'create-central-warehouse') console.log(`  + Warehouse ${p.doc._id} (Kho Tổng)`)
    else if (p.op === 'patch-warehouse-site') console.log(`  ~ Warehouse ${p.id} → site=${p.site}`)
  }
  console.log(`  ~ ${lotPatches.length} lots will get warehouseId`)
  if (lotUnresolved.length) console.log(`  ! ${lotUnresolved.length} lots have a site that maps to no branch — left as-is:`, lotUnresolved.slice(0, 5))
  console.log(`  ~ ${txPatches.length} transactions will get warehouseId`)
  if (txUnresolved.length) console.log(`  ! ${txUnresolved.length} transactions have a site that maps to no branch — left as-is:`, txUnresolved.slice(0, 5))

  if (DRY) {
    console.log('\n--dry — no writes.')
    await mongoose.disconnect()
    process.exit(0)
  }

  // Apply
  for (const p of plan) {
    if (p.op === 'create-branch-warehouse' || p.op === 'create-central-warehouse') {
      await Warehouse.create(p.doc)
    } else if (p.op === 'patch-warehouse-site') {
      await Warehouse.updateOne({ _id: p.id }, { $set: { site: p.site, updatedAt: now() } })
    }
  }
  for (const lp of lotPatches) {
    await InventoryLot.updateOne({ _id: lp._id }, { $set: { warehouseId: lp.warehouseId } })
  }
  for (const tp of txPatches) {
    await InventoryTransaction.updateOne({ _id: tp._id }, { $set: { warehouseId: tp.warehouseId } })
  }

  console.log('\n✓ Migration complete.')
  await mongoose.disconnect()
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
