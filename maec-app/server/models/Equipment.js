const mongoose = require('mongoose')

// Physical hardware unit at the clinic. One row per device (each Ortho-K trial
// kit, each slit lamp, each VA chart screen — even if vendor + model match,
// because serial numbers, sites, and service history diverge per unit).
//
// Fields are loose where the source data is loose: vendor contracts vary in
// what they record (CO/CQ, TBYT registration, accessories), and the clinic
// may not always know e.g. serialNumber for older devices.
const equipmentSchema = new mongoose.Schema({
  _id: String,                  // e.g. TB-001 (Thiết bị 001)

  // Identity
  code: { type: String, unique: true },
  name: String,                 // Vietnamese display name
  nameEn: String,               // Optional English
  category: {
    type: String,
    // Free-form by design but seeded values match the clinic's station map.
    // auto-ref, auto-keratometer, lensometer, slit-lamp, slit-lamp-table,
    // oct, topographer, fundus, biometer, dry-eye, va-chart,
    // exam-table-chair-set, exam-chair, other
  },
  model: String,                // Vendor's model code (e.g. PRK-9000, KSL-H5-Dr)
  manufacturer: String,         // Hãng sản xuất (Potec, Keeler, Medmont, IKACHI...)
  originCountry: String,        // Xuất xứ (Korea, UK, China, Vietnam...)
  serialNumber: String,         // Số serial, if known
  registrationNumber: String,   // Số lưu hành TBYT (regulatory) — e.g. 250004308/PCBB-HN

  // Deployment
  siteId: String,               // 'TK' (Trung Kính) | 'KG' (Kim Giang) | '' (unassigned)
  location: String,             // Free-form room/station within the site
  status: {
    type: String,
    enum: ['active', 'commissioning', 'repair', 'retired'],
    default: 'active',
  },
  commissionedAt: String,       // Ngày bàn giao / đưa vào sử dụng
  lastServiceDate: String,      // Lần bảo dưỡng gần nhất
  nextServiceDate: String,      // Hạn bảo dưỡng tiếp theo (nếu có)

  // Purchase / contract — mirrors what's in the source vendor docs.
  // Vendor is the LEGAL seller (which may differ from `manufacturer` above —
  // e.g. Potec PLM-8000PD is sold by "Nam Hưng" but manufactured by Potec).
  vendorCompany: String,
  vendorTaxCode: String,
  vendorAddress: String,
  contractNumber: String,       // e.g. HD2636/NH-MA
  contractDate: String,         // ISO date (when signed)
  purchaseDate: String,         // ISO date (delivered/installed — may equal commissionedAt)
  unitPriceVnd: { type: Number, default: 0 },        // Đơn giá
  vatAmountVnd: { type: Number, default: 0 },        // Thuế VAT line
  totalPriceVnd: { type: Number, default: 0 },       // Thành tiền (incl VAT)
  discountVnd: { type: Number, default: 0 },         // Chiết khấu (if any)
  warrantyMonths: { type: Number, default: 12 },
  warrantyNote: String,         // Caveats (e.g. "không bao gồm bóng đèn")

  // Long-form notes — accessories included, paperwork (CO/CQ), free-form notes
  accessoriesIncluded: String,
  notes: String,

  // Link to which clinical services this device performs. Loose array of
  // service codes (e.g. ['SVC-AUTOREF', 'SVC-REFRACT']) — denormalised so
  // reports can be built without a join. Source-of-truth still in CLAUDE.md
  // (Devices module section) until a Service↔Device join collection exists.
  serviceCodes: [String],

  createdAt: String,
  updatedAt: String,
}, { _id: false })

equipmentSchema.index({ siteId: 1, category: 1 })
equipmentSchema.index({ status: 1 })

module.exports = mongoose.model('Equipment', equipmentSchema)
