/**
 * Recategorize Ortho-K Kính SKUs from 'ktx' to the new 'ortho-k' category.
 *
 * The 'ortho-k' Kinh.category enum value was added 2026-05-02. Existing
 * ortho-K SKUs (seeded under 'ktx' before the split) are matched by name
 * containing /ortho.?k|orthok/i and flipped over. Idempotent — already-
 * recategorized rows are skipped.
 *
 * Run: railway run node scripts/recategorize-ortho-k.js
 *      (or: MONGODB_URI=... node scripts/recategorize-ortho-k.js)
 */
require('../db')
const mongoose = require('mongoose')
const Kinh = require('../models/Kinh')

const ORTHO_K_NAME_REGEX = /ortho.?k|orthok/i

async function run() {
  console.log('Scanning Kinh collection for Ortho-K SKUs not yet categorized as "ortho-k"...')
  const candidates = await Kinh.find({
    name: { $regex: ORTHO_K_NAME_REGEX },
    category: { $ne: 'ortho-k' },
  }).lean()

  console.log(`Found ${candidates.length} candidate(s):`)
  for (const c of candidates) {
    console.log(`  - ${c.code.padEnd(12)} ${c.name}  [was: ${c.category || '(none)'}]`)
  }

  if (candidates.length === 0) {
    console.log('Nothing to migrate. Already done?')
    await mongoose.disconnect()
    return
  }

  const codes = candidates.map(c => c.code)
  const result = await Kinh.updateMany(
    { code: { $in: codes } },
    { $set: { category: 'ortho-k', updatedAt: new Date().toISOString() } }
  )
  console.log(`\nUpdated ${result.modifiedCount} document(s) → category='ortho-k'`)
  await mongoose.disconnect()
}

run().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
