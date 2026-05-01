/**
 * Seed Thuốc + Kính catalogs from MAEC's 2026-05-01 price sheet.
 * Reconciled with "PK MA_Danh Sách Giá.xlsx" (Thuốc 31.12.2025 tab) on 2026-05-01.
 *
 * Run: railway run node scripts/seed-maec-thuoc-kinh.js
 */
require('../db')
const mongoose = require('mongoose')
const Thuoc = require('../models/Thuoc')
const Kinh = require('../models/Kinh')

const now = () => new Date().toISOString()

// Thuốc: 48 prior + 7 added 2026-05-01 from sheet = 55 items
const THUOC = [
  { code: 'TH-001', name: 'Thuốc uống Kid Visio',                 category: 'oral',     importPrice: 346000, sellPrice: 500000 },
  { code: 'TH-002', name: 'Myatro XL không chất bảo quản (0.05%)', category: 'drops',    importPrice: 122000, sellPrice: 240000, brand: 'Myatro' },
  { code: 'TH-003', name: 'Repadrop',                              category: 'drops',    importPrice: 325000, sellPrice: 450000 },
  { code: 'TH-004', name: 'Vigamox',                               category: 'drops',    importPrice:  91000, sellPrice: 110000 },
  { code: 'TH-005', name: 'Combigan',                              category: 'drops',    importPrice: 184000, sellPrice: 240000 },
  { code: 'TH-006', name: 'Maxitrol mỡ',                           category: 'drops',    importPrice:  53000, sellPrice:  65000 },
  { code: 'TH-007', name: 'Cravit 0.5%',                           category: 'drops',    importPrice:  89000, sellPrice: 100000 },
  { code: 'TH-008', name: 'Lotemax',                               category: 'drops',    importPrice: 200000, sellPrice: 265000 },
  { code: 'TH-009', name: 'Liposic',                               category: 'drops',    importPrice:  65000, sellPrice:  75000 },
  { code: 'TH-010', name: 'Restasis',                              category: 'drops',    importPrice: 580000, sellPrice: 650000 },
  { code: 'TH-011', name: 'Pataday',                               category: 'drops',    importPrice: 140000, sellPrice: 160000 },
  { code: 'TH-012', name: 'Relestat',                              category: 'drops',    importPrice:  82000, sellPrice: 100000 },
  { code: 'TH-013', name: 'Optive 15ml',                           category: 'drops',    importPrice:  93000, sellPrice: 120000 },
  { code: 'TH-014', name: 'Sanlein 0.1%',                          category: 'drops',    importPrice:  60000, sellPrice: 100000 },
  { code: 'TH-015', name: 'Sancoba',                               category: 'drops',    importPrice:  51000, sellPrice: 100000 },
  { code: 'TH-016', name: 'Diquas',                                category: 'drops',    importPrice: 130000, sellPrice: 145000 },
  { code: 'TH-017', name: 'Vismed',                                category: 'drops',    importPrice: 233000, sellPrice: 270000 },
  { code: 'TH-018', name: 'Ocuvite',                               category: 'oral',     importPrice: 370000, sellPrice: 600000 },
  { code: 'TH-019', name: 'Hydramed',                              category: 'drops',    importPrice: 170000, sellPrice: 280000 },
  { code: 'TH-020', name: 'Focumax',                               category: 'drops',    importPrice:      0, sellPrice: 280000 },
  { code: 'TH-021', name: 'Flumetholon 0.1%',                      category: 'drops',    importPrice:  33000, sellPrice:  70000 },
  { code: 'TH-022', name: 'Systane ultra tép',                     category: 'drops',    importPrice: 270000, sellPrice: 330000 },
  { code: 'TH-023', name: 'Natamycin',                             category: 'drops',    importPrice: 431000, sellPrice: 460000 },
  { code: 'TH-024', name: 'Tacliment',                             category: 'drops',    importPrice:  42000, sellPrice: 120000 },
  { code: 'TH-025', name: 'Oflovid mỡ',                            category: 'drops',    importPrice:  78000, sellPrice: 100000 },
  { code: 'TH-026', name: 'Tacrolimus',                            category: 'drops',    importPrice: 150000, sellPrice: 200000 },
  { code: 'TH-027', name: 'Cationorm',                             category: 'drops',    importPrice: 216000, sellPrice: 270000 },
  { code: 'TH-028', name: 'Thuốc uống Huvision',                   category: 'oral',     importPrice: 420000, sellPrice: 550000 },
  { code: 'TH-029', name: 'Atropin 0.01%',                         category: 'drops',    importPrice:  41000, sellPrice: 100000, brand: 'Atropin' },
  { code: 'TH-030', name: 'Atropine 0.05%',                        category: 'drops',    importPrice:  75000, sellPrice: 150000, brand: 'Atropine' },
  { code: 'TH-031', name: 'Atropin 0.05% (không chất bảo quản)',   category: 'drops',    importPrice: 130000, sellPrice: 280000, brand: 'Atropin' },
  { code: 'TH-032', name: 'Timolol Maleate',                       category: 'drops',    importPrice:  45000, sellPrice:  70000 },
  { code: 'TH-033', name: 'Chườm ấm Hàn Quốc',                     category: 'accessory', importPrice: 118000, sellPrice: 150000 },
  { code: 'TH-034', name: 'Alegysal',                              category: 'drops',    importPrice:      0, sellPrice: 100000 },
  { code: 'TH-035', name: 'Kary Uni',                              category: 'drops',    importPrice:      0, sellPrice:  70000 },
  { code: 'TH-036', name: 'Eyegel plus',                           category: 'drops',    importPrice: 107000, sellPrice: 150000 },
  { code: 'TH-037', name: 'Hycob',                                 category: 'drops',    importPrice: 133000, sellPrice: 230000 },
  { code: 'TH-038', name: 'Thuốc uống Visxi',                      category: 'oral',     importPrice: 105000, sellPrice: 200000 },
  { code: 'TH-039', name: 'Thuốc uống Gitalut',                    category: 'oral',     importPrice:  83000, sellPrice: 200000 },
  { code: 'TH-040', name: 'Vệ sinh bờ mi Tarsan',                  category: 'accessory', importPrice: 120000, sellPrice: 240000 },
  { code: 'TH-041', name: 'Vệ sinh bờ mi Blefavis',                category: 'accessory', importPrice: 420000, sellPrice: 500000 },
  { code: 'TH-042', name: 'Tobrex',                                category: 'drops',    importPrice:      0, sellPrice:  80000 },
  { code: 'TH-043', name: 'Myartro XL (0.05%)',                    category: 'drops',    importPrice:  85000, sellPrice: 150000, brand: 'Myartro' },
  { code: 'TH-044', name: 'Optive UD',                             category: 'drops',    importPrice: 187000, sellPrice: 220000 },
  { code: 'TH-045', name: 'Pred Forte 1%',                         category: 'drops',    importPrice:      0, sellPrice:  70000 },
  { code: 'TH-046', name: 'Nước muối dạng tép',                    category: 'drops',    importPrice: 120000, sellPrice: 140000 },
  { code: 'TH-047', name: 'Bịt mắt Nexcare size nhỏ',              category: 'accessory', importPrice:      0, sellPrice: 150000, brand: 'Nexcare' },
  { code: 'TH-048', name: 'Bịt mắt Nexcare size lớn',              category: 'accessory', importPrice:      0, sellPrice: 180000, brand: 'Nexcare' },
  // Added 2026-05-01 from sheet "Thuốc (31.12.2025)"
  { code: 'TH-049', name: 'Cravit 1.5',                            category: 'drops',    importPrice:      0, sellPrice:      0, brand: 'Cravit' },
  { code: 'TH-050', name: 'Ocudry',                                category: 'drops',    importPrice:      0, sellPrice: 280000 },
  { code: 'TH-051', name: 'Intense Relief',                        category: 'drops',    importPrice: 252000, sellPrice: 490000 },
  { code: 'TH-052', name: 'Lumix 0.3',                             category: 'drops',    importPrice:  80000, sellPrice: 170000 },
  { code: 'TH-053', name: 'Atropin 0.025% (không chất bảo quản)',  category: 'drops',    importPrice: 120000, sellPrice: 250000, brand: 'Atropin' },
  { code: 'TH-054', name: 'Atropin 0.5% (liệt điều tiết)',         category: 'drops',    importPrice:  40000, sellPrice: 100000, brand: 'Atropin' },
  { code: 'TH-055', name: 'Eyemed',                                category: 'drops',    importPrice: 120000, sellPrice: 280000 },
]

// Kính: 15 prior + 2 added 2026-05-01 from sheet = 17 items
const KINH = [
  { code: 'KN-001', name: 'Comfort Shield SD',                category: 'phu-kien', importPrice: 168000, sellPrice: 250000 },
  { code: 'KN-002', name: 'Avizor Lacrifresh Comfort',        category: 'phu-kien', importPrice: 120000, sellPrice: 200000, brand: 'Avizor' },
  { code: 'KN-003', name: 'Comfort Shield MSD',               category: 'phu-kien', importPrice: 198000, sellPrice: 310000 },
  { code: 'KN-004', name: 'Dụng cụ lấy kính SEED/Fargo/GOV',  category: 'phu-kien', importPrice:  60000, sellPrice: 100000 },
  { code: 'KN-005', name: 'Nước rửa kính gọng',               category: 'phu-kien', importPrice:  10000, sellPrice:  20000 },
  { code: 'KN-006', name: 'Dụng cụ lấy kính củng mạc',        category: 'phu-kien', importPrice: 150000, sellPrice: 200000 },
  { code: 'KN-007', name: 'Máy rửa lens Fargo',               category: 'phu-kien', importPrice: 900000, sellPrice: 1500000, brand: 'Fargo' },
  { code: 'KN-008', name: 'Nước rửa kính Avizor Ever Clean',  category: 'phu-kien', importPrice: 280000, sellPrice: 420000, brand: 'Avizor' },
  { code: 'KN-009', name: 'Nước rửa kính BioClen Moist',      category: 'phu-kien', importPrice:      0, sellPrice: 450000, brand: 'BioClen' },
  { code: 'KN-010', name: 'Nước rửa kính AOSept Plus',        category: 'phu-kien', importPrice:      0, sellPrice: 450000, brand: 'AOSept' },
  { code: 'KN-011', name: 'Nước rửa kính GP 450ml',           category: 'phu-kien', importPrice: 220000, sellPrice: 350000, spec: '450ml' },
  { code: 'KN-012', name: 'Nước rửa kính Menicare 250ml',     category: 'phu-kien', importPrice: 275000, sellPrice: 350000, brand: 'Menicare', spec: '250ml' },
  { code: 'KN-013', name: 'Nước rửa kính mềm to',             category: 'phu-kien', importPrice: 125000, sellPrice: 200000 },
  { code: 'KN-014', name: 'Vệ sinh kính',                     category: 'phu-kien', importPrice:  60000, sellPrice: 150000 },
  { code: 'KN-015', name: 'Kính tiếp xúc 2 tuần',             category: 'ktx',      importPrice:  70000, sellPrice: 100000, spec: '2 tuần' },
  // Added 2026-05-01 from sheet "Thuốc (31.12.2025)"
  { code: 'KN-016', name: 'Avizor Lacrifresh tép',            category: 'phu-kien', importPrice:      0, sellPrice: 180000, brand: 'Avizor' },
  { code: 'KN-017', name: 'Nước rửa kính mềm nhỏ',            category: 'phu-kien', importPrice:      0, sellPrice: 100000 },
]

async function seed() {
  console.log('Seeding Thuốc + Kính catalogs...')

  await Thuoc.deleteMany({})
  await Thuoc.insertMany(THUOC.map(t => ({
    _id: t.code,
    code: t.code,
    name: t.name,
    category: t.category,
    brand: t.brand || '',
    spec: t.spec || '',
    importPrice: t.importPrice || 0,
    sellPrice: t.sellPrice || 0,
    needsRx: t.category === 'drops' || t.category === 'oral',
    description: '',
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  })))
  console.log(`  ✓ Thuốc: ${THUOC.length} (drops/oral/accessory)`)

  // Only manage legacy KN-NNN codes here; KN-G-* (frames) and KN-T-* / KN-A-*
  // (lenses + new accessories) are owned by seed-maec-gong.js / seed-maec-trong.js.
  await Kinh.deleteMany({ code: /^KN-\d{3}$/ })
  await Kinh.insertMany(KINH.map(k => ({
    _id: k.code,
    code: k.code,
    name: k.name,
    category: k.category,
    brand: k.brand || '',
    spec: k.spec || '',
    importPrice: k.importPrice || 0,
    sellPrice: k.sellPrice || 0,
    description: '',
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  })))
  console.log(`  ✓ Kính: ${KINH.length} (phụ-kiện + KTX)`)

  console.log('Seed complete.')
  await mongoose.connection.close()
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
