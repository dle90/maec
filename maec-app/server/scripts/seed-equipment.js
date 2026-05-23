/**
 * Seed the Equipment collection with:
 *  - 10 new units from 3 vendor docs (Nam Hưng HD2636, Y Tế Mỹ Medmont Pro,
 *    IKACHI IKAChart quote) → Kim Giang.
 *  - 5 already-owned units from CLAUDE.md's imaging device map → Trung Kính
 *    (purchase fields blank, status='active', notes flag for review).
 *
 *   node scripts/seed-equipment.js --dry-run
 *   railway run node scripts/seed-equipment.js
 *
 * Idempotent — fixed _ids (TB-001..TB-015), re-run upserts.
 */
const DRY = process.argv.includes('--dry-run')
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const STAMP = '2026-05-23T00:00:00.000Z'
const NOTE_EXISTING = 'Thiết bị hiện hữu (đã sở hữu trước) — bổ sung thông tin mua/serial khi có.'

// ── New units from contracts/quotes (all Kim Giang) ──────────────────────
// All Vietnam Đồng prices, inclusive notes — see source docs in equipments/.

// Nam Hưng (HD2636/NH-MA, signed 2026-03-25, delivery 562 Kim Giang)
const NH_VENDOR = {
  vendorCompany: 'Công ty TNHH Thiết bị Y tế Nam Hưng',
  vendorTaxCode: '0104219195',
  vendorAddress: 'Tầng 6 toà nhà Zen Tower số 12 đường Khuất Duy Tiến, Phường Thanh Xuân, Hà Nội',
  contractNumber: 'HD2636/NH-MA',
  contractDate: '2026-03-25',
  // Phase-1 advance paid on signing; delivery 45-60 working days afterward.
  // Leaving commissionedAt/purchaseDate blank — fill in when handover happens.
}

const newUnits = [
  // 1. Auto-lensometer + PD (Potec PLM-8000PD)
  {
    code: 'TB-001', name: 'Máy chấm tâm kèm đo số kính tự động',
    nameEn: 'Auto-lensmeter with PD measurement',
    category: 'lensometer', model: 'PLM-8000PD',
    manufacturer: 'Potec Co., Ltd.', originCountry: 'Hàn Quốc',
    siteId: 'KG', location: 'Phòng kính',
    status: 'commissioning',
    unitPriceVnd: 47_150_000, vatAmountVnd: 3_772_000, totalPriceVnd: 50_922_000,
    warrantyMonths: 12,
    accessoriesIncluded: '01 máy chính, 01 giá đỡ kính áp tròng, 01 hộp mực màu, 01 bạt phủ bụi, 01 dây nguồn, 01 HDSD',
    serviceCodes: [], notes: '', ...NH_VENDOR,
  },
  // 2. Slit lamp white (Keeler KSL-H5-Dr)
  {
    code: 'TB-002', name: 'Sinh hiển vi khám mắt (TRẮNG)',
    nameEn: 'Slit lamp (white) with digital camera',
    category: 'slit-lamp', model: 'KSL-H5-Dr (code: 3020-P-2151)',
    manufacturer: 'Keeler Ltd.', originCountry: 'Anh',
    siteId: 'KG', location: 'Phòng khám',
    status: 'commissioning',
    unitPriceVnd: 282_860_000, vatAmountVnd: 14_143_000, totalPriceVnd: 297_003_000,
    warrantyMonths: 12, warrantyNote: 'không bao gồm bóng đèn',
    accessoriesIncluded: 'Máy chính, cần điều khiển có nút bấm camera, camera kỹ thuật số, gương phản xạ, bạt phủ bụi, cable, HDSD Anh-Việt',
    serviceCodes: ['SVC-SLIT', 'SVC-BIO'], notes: '', ...NH_VENDOR,
  },
  // 3. Auto-refractor + keratometer (Potec PRK-9000)
  {
    code: 'TB-003', name: 'Máy đo khúc xạ kèm độ cong giác mạc',
    nameEn: 'Auto-refractor with keratometer',
    category: 'auto-ref', model: 'PRK-9000',
    manufacturer: 'Potec Co., Ltd.', originCountry: 'Hàn Quốc',
    registrationNumber: '250004308/PCBB-HN',
    siteId: 'KG', location: 'Phòng khúc xạ',
    status: 'commissioning',
    unitPriceVnd: 164_760_000, vatAmountVnd: 8_238_000, totalPriceVnd: 172_998_000,
    warrantyMonths: 12,
    accessoriesIncluded: 'Máy chính, mắt thử chuẩn, máy in nhiệt tích hợp, giấy in, bạt phủ bụi, HDSD Anh-Việt, chân bàn điện (TQ)',
    serviceCodes: ['SVC-AUTOREF'], notes: '', ...NH_VENDOR,
  },
  // 4. Slit-lamp table (Weizhen C-280)
  {
    code: 'TB-004', name: 'Bàn khám sinh hiển vi',
    nameEn: 'Slit-lamp examination table',
    category: 'slit-lamp-table', model: 'C-280',
    manufacturer: 'Zhejiang Weizhen Medical Technology Co., Ltd.', originCountry: 'Trung Quốc',
    siteId: 'KG', location: 'Phòng khám',
    status: 'commissioning',
    unitPriceVnd: 19_800_000, vatAmountVnd: 1_584_000, totalPriceVnd: 21_384_000,
    warrantyMonths: 12,
    serviceCodes: [], notes: '', ...NH_VENDOR,
  },
  // 5. Eye-exam table+chair set (Ningbo Mingsing TCS-880) — 2 units, separate rows
  {
    code: 'TB-005', name: 'Bộ bàn ghế khám mắt #1',
    nameEn: 'Eye-exam table+chair set #1',
    category: 'exam-table-chair-set', model: 'TCS-880',
    manufacturer: 'Ningbo Mingsing Optical R&D Co., Ltd.', originCountry: 'Trung Quốc',
    siteId: 'KG', location: 'Phòng khám',
    status: 'commissioning',
    unitPriceVnd: 64_800_000, vatAmountVnd: 5_184_000, totalPriceVnd: 69_984_000,
    warrantyMonths: 12,
    serviceCodes: [], notes: 'HD2636 mục 5 — số lượng 2 (TB-005 + TB-006). Tổng 2 bộ: 139.968.000 VNĐ.', ...NH_VENDOR,
  },
  {
    code: 'TB-006', name: 'Bộ bàn ghế khám mắt #2',
    nameEn: 'Eye-exam table+chair set #2',
    category: 'exam-table-chair-set', model: 'TCS-880',
    manufacturer: 'Ningbo Mingsing Optical R&D Co., Ltd.', originCountry: 'Trung Quốc',
    siteId: 'KG', location: 'Phòng khám',
    status: 'commissioning',
    unitPriceVnd: 64_800_000, vatAmountVnd: 5_184_000, totalPriceVnd: 69_984_000,
    warrantyMonths: 12,
    serviceCodes: [], notes: 'HD2636 mục 5 — số lượng 2 (TB-005 + TB-006). Tổng 2 bộ: 139.968.000 VNĐ.', ...NH_VENDOR,
  },
  // 6. Patient exam chair (Ningbo Mingsing NT-80)
  {
    code: 'TB-007', name: 'Ghế khám bệnh nhân',
    nameEn: 'Patient exam chair',
    category: 'exam-chair', model: 'NT-80',
    manufacturer: 'Ningbo Mingsing Optical R&D Co., Ltd.', originCountry: 'Trung Quốc',
    siteId: 'KG', location: 'Phòng khám',
    status: 'commissioning',
    unitPriceVnd: 11_000_000, vatAmountVnd: 880_000, totalPriceVnd: 11_880_000,
    warrantyMonths: 12,
    serviceCodes: [], notes: '', ...NH_VENDOR,
  },

  // 7. Medmont Pro topographer (Y Tế Mỹ contract, draft 2026)
  {
    code: 'TB-008', name: 'Máy chụp bản đồ giác mạc Medmont Pro',
    nameEn: 'Corneal topographer (Medmont Professional)',
    category: 'topographer', model: 'Professional',
    manufacturer: 'Medmont International Pty Ltd.', originCountry: 'Úc',
    siteId: 'KG', location: 'Phòng đo bản đồ giác mạc',
    status: 'commissioning',
    unitPriceVnd: 540_000_000, vatAmountVnd: 0, totalPriceVnd: 425_000_000,
    discountVnd: 115_000_000,
    warrantyMonths: 12,
    accessoriesIncluded: 'Chân bàn điện, phụ kiện đi kèm; tặng kèm 01 laptop (không thu tiền)',
    serviceCodes: ['SVC-TOPO', 'SVC-DRYEYE'],
    vendorCompany: 'Công ty TNHH Xuất Nhập Khẩu Thiết Bị Y Tế Mỹ',
    vendorTaxCode: '0313759613',
    vendorAddress: '535 An Dương Vương, Phường An Đông, TP. Hồ Chí Minh',
    contractNumber: 'HĐMB/YTM-MINHANH (draft)',
    contractDate: '2026-05-18',
    notes: 'Giá đã bao gồm thuế GTGT 5%. Đợt 1 (215M) ngay khi ký, Đợt 2 (210M) trong 7 ngày làm việc sau bàn giao.',
  },

  // 8-10. IKACHART VA chart system × 3 (IKACHI quote)
  ...['TB-009', 'TB-010', 'TB-011'].map((code, i) => ({
    code, name: `Bảng thị lực kỹ thuật số IKAChart #${i + 1}`,
    nameEn: `Digital visual acuity chart system (IKAChart) #${i + 1}`,
    category: 'va-chart', model: 'IKAChart (24" monitor + processor + remote)',
    manufacturer: 'IKACHI', originCountry: 'Việt Nam',
    siteId: 'KG', location: 'Phòng khám',
    status: 'commissioning',
    unitPriceVnd: 22_000_000, vatAmountVnd: 0, totalPriceVnd: 22_000_000,
    warrantyMonths: 12, warrantyNote: 'Bảo trì 5 năm sau bảo hành',
    accessoriesIncluded: 'Phần mềm IKAChart (LogMAR/Snellen/EDTRS, chart trẻ em, Worth 4-dot, kiểm tra màu...), màn hình 24", bộ xử lý nhỏ gọn, điều khiển từ xa 2.4Ghz, bản quyền vĩnh viễn',
    serviceCodes: ['SVC-REFRACT'],
    vendorCompany: 'Công ty TNHH IKACHI',
    vendorTaxCode: '0311046744',
    vendorAddress: 'Số 59 Đường số 51, Phường An Hội Tây, TP. Hồ Chí Minh',
    contractNumber: 'Báo giá 13/03/2026',
    contractDate: '2026-03-13',
    notes: 'Báo giá 13/03/2026 — tạm ứng 50% đặt hàng, giao trong 10 ngày. Tổng 3 bộ: 66.000.000 VNĐ.',
  })),
]

// ── Existing already-owned units — site assignments inferred from CLAUDE.md ──
// All purchase fields blank — fill in when paperwork surfaces.
const existingUnits = [
  {
    code: 'TB-012', name: 'Máy chụp đáy mắt DRS Plus',
    nameEn: 'Fundus camera (DRS Plus)',
    category: 'fundus', model: 'DRS Plus',
    manufacturer: 'CenterVue / iCare', originCountry: '',
    siteId: 'TK', location: '',
    status: 'active',
    serviceCodes: ['SVC-FUNDUS'],
    notes: NOTE_EXISTING + ' Đường tích hợp: DICOM → PACS (chờ provision).',
  },
  {
    code: 'TB-013', name: 'OCT Optopol Revo NX',
    nameEn: 'OCT (Optopol Revo NX)',
    category: 'oct', model: 'Revo NX',
    manufacturer: 'Optopol Technology', originCountry: 'Ba Lan',
    siteId: 'TK', location: '',
    status: 'active',
    serviceCodes: ['SVC-OCT-ANT', 'SVC-OCT-POST', 'SVC-OCT-FULL', 'SVC-BIOMETRY'],
    notes: NOTE_EXISTING + ' Cần xác minh module DICOM được kích hoạt trên máy.',
  },
  {
    code: 'TB-014', name: 'Bản đồ giác mạc Medmont (hiện hữu)',
    nameEn: 'Corneal topographer (existing Medmont)',
    category: 'topographer', model: 'Medmont (model TBD)',
    manufacturer: 'Medmont International Pty Ltd.', originCountry: 'Úc',
    siteId: 'TK', location: '',
    status: 'active',
    serviceCodes: ['SVC-TOPO'],
    notes: NOTE_EXISTING + ' Máy Medmont cũ tại TK — Medmont Pro mới (TB-008) sẽ về KG.',
  },
  {
    code: 'TB-015', name: 'Sinh trắc nhãn cầu MediWorks AB800',
    nameEn: 'Ocular biometer (MediWorks AB800)',
    category: 'biometer', model: 'AB800',
    manufacturer: 'MediWorks', originCountry: 'Trung Quốc',
    siteId: 'TK', location: '',
    status: 'active',
    serviceCodes: ['SVC-BIOMETRY'],
    notes: NOTE_EXISTING + ' Cần xác nhận tuỳ chọn export (PDF hoặc CSV/XML) cho IOL workflow.',
  },
  {
    code: 'TB-016', name: 'Máy phân tích bề mặt nhãn cầu IDRA',
    nameEn: 'Ocular surface analyzer (SBM Sistemi IDRA)',
    category: 'dry-eye', model: 'IDRA',
    manufacturer: 'SBM Sistemi', originCountry: 'Ý',
    siteId: 'TK', location: '',
    status: 'active',
    serviceCodes: ['SVC-DRYEYE'],
    notes: NOTE_EXISTING + ' Xuất PDF + structured measurements.',
  },
]

const ALL = [...newUnits, ...existingUnits].map(d => ({
  _id: d.code, ...d, createdAt: STAMP, updatedAt: STAMP,
}))

async function main() {
  console.log(`Mode: ${DRY ? 'DRY-RUN' : 'LIVE'}`)
  console.log(`Total: ${ALL.length} thiết bị (${newUnits.length} mới + ${existingUnits.length} hiện hữu)\n`)

  if (DRY) {
    for (const d of ALL) {
      const price = d.totalPriceVnd ? `${(d.totalPriceVnd / 1_000_000).toFixed(1)}M` : ''
      console.log(`  ${d._id}  ${d.siteId || '--'}  ${d.category.padEnd(22)} ${d.name}   ${price}`)
    }
    return
  }

  require('../db')
  const mongoose = require('mongoose')
  await mongoose.connection.asPromise()
  const Equipment = require('../models/Equipment')

  let n = 0
  for (const d of ALL) {
    await Equipment.updateOne({ _id: d._id }, { $set: d }, { upsert: true })
    console.log(`✓ ${d._id}  ${d.name}`)
    n++
  }
  console.log(`\nDone — ${n} equipment upserted.`)
  await mongoose.disconnect()
  process.exit(0)
}

main().catch(err => { console.error('SEED FAILED:', err); process.exit(1) })
