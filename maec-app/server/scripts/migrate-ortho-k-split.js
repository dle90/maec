/**
 * Migrate the legacy Ortho-K bundle (PKG-3A + PKG-3B with 3 lens tiers each)
 * into 3 separately-billable components per the 2026-05-04 product decision:
 *
 *   1. Khám Ortho-K (2 packages, by OCT inclusion)
 *      - PKG-OK-EXAM-NOOCT  6 services  1,500,000đ
 *      - PKG-OK-EXAM-OCT    8 services  2,100,000đ
 *
 *   2. Kính Ortho-K (3 generic Kinh SKUs in the Kính catalog)
 *      - OK-LENS-STD    Standard    11,000,000đ
 *      - OK-LENS-TORIC  Toric       14,000,000đ
 *      - OK-LENS-CUST   Customized  18,000,000đ
 *
 *   3. Theo dõi Ortho-K (6 follow-up packages, one per visit milestone)
 *      - PKG-OK-FU-1W   sau 1 tuần
 *      - PKG-OK-FU-1M   sau 1 tháng
 *      - PKG-OK-FU-3M   sau 3 tháng
 *      - PKG-OK-FU-6M   sau 6 tháng
 *      - PKG-OK-FU-9M   sau 9 tháng
 *      - PKG-OK-FU-12M  sau 12 tháng
 *      Bundles + prices left empty — defined later via the Danh mục UI.
 *
 * Sums reconcile to the legacy PKG-3A/3B totals (e.g. Standard no-OCT =
 * 1.5M + 11M + 3M = 15.5M; the implicit follow-up-cost of 3M lives on the
 * 6 PKG-OK-FU-* packages above).
 *
 * Legacy PKG-3A and PKG-3B are flipped to status='inactive' rather than
 * deleted because historical encounters reference their codes.
 *
 * Idempotent — safe to re-run.
 *
 * Run: railway run node scripts/migrate-ortho-k-split.js
 */
require('../db')
const mongoose = require('mongoose')
const Kinh = require('../models/Kinh')
const Package = require('../models/Package')

const now = () => new Date().toISOString()

const LENSES = [
  { code: 'OK-LENS-STD',   name: 'Kính Ortho-K Standard',   kinhType: 'standard',   sellPrice: 11000000 },
  { code: 'OK-LENS-TORIC', name: 'Kính Ortho-K Toric',      kinhType: 'toric',      sellPrice: 14000000 },
  { code: 'OK-LENS-CUST',  name: 'Kính Ortho-K Customized', kinhType: 'customized', sellPrice: 18000000 },
]

const EXAM_PACKAGES = [
  {
    code: 'PKG-OK-EXAM-NOOCT',
    name: 'Khám Ortho-K (không OCT)',
    description: 'Khám fit Ortho-K — 6 dịch vụ. Không bao gồm kính (chọn riêng từ Kính) hoặc theo dõi (chọn từ PKG-OK-FU-*).',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-IOP', 'SVC-SLIT', 'SVC-TOPO', 'SVC-CL-FIT-RGP'],
    basePrice: 1500000,
  },
  {
    code: 'PKG-OK-EXAM-OCT',
    name: 'Khám Ortho-K (có OCT trước + sau)',
    description: 'Khám fit Ortho-K — 8 dịch vụ (gồm OCT bán phần trước + sau). Không bao gồm kính hoặc theo dõi.',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-IOP', 'SVC-SLIT', 'SVC-TOPO', 'SVC-CL-FIT-RGP', 'SVC-OCT-ANT', 'SVC-OCT-POST'],
    basePrice: 2100000,
  },
]

const FOLLOWUP_PACKAGES = [
  { code: 'PKG-OK-FU-1W',  name: 'Theo dõi Ortho-K — sau 1 tuần' },
  { code: 'PKG-OK-FU-1M',  name: 'Theo dõi Ortho-K — sau 1 tháng' },
  { code: 'PKG-OK-FU-3M',  name: 'Theo dõi Ortho-K — sau 3 tháng' },
  { code: 'PKG-OK-FU-6M',  name: 'Theo dõi Ortho-K — sau 6 tháng' },
  { code: 'PKG-OK-FU-9M',  name: 'Theo dõi Ortho-K — sau 9 tháng' },
  { code: 'PKG-OK-FU-12M', name: 'Theo dõi Ortho-K — sau 12 tháng' },
]

async function upsertKinh(spec) {
  const existing = await Kinh.findById(spec.code).lean()
  if (existing) {
    console.log(`  · Kinh ${spec.code} exists — skipping`)
    return false
  }
  await Kinh.create({
    _id: spec.code,
    code: spec.code,
    name: spec.name,
    category: 'ortho-k',
    kinhType: spec.kinhType,
    brand: '',
    spec: '',
    importPrice: 0,
    sellPrice: spec.sellPrice,
    description: '',
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  })
  console.log(`  + Kinh ${spec.code} created`)
  return true
}

async function upsertPackage(spec) {
  const existing = await Package.findById(spec.code).lean()
  if (existing) {
    console.log(`  · Package ${spec.code} exists — skipping`)
    return false
  }
  await Package.create({
    _id: spec.code,
    code: spec.code,
    name: spec.name,
    description: spec.description || '',
    bundledServices: spec.bundledServices || [],
    basePrice: spec.basePrice || 0,
    pricingTiers: [],
    pricingRules: [],
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  })
  console.log(`  + Package ${spec.code} created`)
  return true
}

async function deprecate(code) {
  const p = await Package.findById(code)
  if (!p) {
    console.log(`  ? Package ${code} not found — nothing to deprecate`)
    return
  }
  if (p.status === 'inactive') {
    console.log(`  · Package ${code} already inactive`)
    return
  }
  p.status = 'inactive'
  p.updatedAt = now()
  await p.save()
  console.log(`  − Package ${code} → inactive`)
}

async function run() {
  console.log('═══ Ortho-K split migration ═══')

  console.log('\n[1/4] Kính (3 generic Ortho-K SKUs)')
  for (const k of LENSES) await upsertKinh(k)

  console.log('\n[2/4] Khám packages (2)')
  for (const p of EXAM_PACKAGES) await upsertPackage(p)

  console.log('\n[3/4] Theo dõi packages (6 — empty bundles, configure on UI)')
  for (const p of FOLLOWUP_PACKAGES) await upsertPackage(p)

  console.log('\n[4/4] Deprecate legacy bundles')
  await deprecate('PKG-3A')
  await deprecate('PKG-3B')

  console.log('\n═══ Done ═══')
  await mongoose.connection.close()
}

run().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
