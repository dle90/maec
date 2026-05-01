/**
 * Seed MAEC catalog: 19 services + 5 packages.
 * Replaces any prior radiology-era service rows.
 *
 * Run: railway run node scripts/seed-maec-catalog.js
 *      (or: MONGODB_URI=... node scripts/seed-maec-catalog.js)
 */
require('../db')
const mongoose = require('mongoose')
const Service = require('../models/Service')
const Package = require('../models/Package')

const now = () => new Date().toISOString()

const SERVICES = [
  { code: 'SVC-AUTOREF',         name: 'Chụp khúc xạ tự động (+ đo số kính cũ nếu có)', category: 'khucxa',     station: 'auto-ref',         role: 'ktv-khuc-xa', devices: ['Auto-refractor'],                          basePrice: 50000 },
  { code: 'SVC-REFRACT',         name: 'Đo khúc xạ (VA + chủ quan trial frame + khách quan SBĐT dry + PD)', category: 'khucxa',     station: 'va-refraction',    role: 'ktv-khuc-xa', devices: ['Trial frame + lens', 'VA chart'],          basePrice: 100000 },
  { code: 'SVC-TG2M',            name: 'Đo thị giác hai mắt (alignment + fusion + lập thể + biên độ điều tiết)', category: 'khucxa',     station: 'tg2m',             role: 'ktv-khuc-xa', devices: ['Worth 4-dot', 'Maddox', 'Prism bar'],      basePrice: 200000 },
  { code: 'SVC-CYCLO',           name: 'Liệt điều tiết + đo khúc xạ liệt điều tiết (45-min wait + wet SBĐT)', category: 'khucxa',     station: 'cyclo-room',       role: 'ktv-khuc-xa', devices: ['Cycloplegic drops', 'Trial frame'],        basePrice: 200000 },
  { code: 'SVC-CONTRAST',        name: 'Đo độ tương phản',                                category: 'khucxa',     station: 'contrast',         role: 'ktv',         devices: ['Pelli-Robson chart'],                       basePrice: 150000 },
  { code: 'SVC-ISHIHARA',        name: 'Đo sắc giác (Ishihara)',                          category: 'khucxa',     station: 'color-vision',     role: 'ktv',         devices: ['Ishihara plates'],                          basePrice: 50000 },
  { code: 'SVC-IOP',             name: 'Đo nhãn áp (iCare + Goldmann confirm khi bất thường)', category: 'iop-shv',     station: 'iop-portable',     role: 'ktv',         devices: ['iCare', 'Goldmann'],                       basePrice: 50000 },
  { code: 'SVC-SLIT',            name: 'Khám sinh hiển vi (multi-event: initial + conclusion + [ortho-K] CL eval)', category: 'iop-shv',     station: 'slit-lamp',        role: 'bs',          devices: ['Slit lamp', '90D / 78D'],                  basePrice: 200000 },
  { code: 'SVC-BIO',             name: 'Soi đáy mắt bằng BIO (indirect ophthalmoscopy)',  category: 'iop-shv',     station: 'bio',              role: 'bs',          devices: ['Indirect ophthalmoscope', '20D lens'],      basePrice: 100000 },
  { code: 'SVC-SCHIRMER',        name: 'Test Schirmer',                                   category: 'iop-shv',     station: 'schirmer',         role: 'ktv',         devices: ['Schirmer strips'],                          basePrice: 50000 },
  { code: 'SVC-TOPO',            name: 'Bản đồ giác mạc',                                 category: 'imaging',    station: 'topo',             role: 'ktv',         devices: ['Medmont'],                                  basePrice: 250000 },
  { code: 'SVC-OCT-ANT',         name: 'OCT bán phần trước (+ pachymetry)',               category: 'imaging',    station: 'oct',              role: 'ktv',         devices: ['Optopol Revo'],                             basePrice: 300000 },
  { code: 'SVC-OCT-POST',        name: 'OCT bán phần sau (RNFL + macula + ONH)',          category: 'imaging',    station: 'oct',              role: 'ktv',         devices: ['Optopol Revo'],                             basePrice: 300000 },
  { code: 'SVC-FUNDUS',          name: 'Chụp đáy mắt',                                    category: 'imaging',    station: 'fundus',           role: 'ktv',         devices: ['DRS Plus (Trung Kính)', 'Vietcan {model TBD} (Kim Giang)'], basePrice: 200000 },
  { code: 'SVC-DRYEYE',          name: 'Đánh giá khô mắt',                                category: 'imaging',    station: 'dry-eye',          role: 'ktv',         devices: ['IDRA', 'Medmont Meridia'],                  basePrice: 300000 },
  { code: 'SVC-BIOMETRY',        name: 'Sinh trắc nhãn cầu (IOL biometry)',               category: 'imaging',    station: 'biometry',         role: 'ktv',         devices: ['MediWorks AB800', 'Syseye', 'Optopol Revo'], basePrice: 250000 },
  { code: 'SVC-CL-FIT',          name: 'Thử kính tiếp xúc (gộp chốt đơn) — soft / RGP / ortho-K', category: 'cl',         station: 'cl-fit',           role: 'bs-cl',       devices: ['Trial CL kit', 'Slit lamp'],                basePrice: 700000 },
  { code: 'SVC-MYOPIA-CONSULT',  name: 'Tư vấn kiểm soát cận thị (placeholder, chưa bill riêng)', category: 'cl',         station: 'consult',          role: 'bs',          devices: [],                                           basePrice: 0 },
  { code: 'SVC-FB-REMOVE',       name: 'Lấy dị vật kết / giác mạc',                       category: 'thuthuat',   station: 'procedure',        role: 'bs',          devices: ['Slit lamp', 'Sterile needle'],              basePrice: 200000 },
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
  {
    code: 'PKG-2',
    name: 'Khám khúc xạ + thị giác hai mắt',
    description: 'Bao gồm gói cơ bản + TG2M + cyclo refraction (45-min wait + wet SBĐT).',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-TG2M', 'SVC-IOP', 'SVC-SLIT', 'SVC-CYCLO'],
    basePrice: 350000,
    pricingTiers: [],
    pricingRules: [],
    activatesEntitlement: null,
  },
  {
    code: 'PKG-3A',
    name: 'Khám CL Ortho-K (không OCT)',
    description: 'Khám fit ortho-K + 1 đôi lens. 3 tier theo lens. Activates entitlement 1 năm cho 5 services free unlimited.',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-IOP', 'SVC-SLIT', 'SVC-TOPO', 'SVC-CL-FIT'],
    basePrice: 0,
    pricingTiers: [
      { code: 'standard',   name: 'Standard',   extraServices: [], extraProductSku: 'OK-LENS-STD',  totalPrice: 15500000 },
      { code: 'toric',      name: 'Toric',      extraServices: [], extraProductSku: 'OK-LENS-TORIC', totalPrice: 18500000 },
      { code: 'customized', name: 'Customized', extraServices: [], extraProductSku: 'OK-LENS-CUST', totalPrice: 22500000 },
    ],
    pricingRules: [],
    activatesEntitlement: {
      durationMonths: 12,
      coveredServices: [
        { serviceCode: 'SVC-AUTOREF', maxUses: null },
        { serviceCode: 'SVC-REFRACT', maxUses: null },
        { serviceCode: 'SVC-SLIT',    maxUses: null },
        { serviceCode: 'SVC-TOPO',    maxUses: null },
        { serviceCode: 'SVC-CL-FIT',  maxUses: null },
      ],
    },
  },
  {
    code: 'PKG-3B',
    name: 'Khám CL Ortho-K (có OCT trước + sau)',
    description: 'Như PKG-3A + OCT bán phần trước + OCT bán phần sau. +600k khám phí so với PKG-3A.',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-IOP', 'SVC-SLIT', 'SVC-TOPO', 'SVC-CL-FIT', 'SVC-OCT-ANT', 'SVC-OCT-POST'],
    basePrice: 0,
    pricingTiers: [
      { code: 'standard',   name: 'Standard',   extraServices: [], extraProductSku: 'OK-LENS-STD',  totalPrice: 16100000 },
      { code: 'toric',      name: 'Toric',      extraServices: [], extraProductSku: 'OK-LENS-TORIC', totalPrice: 19100000 },
      { code: 'customized', name: 'Customized', extraServices: [], extraProductSku: 'OK-LENS-CUST', totalPrice: 23100000 },
    ],
    pricingRules: [],
    activatesEntitlement: {
      durationMonths: 12,
      coveredServices: [
        { serviceCode: 'SVC-AUTOREF', maxUses: null },
        { serviceCode: 'SVC-REFRACT', maxUses: null },
        { serviceCode: 'SVC-SLIT',    maxUses: null },
        { serviceCode: 'SVC-TOPO',    maxUses: null },
        { serviceCode: 'SVC-CL-FIT',  maxUses: null },
      ],
    },
  },
  {
    code: 'PKG-4',
    name: 'Tái khám CL (ortho-K + soft CL)',
    description: 'Tái khám sau fit. Giá tự động theo lịch sử BN: free khi entitlement còn, 350k nếu đã hết hạn, 600k nếu chưa từng có PKG-3.',
    bundledServices: ['SVC-AUTOREF', 'SVC-REFRACT', 'SVC-SLIT', 'SVC-TOPO'],
    basePrice: 600000,
    pricingTiers: [],
    pricingRules: [
      { condition: 'has-active-entitlement', sourcePackages: ['PKG-3A', 'PKG-3B'], price: 0 },
      { condition: 'has-expired-entitlement', sourcePackages: ['PKG-3A', 'PKG-3B'], price: 350000 },
      { condition: 'no-history',             sourcePackages: ['PKG-3A', 'PKG-3B'], price: 600000 },
    ],
    activatesEntitlement: null,
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
    station: s.station,
    role: s.role,
    devices: s.devices,
    basePrice: s.basePrice ?? 0,
    unit: 'lần',
    description: '',
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
