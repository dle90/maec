/**
 * Auto-classify Ortho-K Kính SKUs into kinhType ('standard'/'toric'/'customized')
 * based on name patterns. Idempotent — only sets kinhType where empty.
 *
 * Heuristic order (first match wins):
 *   1. /toric/i           → 'toric'
 *   2. /premium|custom/i  → 'customized'
 *   3. /standard|HD|TD/i  → 'standard'
 *   4. anything else      → 'standard' (default — most ortho-K SKUs are standard variants)
 *
 * Run: railway run node scripts/classify-ortho-k-types.js
 */
require('../db')
const mongoose = require('mongoose')
const Kinh = require('../models/Kinh')

function inferType(name) {
  const n = String(name || '')
  if (/toric/i.test(n)) return 'toric'
  if (/premium|custom/i.test(n)) return 'customized'
  return 'standard'  // includes Standard, HD, TD, generic Ortho-K
}

async function run() {
  console.log('Scanning Ortho-K SKUs without kinhType set...')
  const candidates = await Kinh.find({
    category: 'ortho-k',
    $or: [{ kinhType: { $exists: false } }, { kinhType: '' }, { kinhType: null }],
  }).lean()

  console.log(`Found ${candidates.length} candidate(s):`)
  if (candidates.length === 0) {
    console.log('Nothing to classify. Already done?')
    await mongoose.disconnect()
    return
  }

  const updates = candidates.map(c => ({ code: c.code, name: c.name, type: inferType(c.name) }))
  for (const u of updates) {
    console.log(`  ${u.code.padEnd(12)} ${u.name.padEnd(60)} → ${u.type}`)
  }

  for (const u of updates) {
    await Kinh.updateOne(
      { code: u.code },
      { $set: { kinhType: u.type, updatedAt: new Date().toISOString() } }
    )
  }
  console.log(`\nUpdated ${updates.length} document(s). Open the matrix to verify; tweak any wrong ones via the Kính form.`)
  await mongoose.disconnect()
}

run().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
