/**
 * Backfill Supply mirror entries for existing Thuốc + Kính catalog items
 * so they appear in the Inventory module (lots, transactions, stocktakes).
 *
 * Idempotent: re-running upserts. Safe to re-run after Thuoc/Kinh changes
 * (though the catalog CRUD handler now syncs automatically on every save).
 *
 * Run: railway run node scripts/seed-link-thuoc-kinh-to-supply.js
 */
require('../db')
const mongoose = require('mongoose')
const Thuoc = require('../models/Thuoc')
const Kinh = require('../models/Kinh')
const Supply = require('../models/Supply')

const now = () => new Date().toISOString()

async function syncOne(item, productKind) {
  await Supply.findByIdAndUpdate(
    item.code,
    {
      $set: {
        code: item.code,
        name: item.name,
        productKind,
        productCode: item.code,
        packagingSpec: item.spec || '',
        status: item.status || 'active',
        updatedAt: now(),
      },
      $setOnInsert: {
        _id: item.code,
        unit: 'cái',
        currentStock: 0,
        conversionRate: 1,
        minimumStock: 0,
        createdAt: now(),
      },
    },
    { upsert: true, new: true }
  )
}

async function run() {
  console.log('Backfilling Supply mirrors for Thuốc + Kính...')
  const thuocs = await Thuoc.find({}).lean()
  for (const t of thuocs) await syncOne(t, 'thuoc')
  console.log(`  ✓ Thuốc: ${thuocs.length} synced`)
  const kinhs = await Kinh.find({}).lean()
  for (const k of kinhs) await syncOne(k, 'kinh')
  console.log(`  ✓ Kính: ${kinhs.length} synced`)

  const total = await Supply.countDocuments({})
  const byKind = await Supply.aggregate([{ $group: { _id: '$productKind', n: { $sum: 1 } } }])
  console.log(`Total Supply rows: ${total}`)
  byKind.forEach(b => console.log(`  ${b._id || 'supply (legacy)'}: ${b.n}`))

  await mongoose.connection.close()
}

run().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
