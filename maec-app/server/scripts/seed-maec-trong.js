/**
 * Seed Tròng kính (lenses) catalog from "PK MA_Danh Sách Giá.xlsx"
 *   - "Tròng kính Seed" tab (SEED supplier — soft CL, rigid CL, Ortho-K, supplies)
 *   - "Tròng kính Orthok" tab (CTY TNHH Công nghệ Kiểm soát Cận thị — Ortho-K + supplies)
 *
 * Two sets of items:
 *   KN-T-* (category=ktx)    — contact lenses (soft CL, rigid CL, Ortho-K)
 *   KN-A-* (category=phu-kien) — lens-related accessories not in original Thuốc 31.12.2025 sheet
 *
 * sellPrice = 0 placeholder where MAEC retail isn't set in the sheet.
 *
 * Idempotent: deletes only KN-T-* and KN-A-* rows; safe to re-run.
 *
 * Run: railway run node scripts/seed-maec-trong.js
 */
require('../db')
const mongoose = require('mongoose')
const Kinh = require('../models/Kinh')

const now = () => new Date().toISOString()

// Soft + rigid CL + Ortho-K (category=ktx)
const TRONG = [
  // — Soft CL (SEED 1day series) —
  { code: 'KN-T-001', name: 'SEED 1dayPure Moisture (cận -0.50→-12.00D)',         brand: 'SEED', spec: 'Hộp/32 miếng', importPrice: 440000, sellPrice: 704000 },
  { code: 'KN-T-002', name: 'SEED 1dayPure Moisture (extended ±, viễn cao, cận cao)', brand: 'SEED', spec: 'Hộp/32 miếng', importPrice: 530000, sellPrice: 840000 },
  { code: 'KN-T-003', name: 'SEED 1dayPure Moisture for Astigmatism',              brand: 'SEED', spec: 'Hộp/32 miếng', importPrice: 660000, sellPrice: 950000 },
  { code: 'KN-T-004', name: 'SEED 1dayPure Moisture Multistage',                   brand: 'SEED', spec: 'Hộp/32 miếng', importPrice: 682000, sellPrice: 950000 },
  { code: 'KN-T-005', name: 'SEED 1dayPure EDOF (lão thị)',                        brand: 'SEED', spec: 'Hộp/32 miếng', importPrice: 780000, sellPrice: 1300000 },
  { code: 'KN-T-006', name: 'SEED 1day Silfa (silicone hydrogel)',                 brand: 'SEED', spec: 'Hộp/32 miếng', importPrice: 580000, sellPrice: 950000 },
  { code: 'KN-T-007', name: 'Eye coffret 1day UV 10P (KAT mềm có màu)',            brand: 'SEED', spec: 'Hộp/10 miếng', importPrice: 198000, sellPrice: 340000 },

  // — Soft CL (SEED 2week / monthly) —
  { code: 'KN-T-008', name: 'SEED 2weekPure UP (cận -0.50→-12.00D)',               brand: 'SEED', spec: 'Hộp/6 miếng',  importPrice: 310200, sellPrice: 420000 },
  { code: 'KN-T-009', name: 'SEED 2weekPure UP (extended ±, viễn, cận cao)',       brand: 'SEED', spec: 'Hộp/6 miếng',  importPrice: 396000, sellPrice: 620000 },
  { code: 'KN-T-010', name: 'SEED 2weekPure UP (extended high — viễn cao, cận rất cao)', brand: 'SEED', spec: 'Hộp/6 miếng', importPrice: 650000, sellPrice: 840000 },
  { code: 'KN-T-011', name: 'SEED 2weekPure UP for Astigmatism',                   brand: 'SEED', spec: 'Hộp/6 miếng',  importPrice: 420000, sellPrice: 600000 },
  { code: 'KN-T-012', name: 'SEED 2weekPure UP Multistage',                        brand: 'SEED', spec: 'Hộp/6 miếng',  importPrice: 420000, sellPrice: 600000 },
  { code: 'KN-T-013', name: 'SEED MonthlyPure',                                    brand: 'SEED', spec: 'Hộp/3 miếng',  importPrice: 165000, sellPrice: 264000 },
  { code: 'KN-T-014', name: 'SEED MonthlyFine UV',                                 brand: 'SEED', spec: 'Hộp/3 miếng',  importPrice: 155100, sellPrice: 264000 },

  // — Rigid CL + cosmetic soft (retail TBD with MAEC) —
  { code: 'KN-T-015', name: 'SEED UV-1 (KAT cứng)',                                brand: 'SEED', spec: 'Chiếc',        importPrice: 2530000, sellPrice: 0 },
  { code: 'KN-T-016', name: 'SEED KC lens (KAT cứng)',                             brand: 'SEED', spec: 'Chiếc',        importPrice: 2530000, sellPrice: 0 },
  { code: 'KN-T-017', name: 'AS-LUNA (KAT cứng)',                                  brand: 'AS',   spec: 'Chiếc',        importPrice: 3080000, sellPrice: 0 },
  { code: 'KN-T-018', name: 'IRIS lens (KAT mềm thẩm mỹ + chỉnh khúc xạ)',         brand: 'IRIS', spec: 'Chiếc',        importPrice: 4200000, sellPrice: 0 },

  // — Ortho-K from SEED (Breath-O Correct family) — retail set by PKG-3A/3B tiers —
  { code: 'KN-T-019', name: 'Breath-O Correct (Ortho-K Standard)',                 brand: 'SEED', spec: 'Chiếc',        importPrice: 2800000, sellPrice: 0 },
  { code: 'KN-T-020', name: 'Breath-O Correct HD (Ortho-K)',                       brand: 'SEED', spec: 'Chiếc',        importPrice: 3000000, sellPrice: 0 },
  { code: 'KN-T-021', name: 'Breath-O Correct TD (Ortho-K)',                       brand: 'SEED', spec: 'Chiếc',        importPrice: 3300000, sellPrice: 0 },

  // — Ortho-K from CTY TNHH Công nghệ Kiểm soát Cận thị — retail set by PKG-3A/3B tiers —
  { code: 'KN-T-022', name: 'Tròng Ortho-K Standard (M17/S23/P24/Euclid family)',  brand: 'KSCT', spec: 'Chiếc',        importPrice: 2600000, sellPrice: 0 },
  { code: 'KN-T-023', name: 'Tròng Ortho-K Toric (loạn thị)',                      brand: 'KSCT', spec: 'Chiếc',        importPrice: 3850000, sellPrice: 0 },
  { code: 'KN-T-024', name: 'Tròng Ortho-K X Toric (loạn thị nâng cao)',           brand: 'KSCT', spec: 'Chiếc',        importPrice: 3850000, sellPrice: 0 },
  { code: 'KN-T-025', name: 'Tròng Ortho-K Premium',                               brand: 'KSCT', spec: 'Chiếc',        importPrice: 3850000, sellPrice: 0 },
  { code: 'KN-T-026', name: 'Tròng Ortho-K Toric SP-D2/0 / SP-D3/0',               brand: 'KSCT', spec: 'Chiếc',        importPrice: 3000000, sellPrice: 0 },
  { code: 'KN-T-027', name: 'Tròng Ortho-K 84-550 (series)',                       brand: 'KSCT', spec: 'Chiếc',        importPrice: 2000000, sellPrice: 0 },
]

// Lens-related accessories from Seed + Orthok sheets that aren't in the
// original "Thuốc 31.12.2025" snapshot (which already covered the basics —
// those live as KN-001..KN-017 from seed-maec-thuoc-kinh.js).
const ACCESSORY = [
  // — Solutions —
  { code: 'KN-A-001', name: 'Forest Leaf EX (chai 360ml)',                         brand: 'Forest Leaf', spec: '360ml', importPrice: 118000, sellPrice: 175000 },
  { code: 'KN-A-002', name: 'Forest Leaf EX (chai 100ml)',                         brand: 'Forest Leaf', spec: '100ml', importPrice:  50000, sellPrice:  70000 },
  { code: 'KN-A-003', name: 'Hidro Health H2O2 (KAT cứng)',                        brand: 'Hidro Health', spec: '360ml', importPrice: 320000, sellPrice: 390000 },
  { code: 'KN-A-004', name: 'Avizor GP multi (rửa kính cứng)',                     brand: 'Avizor', spec: '240ml', importPrice: 200000, sellPrice: 0 },

  // — Removal sticks (3 origin variants) —
  { code: 'KN-A-005', name: 'Que gắp kính (Vietnam)',                              brand: '',     spec: '',             importPrice:  25000, sellPrice: 0 },
  { code: 'KN-A-006', name: 'Que gắp kính (Japan)',                                brand: '',     spec: '',             importPrice:  50000, sellPrice: 0 },
  { code: 'KN-A-007', name: 'Que gắp kính DMV (USA)',                              brand: 'DMV',  spec: '',             importPrice:  80000, sellPrice: 0 },
  { code: 'KN-A-008', name: 'Que gắp kính DMV thẳng không lỗ',                     brand: 'DMV',  spec: '',             importPrice:  70000, sellPrice: 0 },

  // — Storage / pouch —
  { code: 'KN-A-009', name: 'Túi đựng kính (phụ kiện)',                            brand: '',     spec: '',             importPrice:  80000, sellPrice: 0 },
  { code: 'KN-A-010', name: 'Khay đựng kính áp tròng',                             brand: '',     spec: '',             importPrice:   3000, sellPrice: 0 },
  { code: 'KN-A-011', name: 'Lọ ngâm kính cứng (Japan)',                           brand: '',     spec: '',             importPrice:  50000, sellPrice: 0 },
]

async function seed() {
  console.log('Seeding Tròng kính + accessories catalog...')

  await Kinh.deleteMany({ code: /^KN-T-/ })
  await Kinh.insertMany(TRONG.map(t => ({
    _id: t.code,
    code: t.code,
    name: t.name,
    category: 'ktx',
    brand: t.brand || '',
    spec: t.spec || '',
    importPrice: t.importPrice,
    sellPrice: t.sellPrice,
    description: '',
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  })))
  const softCount = TRONG.filter(t => t.code <= 'KN-T-014').length
  const rigidCount = TRONG.filter(t => t.code >= 'KN-T-015' && t.code <= 'KN-T-018').length
  const okCount = TRONG.filter(t => t.code >= 'KN-T-019').length
  console.log(`  ✓ Tròng kính: ${TRONG.length} (soft CL ${softCount} + rigid/cosmetic ${rigidCount} + Ortho-K ${okCount})`)

  await Kinh.deleteMany({ code: /^KN-A-/ })
  await Kinh.insertMany(ACCESSORY.map(a => ({
    _id: a.code,
    code: a.code,
    name: a.name,
    category: 'phu-kien',
    brand: a.brand || '',
    spec: a.spec || '',
    importPrice: a.importPrice,
    sellPrice: a.sellPrice,
    description: '',
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  })))
  console.log(`  ✓ Phụ kiện kính (mới): ${ACCESSORY.length}`)

  console.log('Seed complete.')
  await mongoose.connection.close()
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
