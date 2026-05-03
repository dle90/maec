/**
 * Seed MAEC catalog: 22 services + 8 packages.
 * Reconciled with "PK MA_Danh Sách Giá.xlsx" (Giá DV khám tab) on 2026-05-01.
 *
 * Run: railway run node scripts/seed-maec-catalog.js
 *      (or: MONGODB_URI=... node scripts/seed-maec-catalog.js)
 */
require('../db')
const mongoose = require('mongoose')
const Service = require('../models/Service')
const Package = require('../models/Package')

const now = () => new Date().toISOString()

// basePrice = à la carte (standalone) price.
// inPackagePrice = discounted price when bundled into a Package (null = same as basePrice).
// Sources: 2026-05-01 price sheet (Khám tab). Services not in sheet kept at prior estimate.
// Service ↔ station/role/device mappings live in FOLLOWUPS.md ("Devices module — deferred")
// until the Devices table+module is built.
const SERVICES = [
  { code: 'SVC-AUTOREF',         name: 'Chụp khúc xạ tự động (+ đo số kính cũ nếu có)', category: 'khucxa',     basePrice: 50000 },
  { code: 'SVC-REFRACT',         name: 'Đo khúc xạ (VA + chủ quan trial frame + khách quan SBĐT dry + PD)', category: 'khucxa',     basePrice: 100000 },
  { code: 'SVC-TG2M',            name: 'Đo thị giác hai mắt (alignment + fusion + lập thể + biên độ điều tiết)', category: 'khucxa',     basePrice: 100000, note: 'Sheet: Khám TG2M chuyên sâu 100k' },
  { code: 'SVC-CYCLO',           name: 'Đo khúc xạ sau liệt điều tiết (Atropin / Cyclogyl)', category: 'khucxa',     basePrice: 150000, note: 'Drug as parameter (Atropin / Cyclogyl). Sheet: 150k each.' },
  { code: 'SVC-CONTRAST',        name: 'Đo độ tương phản',                                category: 'khucxa',     basePrice: 150000 },
  { code: 'SVC-ISHIHARA',        name: 'Đo sắc giác (Ishihara)',                          category: 'khucxa',     basePrice: 50000 },
  { code: 'SVC-IOP',             name: 'Đo nhãn áp (iCare + Goldmann confirm khi bất thường)', category: 'iop-shv',     basePrice: 100000 },
  { code: 'SVC-SLIT',            name: 'Khám sinh hiển vi (multi-event: initial + conclusion + [ortho-K] CL eval)', category: 'iop-shv',     basePrice: 200000 },
  { code: 'SVC-BIO',             name: 'Soi đáy mắt bằng BIO (indirect ophthalmoscopy)',  category: 'iop-shv',     basePrice: 100000 },
  { code: 'SVC-SCHIRMER',        name: 'Test Schirmer',                                   category: 'iop-shv',     basePrice: 50000 },
  { code: 'SVC-TOPO',            name: 'Bản đồ giác mạc',                                 category: 'imaging',    basePrice: 350000, inPackagePrice: 250000 },
  { code: 'SVC-OCT-ANT',         name: 'OCT bán phần trước (+ pachymetry)',               category: 'imaging',    basePrice: 400000, inPackagePrice: 300000 },
  { code: 'SVC-OCT-POST',        name: 'OCT bán phần sau (RNFL + macula + ONH)',          category: 'imaging',    basePrice: 400000, inPackagePrice: 300000 },
  { code: 'SVC-FUNDUS',          name: 'Chụp đáy mắt',                                    category: 'imaging',    basePrice: 300000 },
  { code: 'SVC-DRYEYE',          name: 'Đánh giá khô mắt (khám nghiệm)',                  category: 'imaging',    basePrice: 100000 },
  { code: 'SVC-BIOMETRY',        name: 'Sinh trắc nhãn cầu (IOL biometry)',               category: 'imaging',    basePrice: 400000 },
  { code: 'SVC-OCT-FULL',        name: 'OCT tổng (bán phần trước + sau)',                 category: 'imaging',    basePrice: 800000, inPackagePrice: 600000, note: 'Sheet 2026-05-01: standalone 800k, in-package 600k. Distinct billable code from selecting OCT-ANT + OCT-POST separately.' },
  { code: 'SVC-CL-FIT-SOFT',     name: 'Thử kính tiếp xúc mềm',                           category: 'cl',         basePrice: 100000 },
  { code: 'SVC-CL-FIT-RGP',      name: 'Thử kính tiếp xúc cứng (RGP / ortho-K)',          category: 'cl',         basePrice: 200000 },
  { code: 'SVC-CL-FIT-SCLERAL',  name: 'Thử kính tiếp xúc củng mạc',                      category: 'cl',         basePrice: 250000 },
  { code: 'SVC-MYOPIA-CONSULT',  name: 'Tư vấn kiểm soát cận thị (placeholder, chưa bill riêng)', category: 'cl',         basePrice: 0 },
  { code: 'SVC-FB-REMOVE',       name: 'Lấy dị vật kết / giác mạc',                       category: 'thuthuat',   basePrice: 100000 },
]

const PACKAGES = [
  {
    code: 'PKG-1',
    name: 'Khám mắt cơ bản',
    description: 'Gói khám phổ thông: autoref + đo khúc xạ + IOP + sinh hiển vi (initial + kết luận).',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-IOP', 'SVC-SLIT'],
    basePrice: 250000,
    pricingTiers: [],
    pricingRules: [],
    activatesEntitlement: null,
  },
  // ── Ortho-K — split into khám / kính / theo dõi (2026-05-04) ─────────
  // Legacy PKG-3A and PKG-3B were replaced by:
  //   1. Two khám packages (PKG-OK-EXAM-NOOCT / -OCT) — 6 or 8 services
  //   2. Three Kính SKUs (OK-LENS-STD / -TORIC / -CUST) seeded by
  //      migrate-ortho-k-split.js since this seed file doesn't manage Kinh
  //   3. Six follow-up packages (PKG-OK-FU-1W..-12M) — empty bundles, the
  //      clinic configures services + price for each milestone via the UI
  // Sums match the legacy totals (Std no-OCT = 1.5M + 11M + 3M = 15.5M etc).
  // Old PKG-3A / PKG-3B are NOT seeded here; the migration script flips them
  // to status='inactive' so historical encounters keep their references.
  {
    code: 'PKG-OK-EXAM-NOOCT',
    name: 'Khám Ortho-K (không OCT)',
    description: 'Khám fit Ortho-K — 6 dịch vụ. Không bao gồm kính (chọn riêng từ Kính) hoặc theo dõi (chọn từ PKG-OK-FU-*).',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-IOP', 'SVC-SLIT', 'SVC-TOPO', 'SVC-CL-FIT-RGP'],
    basePrice: 1500000,
    pricingTiers: [],
    pricingRules: [],
    activatesEntitlement: null,
  },
  {
    code: 'PKG-OK-EXAM-OCT',
    name: 'Khám Ortho-K (có OCT trước + sau)',
    description: 'Khám fit Ortho-K — 8 dịch vụ (gồm OCT bán phần trước + sau). Không bao gồm kính hoặc theo dõi.',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-IOP', 'SVC-SLIT', 'SVC-TOPO', 'SVC-CL-FIT-RGP', 'SVC-OCT-ANT', 'SVC-OCT-POST'],
    basePrice: 2100000,
    pricingTiers: [],
    pricingRules: [],
    activatesEntitlement: null,
  },
  // 6 follow-up milestones — empty placeholders, clinic configures bundle +
  // price per milestone in the Danh mục UI.
  { code: 'PKG-OK-FU-1W',  name: 'Theo dõi Ortho-K — sau 1 tuần',  description: 'Cấu hình dịch vụ + giá ở Danh mục.', bundledServices: [], basePrice: 0, pricingTiers: [], pricingRules: [], activatesEntitlement: null },
  { code: 'PKG-OK-FU-1M',  name: 'Theo dõi Ortho-K — sau 1 tháng', description: 'Cấu hình dịch vụ + giá ở Danh mục.', bundledServices: [], basePrice: 0, pricingTiers: [], pricingRules: [], activatesEntitlement: null },
  { code: 'PKG-OK-FU-3M',  name: 'Theo dõi Ortho-K — sau 3 tháng', description: 'Cấu hình dịch vụ + giá ở Danh mục.', bundledServices: [], basePrice: 0, pricingTiers: [], pricingRules: [], activatesEntitlement: null },
  { code: 'PKG-OK-FU-6M',  name: 'Theo dõi Ortho-K — sau 6 tháng', description: 'Cấu hình dịch vụ + giá ở Danh mục.', bundledServices: [], basePrice: 0, pricingTiers: [], pricingRules: [], activatesEntitlement: null },
  { code: 'PKG-OK-FU-9M',  name: 'Theo dõi Ortho-K — sau 9 tháng', description: 'Cấu hình dịch vụ + giá ở Danh mục.', bundledServices: [], basePrice: 0, pricingTiers: [], pricingRules: [], activatesEntitlement: null },
  { code: 'PKG-OK-FU-12M', name: 'Theo dõi Ortho-K — sau 12 tháng', description: 'Cấu hình dịch vụ + giá ở Danh mục.', bundledServices: [], basePrice: 0, pricingTiers: [], pricingRules: [], activatesEntitlement: null },
  {
    code: 'PKG-2A',
    name: 'Khám mắt trẻ em có Cyclogyl 1%',
    description: 'Pediatric variant: basic + cyclo (no TG2M). Sheet 2026-05-01.',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-IOP', 'SVC-SLIT', 'SVC-CYCLO'],
    basePrice: 350000,
    pricingTiers: [],
    pricingRules: [],
    activatesEntitlement: null,
  },
  {
    code: 'PKG-2B',
    name: 'Khám mắt trẻ em + Thị giác hai mắt',
    description: 'Pediatric variant: basic + TG2M (no cyclo). Sheet 2026-05-01.',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-TG2M', 'SVC-IOP', 'SVC-SLIT'],
    basePrice: 350000,
    pricingTiers: [],
    pricingRules: [],
    activatesEntitlement: null,
  },
  {
    code: 'PKG-OK-RECHECK',
    name: 'Khám định kỳ OrthoK',
    description: 'Tái khám định kỳ cho BN đang đeo ortho-K. Giá 300k flat (sheet 2026-05-01).',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-SLIT', 'SVC-TOPO'],
    basePrice: 300000,
    pricingTiers: [],
    pricingRules: [],
    activatesEntitlement: null,
  },
  {
    code: 'PKG-RECHECK',
    name: 'Phí tái khám mắt',
    description: 'Tái khám sau visit gần nhất. Giá 150k flat. Bundle services TBD — placeholder.',
    bundledServices: ['SVC-REFRACT', 'SVC-SLIT'],
    basePrice: 150000,
    pricingTiers: [],
    pricingRules: [],
    activatesEntitlement: null,
  },
  {
    code: 'PKG-ATROPIN',
    name: 'Gói khám Atropin (kiểm soát cận thị)',
    description: 'Atropine myopia control program 1.5M. Bundle services placeholder — cần refine với MAEC: services bundled, follow-up schedule, entitlement length.',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-IOP', 'SVC-SLIT', 'SVC-TOPO', 'SVC-OCT-ANT', 'SVC-MYOPIA-CONSULT'],
    basePrice: 1500000,
    pricingTiers: [],
    pricingRules: [],
    activatesEntitlement: {
      durationMonths: 12,
      coveredServices: [
        { serviceCode: 'SVC-AUTOREF',         maxUses: null },
        { serviceCode: 'SVC-REFRACT',         maxUses: null },
        { serviceCode: 'SVC-SLIT',            maxUses: null },
        { serviceCode: 'SVC-TOPO',            maxUses: null },
        { serviceCode: 'SVC-MYOPIA-CONSULT',  maxUses: null },
      ],
    },
  },
]

async function seed() {
  console.log('Seeding MAEC catalog...')

  // Services
  await Service.deleteMany({})
  const serviceDocs = SERVICES.map(s => ({
    _id: s.code,
    code: s.code,
    name: s.name,
    category: s.category,
    basePrice: s.basePrice ?? 0,
    inPackagePrice: s.inPackagePrice ?? null,
    unit: 'lần',
    description: s.note || '',
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  }))
  await Service.insertMany(serviceDocs)
  console.log(`  ✓ Services: ${serviceDocs.length}`)

  // Packages
  await Package.deleteMany({})
  const pkgDocs = PACKAGES.map(p => ({
    _id: p.code,
    code: p.code,
    name: p.name,
    description: p.description,
    bundledServices: p.bundledServices,
    basePrice: p.basePrice,
    pricingTiers: p.pricingTiers,
    pricingRules: p.pricingRules,
    activatesEntitlement: p.activatesEntitlement || undefined,
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  }))
  await Package.insertMany(pkgDocs)
  console.log(`  ✓ Packages: ${pkgDocs.length}`)

  console.log('Seed complete.')
  await mongoose.connection.close()
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
