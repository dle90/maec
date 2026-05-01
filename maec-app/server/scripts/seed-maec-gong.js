/**
 * Seed Gọng kính (frames) catalog from "PK MA_Danh Sách Giá.xlsx"
 * → "Gọng kính - HĐ mua 101" tab.
 *
 * 87 unique SKUs across 2 supplier invoices from 101 Eyewear:
 *   - HĐ 00003278 (25/03/2026)
 *   - HĐ 00004015 (08/04/2026)
 *
 * importPrice already includes 8% VAT.
 * sellPrice = 0 placeholder until MAEC sets the retail markup rule.
 *
 * Idempotent: deletes only KN-G-* rows, then re-inserts. Safe to re-run
 * without affecting other Kinh categories (phu-kien / ktx / trong).
 *
 * Run: railway run node scripts/seed-maec-gong.js
 *      (or: MONGODB_URI=... node scripts/seed-maec-gong.js)
 */
require('../db')
const mongoose = require('mongoose')
const Kinh = require('../models/Kinh')

const now = () => new Date().toISOString()

const GONG = [
  { code: 'KN-G-001', name: 'NEW BALANCE NB09093 C01G 49',  brand: 'NEW BALANCE',  importPrice:  981818 },
  { code: 'KN-G-002', name: 'NEW BALANCE NB09093 C02G 49',  brand: 'NEW BALANCE',  importPrice:  981818 },
  { code: 'KN-G-003', name: 'NEW BALANCE NB09093 C04G 49',  brand: 'NEW BALANCE',  importPrice:  981818 },
  { code: 'KN-G-004', name: 'NEW BALANCE NB09370 C01 49',   brand: 'NEW BALANCE',  importPrice:  981818 },
  { code: 'KN-G-005', name: 'NEW BALANCE NB09378X',         brand: 'NEW BALANCE',  importPrice:  834545 },
  { code: 'KN-G-006', name: 'NEW BALANCE NB09379X',         brand: 'NEW BALANCE',  importPrice:  834545 },
  { code: 'KN-G-007', name: 'NEW BALANCE NB09381X',         brand: 'NEW BALANCE',  importPrice:  736363 },
  { code: 'KN-G-008', name: 'NEW BALANCE NBJ09403 C03 49',  brand: 'NEW BALANCE',  importPrice: 1178182 },
  { code: 'KN-G-009', name: 'NEW BALANCE NBJ09436 C01 49',  brand: 'NEW BALANCE',  importPrice:  981818 },
  { code: 'KN-G-010', name: 'NEW BALANCE NBJ09436 C02 49',  brand: 'NEW BALANCE',  importPrice:  981818 },
  { code: 'KN-G-011', name: 'NEW BALANCE NBJ09436 C04 49',  brand: 'NEW BALANCE',  importPrice:  981818 },
  { code: 'KN-G-012', name: 'NEW BALANCE NBJ09437 C01 49',  brand: 'NEW BALANCE',  importPrice:  981818 },
  { code: 'KN-G-013', name: 'NEW BALANCE NBJ09437 C03 49',  brand: 'NEW BALANCE',  importPrice:  981818 },
  { code: 'KN-G-014', name: 'NEW BALANCE NBJ09437 C04 49',  brand: 'NEW BALANCE',  importPrice:  981818 },
  { code: 'KN-G-015', name: 'NEW BALANCE NBJ09438 C01 51',  brand: 'NEW BALANCE',  importPrice:  981818 },
  { code: 'KN-G-016', name: 'PARIM 52309 C1 51',            brand: 'PARIM',        importPrice:  579273 },
  { code: 'KN-G-017', name: 'PARIM 52316 P1 49',            brand: 'PARIM',        importPrice:  579273 },
  { code: 'KN-G-018', name: 'PARIM 52316 V1 49',            brand: 'PARIM',        importPrice:  579273 },
  { code: 'KN-G-019', name: 'PARIM 52318 G1 51',            brand: 'PARIM',        importPrice:  579273 },
  { code: 'KN-G-020', name: 'PARIM 52321 B1 51',            brand: 'PARIM',        importPrice:  579273 },
  { code: 'KN-G-021', name: 'PARIM 53002 B1 52',            brand: 'PARIM',        importPrice:  579273 },
  { code: 'KN-G-022', name: 'PARIM K3004 P2 50',            brand: 'PARIM',        importPrice:  530182 },
  { code: 'KN-G-023', name: 'PARIM K3004 W1 50',            brand: 'PARIM',        importPrice:  530182 },
  { code: 'KN-G-024', name: 'PARIM PR52211 C1 51',          brand: 'PARIM',        importPrice:  515455 },
  { code: 'KN-G-025', name: 'PARIM PR52211 S1 51',          brand: 'PARIM',        importPrice:  515455 },
  { code: 'KN-G-026', name: 'PARIM PR52212 B1 50',          brand: 'PARIM',        importPrice:  515455 },
  { code: 'KN-G-027', name: 'PARIM PR52212 P1 50',          brand: 'PARIM',        importPrice:  515455 },
  { code: 'KN-G-028', name: 'PARIM PR52312 P1 51',          brand: 'PARIM',        importPrice:  515455 },
  { code: 'KN-G-029', name: 'PARIM PR7731',                 brand: 'PARIM',        importPrice:  515455 },
  { code: 'KN-G-030', name: 'PARIM PR7738',                 brand: 'PARIM',        importPrice:  515455 },
  { code: 'KN-G-031', name: 'EXFASH EF308004 C02 48 (trẻ em)', brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-032', name: 'EXFASH EF308004 C11 48 (trẻ em)', brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-033', name: 'EXFASH EF31442 C11 45 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-034', name: 'EXFASH EF31443 C01 50 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-035', name: 'EXFASH EF31443 C03 50 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-036', name: 'EXFASH EF31443 C11 50 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-037', name: 'EXFASH EF31444 C08 51 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-038', name: 'EXFASH EF31444 C11 51 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-039', name: 'EXFASH EF38025 C02 46 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-040', name: 'EXFASH EF38025 C11 46 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-041', name: 'EXFASH EF38026 C11 47 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-042', name: 'EXFASH EF38026 C16 47 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-043', name: 'EXFASH EF38027 C02 43 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-044', name: 'EXFASH EF38027 C11 43 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-045', name: 'EXFASH EF38027 C14 43 (trẻ em)',  brand: 'EXFASH',    importPrice:  255273 },
  { code: 'KN-G-046', name: 'EXFASH EF42443 (trẻ em)',         brand: 'EXFASH',    importPrice:  225818 },
  { code: 'KN-G-047', name: 'EXFASH EF45404 C01 51',           brand: 'EXFASH',    importPrice:  333818 },
  { code: 'KN-G-048', name: 'EXFASH EF45404 C08 51',           brand: 'EXFASH',    importPrice:  333818 },
  { code: 'KN-G-049', name: 'EXFASH EF45406 C13 47',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-050', name: 'EXFASH EF45406 C42 47',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-051', name: 'EXFASH EF45406 C46 47',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-052', name: 'EXFASH EF45406 C49 47',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-053', name: 'EXFASH EF45408 C13 50',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-054', name: 'EXFASH EF45408 C42 50',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-055', name: 'EXFASH EF45408 C46 50',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-056', name: 'EXFASH EF45408 C49 50',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-057', name: 'EXFASH EF45409 C46 48',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-058', name: 'EXFASH EF45409 C48 48',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-059', name: 'EXFASH EF45409 C49 48',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-060', name: 'EXFASH EF45440 C44 49',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-061', name: 'EXFASH EF45440 C46 49',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-062', name: 'EXFASH EF45440 C49 49',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-063', name: 'EXFASH EF45440 C50 49',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-064', name: 'EXFASH EF45441 C46 46',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-065', name: 'EXFASH EF45441 C50 46',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-066', name: 'EXFASH EF45443 C42 42',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-067', name: 'EXFASH EF45443 C44 42',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-068', name: 'EXFASH EF45443 C46 42',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-069', name: 'EXFASH EF45443 C50 42',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-070', name: 'EXFASH EF45444 C46 45',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-071', name: 'EXFASH EF45444 C49 45',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-072', name: 'EXFASH EF45444 C50 45',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-073', name: 'EXFASH EF45445 C13 48',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-074', name: 'EXFASH EF45445 C43 48',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-075', name: 'EXFASH EF45445 C46 48',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-076', name: 'EXFASH EF45445 C50 48',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-077', name: 'EXFASH EF45446 C50 48',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-078', name: 'EXFASH EF45447 C44 49',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-079', name: 'EXFASH EF45447 C46 49',           brand: 'EXFASH',    importPrice:  314182 },
  { code: 'KN-G-080', name: 'EXFASH EF60141',                  brand: 'EXFASH',    importPrice:  333818 },
  { code: 'KN-G-081', name: 'EXFASH EF92426 038 46',           brand: 'EXFASH',    importPrice:  225818 },
  { code: 'KN-G-082', name: 'EXFASH EF92426 361 46',           brand: 'EXFASH',    importPrice:  225818 },
  { code: 'KN-G-083', name: 'EXFASH EF92426 678 46',           brand: 'EXFASH',    importPrice:  225818 },
  { code: 'KN-G-084', name: 'EXFASH EF92426 681 46',           brand: 'EXFASH',    importPrice:  225818 },
  { code: 'KN-G-085', name: 'EXFASH EF94440 001 43',           brand: 'EXFASH',    importPrice:  235637 },
  { code: 'KN-G-086', name: 'EXFASH EF94442 001 47',           brand: 'EXFASH',    importPrice:  235637 },
  { code: 'KN-G-087', name: 'HELEN KELLER H26124',             brand: 'HELEN KELLER', importPrice: 594000 },
]

async function seed() {
  console.log('Seeding Gọng kính catalog...')

  await Kinh.deleteMany({ code: /^KN-G-/ })
  await Kinh.insertMany(GONG.map(g => ({
    _id: g.code,
    code: g.code,
    name: g.name,
    category: 'gong',
    brand: g.brand,
    spec: '',
    importPrice: g.importPrice,
    sellPrice: 0, // placeholder until MAEC sets retail markup
    description: '',
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  })))
  console.log(`  ✓ Gọng kính: ${GONG.length} (NEW BALANCE 15 + PARIM 15 + EXFASH 56 + HELEN KELLER 1)`)

  console.log('Seed complete.')
  await mongoose.connection.close()
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
