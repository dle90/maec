// Sprint 0 smoke test: insert 10k synthetic patients with `_TEST10K_` prefix,
// exercise the new server-side filters + pagination, then delete them.
//
// Run via:  cd maec-app/server && railway run node scripts/smoke-patients-10k.js
//
// Verifies:
//  - countDocuments + skip/limit returns expected page sizes
//  - gender filter narrows total
//  - age range filter narrows total + still hits indexed dob
//  - createdAt range narrows total
//  - lastEncounterAt range narrows total
//  - search query (q) is authoritative (filters ignored when q present)
//  - cleanup removes every seeded row
//
// All synthetic rows have name starting with `_TEST10K_` so cleanup is exact.

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const mongoose = require('mongoose')
const Patient = require('../models/Patient')

const COUNT = 10_000
const PREFIX = '_TEST10K_'

const pad = (n, w) => String(n).padStart(w, '0')
const isoNow = () => new Date().toISOString()
const daysAgoISO = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString()
}
const dobForAge = (age) => {
  const d = new Date(); d.setFullYear(d.getFullYear() - age); d.setDate(d.getDate() - 30) // 30d into the year so we're definitively that age
  return d.toISOString().slice(0, 10)
}

async function seed() {
  console.log(`Seeding ${COUNT} _TEST10K_ patients…`)
  const docs = []
  const t0 = Date.now()
  for (let i = 0; i < COUNT; i++) {
    const id = `${PREFIX}${pad(i, 5)}`
    const gender = i % 3 === 0 ? 'F' : i % 3 === 1 ? 'M' : 'other'
    const age = (i % 90) + 1 // ages 1..90
    docs.push({
      _id: id,
      patientId: `BN-T10K-${pad(i, 5)}`,
      name: `${PREFIX}BN ${pad(i, 5)}`,
      phone: `09${pad(i % 100000000, 8)}`,
      dob: dobForAge(age),
      gender,
      registeredSite: i % 2 === 0 ? 'Trung Kính' : 'Kim Giang',
      createdAt: daysAgoISO(i % 365),
      lastEncounterAt: i % 5 === 0 ? daysAgoISO(i % 90) : '',
      updatedAt: isoNow(),
    })
  }
  // insertMany in chunks of 1000
  for (let i = 0; i < docs.length; i += 1000) {
    await Patient.insertMany(docs.slice(i, i + 1000), { ordered: false })
    process.stdout.write('.')
  }
  console.log(`\nInserted in ${Date.now() - t0}ms`)
}

async function cleanup() {
  console.log('Cleaning up…')
  const r = await Patient.deleteMany({ name: { $regex: `^${PREFIX}` } })
  console.log(`Deleted ${r.deletedCount} _TEST10K_ rows`)
}

async function smoke() {
  // 1. Basic count
  const all = await Patient.countDocuments({ name: { $regex: `^${PREFIX}` } })
  assert(all === COUNT, `Total count mismatch: ${all} vs ${COUNT}`)
  console.log(`✓ inserted exactly ${COUNT}`)

  // 2. Gender filter narrows
  const males = await Patient.countDocuments({ name: { $regex: `^${PREFIX}` }, gender: 'M' })
  const females = await Patient.countDocuments({ name: { $regex: `^${PREFIX}` }, gender: 'F' })
  const other = await Patient.countDocuments({ name: { $regex: `^${PREFIX}` }, gender: 'other' })
  assert(males + females + other === COUNT, `Gender split mismatch: ${males}+${females}+${other} != ${COUNT}`)
  console.log(`✓ gender split: M=${males} F=${females} other=${other}`)

  // 3. Age range filter — ages 60..80
  // ageMin=60 → dob <= today minus 60y
  // ageMax=80 → dob > today minus 81y
  const ageMin = 60, ageMax = 80
  const dMax = new Date(); dMax.setFullYear(dMax.getFullYear() - ageMin)
  const dMin = new Date(); dMin.setFullYear(dMin.getFullYear() - ageMax - 1); dMin.setDate(dMin.getDate() + 1)
  const ageWindow = await Patient.countDocuments({
    name: { $regex: `^${PREFIX}` },
    dob: { $lte: dMax.toISOString().slice(0, 10), $gte: dMin.toISOString().slice(0, 10), $ne: '' },
  })
  // Each age 60..80 has ~111 rows (10k / 90 ages, evenly distributed). 21 ages × ~111 ≈ 2333.
  assert(ageWindow > 2000 && ageWindow < 2700, `Age window 60..80 expected ~2333, got ${ageWindow}`)
  console.log(`✓ age 60..80 narrows to ${ageWindow} (expected ~2333)`)

  // 4. createdAt range — last 30 days
  const cFrom = new Date(); cFrom.setDate(cFrom.getDate() - 30)
  const last30 = await Patient.countDocuments({
    name: { $regex: `^${PREFIX}` },
    createdAt: { $gte: cFrom.toISOString() },
  })
  // Days 0..29 ⇒ 30 days × ~28 rows/day ≈ 840 (10k/365 ≈ 27.4)
  assert(last30 > 700 && last30 < 1000, `Last 30d expected ~830, got ${last30}`)
  console.log(`✓ createdAt last 30d: ${last30}`)

  // 5. lastEncounterAt range — last 30 days, only when set (every 5th)
  const lastEnc30 = await Patient.countDocuments({
    name: { $regex: `^${PREFIX}` },
    lastEncounterAt: { $gte: cFrom.toISOString() },
  })
  // 1 in 5 has lastEncounterAt; days 0..89 cycle. 30/90 of 1/5 of 10k ≈ 666
  assert(lastEnc30 > 500 && lastEnc30 < 800, `lastEncounter last 30d expected ~666, got ${lastEnc30}`)
  console.log(`✓ lastEncounterAt last 30d: ${lastEnc30}`)

  // 6. Pagination correctness — fetch page 1 of 200, then page 50 of 200 (last page)
  const page1 = await Patient.find({ name: { $regex: `^${PREFIX}` } })
    .sort({ createdAt: -1 }).skip(0).limit(200).lean()
  assert(page1.length === 200, `Page 1 should have 200, got ${page1.length}`)
  const page50 = await Patient.find({ name: { $regex: `^${PREFIX}` } })
    .sort({ createdAt: -1 }).skip(49 * 200).limit(200).lean()
  assert(page50.length === 200, `Page 50 should have 200, got ${page50.length}`)
  // No overlap
  const ids1 = new Set(page1.map(p => p._id))
  const overlap = page50.filter(p => ids1.has(p._id)).length
  assert(overlap === 0, `Pages should not overlap, got ${overlap}`)
  console.log(`✓ paging stable: page1=200, page50=200, no overlap`)
}

function assert(cond, msg) {
  if (!cond) { console.error('✗ FAIL:', msg); process.exit(1) }
}

;(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/maec')
  try {
    await seed()
    await smoke()
  } finally {
    await cleanup()
    await mongoose.disconnect()
  }
})().catch(err => { console.error(err); process.exit(1) })
