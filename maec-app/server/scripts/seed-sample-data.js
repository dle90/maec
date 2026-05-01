/**
 * Seed sample data for testing Billing, Inventory, Catalogs, Promotions
 * Run: node scripts/seed-sample-data.js
 */
require('../db')
const crypto = require('crypto')

const ServiceType = require('../models/ServiceType')
const Service = require('../models/Service')
const Specialty = require('../models/Specialty')
const Supplier = require('../models/Supplier')
const SupplyCategory = require('../models/SupplyCategory')
const Supply = require('../models/Supply')
const Invoice = require('../models/Invoice')
const Promotion = require('../models/Promotion')
const PromoCode = require('../models/PromoCode')

const now = () => new Date().toISOString()
const today = () => now().slice(0, 10)

async function seed() {
  console.log('Seeding sample data...\n')

  // ═══════════════════════════════════════════════════════
  // SERVICE TYPES
  // ═══════════════════════════════════════════════════════
  const serviceTypes = [
    { _id: 'SVT-HC', code: 'HC', name: 'HỘI CHẨN', abbreviation: 'HỘI CHẨN', taxGroupName: 'Nhóm không chịu thuế', taxGroupId: 'TG-1', sortOrder: 1 },
    { _id: 'SVT-KB', code: 'KB', name: 'KHÁM CHUYÊN KHOA', abbreviation: 'KB', taxGroupName: 'Nhóm không chịu thuế', taxGroupId: 'TG-1', sortOrder: 2 },
    { _id: 'SVT-DVK', code: 'DVK', name: 'DỊCH VỤ KHÁC', abbreviation: 'DV KHÁC', taxGroupName: 'Nhóm không chịu thuế', taxGroupId: 'TG-1', sortOrder: 3 },
    { _id: 'SVT-TT', code: 'TT', name: 'THỦ THUẬT', abbreviation: 'THỦ THUẬT', taxGroupName: 'Nhóm không chịu thuế', taxGroupId: 'TG-1', sortOrder: 4 },
    { _id: 'SVT-MG', code: 'MG', name: 'MAMMO', abbreviation: 'MAMMO', taxGroupName: 'Nhóm không chịu thuế', taxGroupId: 'TG-1', sortOrder: 5 },
    { _id: 'SVT-CR', code: 'CR', name: 'XQUANG', abbreviation: 'XQUANG', taxGroupName: 'Nhóm không chịu thuế', taxGroupId: 'TG-1', sortOrder: 6 },
    { _id: 'SVT-US', code: 'US', name: 'SIÊU ÂM', abbreviation: 'SIÊU ÂM', taxGroupName: 'Nhóm không chịu thuế', taxGroupId: 'TG-1', sortOrder: 7 },
    { _id: 'SVT-CT', code: 'CT', name: 'CT SCANNER', abbreviation: 'CT', taxGroupName: 'Nhóm không chịu thuế', taxGroupId: 'TG-1', sortOrder: 8 },
    { _id: 'SVT-MR', code: 'MR', name: 'CHỤP CỘNG HƯỞNG TỪ', abbreviation: 'MRI', taxGroupName: 'Nhóm không chịu thuế', taxGroupId: 'TG-1', sortOrder: 9 },
  ]
  for (const st of serviceTypes) {
    await ServiceType.findByIdAndUpdate(st._id, {
      ...st, status: 'active', description: '', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${serviceTypes.length} loại dịch vụ`)

  // ═══════════════════════════════════════════════════════
  // SERVICES
  // ═══════════════════════════════════════════════════════
  const services = [
    { _id: 'SVC-1', code: 'SA020', name: 'Siêu âm ổ bụng', technicalInfo: 'Hội đ.ước qp.phần mềm đơn hướng dẫn siêu âm', serviceTypeCode: 'US', modality: 'US', basePrice: 150000, points: 4 },
    { _id: 'SVC-2', code: 'SA026', name: 'Siêu âm tuyến giáp', technicalInfo: 'Hội đ.ước phần mềm siêu âm tuyến giáp', serviceTypeCode: 'US', modality: 'US', basePrice: 150000, points: 4 },
    { _id: 'SVC-3', code: 'SA028', name: 'Siêu âm vú', technicalInfo: 'Hội đ.ước phần mềm siêu âm vú', serviceTypeCode: 'US', modality: 'US', basePrice: 150000, points: 4 },
    { _id: 'SVC-4', code: 'CT001', name: 'Chụp CT sọ não', technicalInfo: 'Hội đ.ước qp.phần mềm chẩn hướng dẫn siêu âm', serviceTypeCode: 'CT', modality: 'CT', basePrice: 800000, points: 8 },
    { _id: 'SVC-5', code: 'CT002', name: 'Chụp CT ngực', technicalInfo: 'Hội đ.ước phần mềm chẩn hướng dẫn CT ngực', serviceTypeCode: 'CT', modality: 'CT', basePrice: 900000, points: 8 },
    { _id: 'SVC-6', code: 'CT003', name: 'Chụp CT bụng chậu', technicalInfo: 'Hội đ.ước cắt lớp chụp bụng chậu có tiêm', serviceTypeCode: 'CT', modality: 'CT', basePrice: 1200000, points: 10 },
    { _id: 'SVC-7', code: 'MRI01', name: 'Chụp MRI sọ não', technicalInfo: 'Chụp cộng hưởng từ sọ não không tiêm', serviceTypeCode: 'MR', modality: 'MRI', basePrice: 1500000, points: 12 },
    { _id: 'SVC-8', code: 'MRI02', name: 'Chụp MRI cột sống', technicalInfo: 'Chụp cộng hưởng từ cột sống thắt lưng', serviceTypeCode: 'MR', modality: 'MRI', basePrice: 1500000, points: 12 },
    { _id: 'SVC-9', code: 'MRI03', name: 'Chụp MRI khớp gối', technicalInfo: 'Chụp cộng hưởng từ khớp gối 2 bên', serviceTypeCode: 'MR', modality: 'MRI', basePrice: 1800000, points: 14 },
    { _id: 'SVC-10', code: 'XQ001', name: 'X-Quang ngực thẳng', technicalInfo: 'Chụp X-Quang ngực thẳng 1 phim', serviceTypeCode: 'CR', modality: 'XR', basePrice: 100000, points: 2 },
    { _id: 'SVC-11', code: 'XQ002', name: 'X-Quang cột sống', technicalInfo: 'Chụp X-Quang cột sống thẳng nghiêng', serviceTypeCode: 'CR', modality: 'XR', basePrice: 120000, points: 3 },
    { _id: 'SVC-12', code: 'XN001', name: 'Xét nghiệm máu tổng quát', technicalInfo: 'Xét nghiệm công thức máu toàn phần', serviceTypeCode: 'DVK', modality: 'LAB', basePrice: 200000, points: 3 },
    { _id: 'SVC-13', code: 'XN002', name: 'Xét nghiệm đường huyết', technicalInfo: 'Định lượng glucose huyết tương', serviceTypeCode: 'DVK', modality: 'LAB', basePrice: 50000, points: 1 },
    { _id: 'SVC-14', code: 'XN003', name: 'Xét nghiệm chức năng gan', technicalInfo: 'Xét nghiệm AST, ALT, GGT, Bilirubin', serviceTypeCode: 'DVK', modality: 'LAB', basePrice: 300000, points: 4 },
    { _id: 'SVC-15', code: 'ECG01', name: 'Điện tâm đồ', technicalInfo: 'Đo điện tâm đồ 12 chuyển đạo', serviceTypeCode: 'TT', modality: 'OTHER', basePrice: 100000, points: 2 },
    { _id: 'SVC-16', code: 'KH001', name: 'Khám tổng quát', technicalInfo: 'Khám lâm sàng tổng quát', serviceTypeCode: 'KB', modality: 'OTHER', basePrice: 200000, points: 3 },
  ]
  for (const svc of services) {
    await Service.findByIdAndUpdate(svc._id, {
      ...svc, unit: 'lần', status: 'active', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${services.length} dịch vụ`)

  // ═══════════════════════════════════════════════════════
  // SPECIALTIES
  // ═══════════════════════════════════════════════════════
  const specialties = [
    { _id: 'SPEC-1', code: 'CK-CDHA', name: 'Chẩn đoán hình ảnh' },
    { _id: 'SPEC-2', code: 'CK-NGOAI', name: 'Ngoại khoa' },
    { _id: 'SPEC-3', code: 'CK-NOI', name: 'Nội khoa' },
    { _id: 'SPEC-4', code: 'CK-SAN', name: 'Sản phụ khoa' },
    { _id: 'SPEC-5', code: 'CK-NHI', name: 'Nhi khoa' },
    { _id: 'SPEC-6', code: 'CK-TMH', name: 'Tai Mũi Họng' },
    { _id: 'SPEC-7', code: 'CK-MAT', name: 'Mắt' },
    { _id: 'SPEC-8', code: 'CK-RHM', name: 'Răng Hàm Mặt' },
  ]
  for (const sp of specialties) {
    await Specialty.findByIdAndUpdate(sp._id, {
      ...sp, description: '', status: 'active', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${specialties.length} chuyên khoa`)

  // ═══════════════════════════════════════════════════════
  // SUPPLIERS
  // ═══════════════════════════════════════════════════════
  const suppliers = [
    { _id: 'SUP-1', code: 'NCC-001', name: 'Công ty TNHH Thiết bị Y tế Phương Đông', contactPerson: 'Nguyễn Văn A', phone: '0901234567', taxCode: '0100123456' },
    { _id: 'SUP-2', code: 'NCC-002', name: 'Công ty CP Vật tư Y tế Hải Phòng', contactPerson: 'Trần Thị B', phone: '0912345678', taxCode: '0200234567' },
    { _id: 'SUP-3', code: 'NCC-003', name: 'Đại lý Film & Hóa chất Siemens', contactPerson: 'Lê Văn C', phone: '0923456789', taxCode: '0300345678' },
  ]
  for (const sup of suppliers) {
    await Supplier.findByIdAndUpdate(sup._id, {
      ...sup, email: '', address: '', status: 'active', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${suppliers.length} nhà cung cấp`)

  // ═══════════════════════════════════════════════════════
  // SUPPLY CATEGORIES
  // ═══════════════════════════════════════════════════════
  const supplyCategories = [
    { _id: 'SCAT-1', code: 'NVT-HC', name: 'Hóa chất' },
    { _id: 'SCAT-2', code: 'NVT-FILM', name: 'Film & vật tư in ấn' },
    { _id: 'SCAT-3', code: 'NVT-KT', name: 'Kim tiêm & ống nghiệm' },
    { _id: 'SCAT-4', code: 'NVT-VP', name: 'Văn phòng phẩm y tế' },
    { _id: 'SCAT-5', code: 'NVT-BV', name: 'Bảo hộ & vệ sinh' },
  ]
  for (const cat of supplyCategories) {
    await SupplyCategory.findByIdAndUpdate(cat._id, {
      ...cat, parentId: null, status: 'active', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${supplyCategories.length} nhóm vật tư`)

  // ═══════════════════════════════════════════════════════
  // SUPPLIES
  // ═══════════════════════════════════════════════════════
  const supplies = [
    { _id: 'SPL-1', code: 'VT-001', name: 'Thuốc cản quang Ultravist 370', categoryId: 'SCAT-1', unit: 'chai', minimumStock: 20, currentStock: 45, site: 'LinkRad Hai Phong' },
    { _id: 'SPL-2', code: 'VT-002', name: 'Gel siêu âm 250ml', categoryId: 'SCAT-1', unit: 'chai', minimumStock: 30, currentStock: 60, site: 'LinkRad Hai Phong' },
    { _id: 'SPL-3', code: 'VT-003', name: 'Film X-Quang 35x43cm', categoryId: 'SCAT-2', unit: 'tờ', minimumStock: 100, currentStock: 250, site: 'LinkRad Hai Phong' },
    { _id: 'SPL-4', code: 'VT-004', name: 'Kim tiêm 22G', categoryId: 'SCAT-3', unit: 'cái', minimumStock: 200, currentStock: 500, site: 'LinkRad Hai Phong' },
    { _id: 'SPL-5', code: 'VT-005', name: 'Bơm tiêm 20ml', categoryId: 'SCAT-3', unit: 'cái', minimumStock: 100, currentStock: 80, site: 'LinkRad Hai Phong' },
    { _id: 'SPL-6', code: 'VT-006', name: 'Găng tay y tế (hộp 100)', categoryId: 'SCAT-5', unit: 'hộp', minimumStock: 10, currentStock: 25, site: 'LinkRad Hai Phong' },
    { _id: 'SPL-7', code: 'VT-007', name: 'Khẩu trang y tế (hộp 50)', categoryId: 'SCAT-5', unit: 'hộp', minimumStock: 5, currentStock: 3, site: 'LinkRad Hai Phong' },
    { _id: 'SPL-8', code: 'VT-008', name: 'Giấy in kết quả A4', categoryId: 'SCAT-4', unit: 'ram', minimumStock: 10, currentStock: 15, site: 'LinkRad Hai Phong' },
  ]
  for (const spl of supplies) {
    await Supply.findByIdAndUpdate(spl._id, {
      ...spl, supplierId: '', status: 'active', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${supplies.length} vật tư (2 dưới mức tối thiểu)`)

  // ═══════════════════════════════════════════════════════
  // INVOICES (sample billing data)
  // ═══════════════════════════════════════════════════════
  const d = today().replace(/-/g, '')
  const sampleInvoices = [
    {
      _id: 'INV-SAMPLE-1', invoiceNumber: `HD-${d}-0001`,
      patientName: 'Nguyễn Văn Minh', phone: '0901111111', site: 'LinkRad Hai Phong',
      items: [
        { serviceCode: 'CT001', serviceName: 'Chụp CT sọ não', unitPrice: 800000, quantity: 1, amount: 800000 },
        { serviceCode: 'XN001', serviceName: 'Xét nghiệm máu tổng quát', unitPrice: 200000, quantity: 1, amount: 200000 },
      ],
      subtotal: 1000000, totalDiscount: 0, totalTax: 0, grandTotal: 1000000,
      paidAmount: 0, status: 'draft', createdBy: 'admin',
    },
    {
      _id: 'INV-SAMPLE-2', invoiceNumber: `HD-${d}-0002`,
      patientName: 'Trần Thị Hoa', phone: '0902222222', site: 'LinkRad Hai Phong',
      items: [
        { serviceCode: 'MRI01', serviceName: 'Chụp MRI sọ não', unitPrice: 1500000, quantity: 1, amount: 1500000 },
      ],
      subtotal: 1500000, totalDiscount: 0, totalTax: 0, grandTotal: 1500000,
      paidAmount: 0, status: 'draft', createdBy: 'admin',
    },
    {
      _id: 'INV-SAMPLE-3', invoiceNumber: `HD-${d}-0003`,
      patientName: 'Lê Hoàng Nam', phone: '0903333333', site: 'LinkRad Hai Phong',
      items: [
        { serviceCode: 'SA020', serviceName: 'Siêu âm ổ bụng', unitPrice: 150000, quantity: 1, amount: 150000 },
        { serviceCode: 'XQ001', serviceName: 'X-Quang ngực thẳng', unitPrice: 100000, quantity: 1, amount: 100000 },
        { serviceCode: 'XN002', serviceName: 'Xét nghiệm đường huyết', unitPrice: 50000, quantity: 1, amount: 50000 },
      ],
      subtotal: 300000, totalDiscount: 30000, totalTax: 0, grandTotal: 270000,
      paidAmount: 270000, status: 'paid', paidAt: now(), paymentMethod: 'cash',
      createdBy: 'admin', cashierId: 'admin',
    },
    {
      _id: 'INV-SAMPLE-4', invoiceNumber: `HD-${d}-0004`,
      patientName: 'Phạm Thị Lan', phone: '0904444444', site: 'LinkRad Hai Phong',
      items: [
        { serviceCode: 'CT002', serviceName: 'Chụp CT ngực', unitPrice: 900000, quantity: 1, amount: 900000 },
        { serviceCode: 'ECG01', serviceName: 'Điện tâm đồ', unitPrice: 100000, quantity: 1, amount: 100000 },
      ],
      subtotal: 1000000, totalDiscount: 100000, totalTax: 0, grandTotal: 900000,
      paidAmount: 900000, status: 'paid', paidAt: now(), paymentMethod: 'transfer',
      createdBy: 'admin', cashierId: 'admin',
    },
    {
      _id: 'INV-SAMPLE-5', invoiceNumber: `HD-${d}-0005`,
      patientName: 'Vũ Đức Thắng', phone: '0905555555', site: 'LinkRad Hai Phong',
      items: [
        { serviceCode: 'KH001', serviceName: 'Khám tổng quát', unitPrice: 200000, quantity: 1, amount: 200000 },
      ],
      subtotal: 200000, totalDiscount: 0, totalTax: 0, grandTotal: 200000,
      paidAmount: 200000, status: 'refunded', paidAt: now(), paymentMethod: 'cash',
      createdBy: 'admin',
    },
  ]
  for (const inv of sampleInvoices) {
    await Invoice.findByIdAndUpdate(inv._id, {
      ...inv, createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${sampleInvoices.length} phiếu thu mẫu (2 chờ thu, 2 đã thu, 1 hoàn trả)`)

  // ═══════════════════════════════════════════════════════
  // PROMOTIONS
  // ═══════════════════════════════════════════════════════
  const promos = [
    {
      _id: 'PROMO-1', code: 'KM-KHAIGIANG', name: 'Khai trương giảm 10%',
      type: 'percentage', discountValue: 10, maxDiscountAmount: 500000,
      startDate: '2026-01-01', endDate: '2026-12-31',
      maxUsageTotal: 100, currentUsage: 5,
    },
    {
      _id: 'PROMO-2', code: 'KM-MRI50', name: 'Giảm 50K dịch vụ MRI',
      type: 'fixed_amount', discountValue: 50000,
      startDate: '2026-04-01', endDate: '2026-06-30',
      maxUsageTotal: 200, currentUsage: 12,
    },
    {
      _id: 'PROMO-3', code: 'KM-COMBO', name: 'Combo khám + CĐHA giảm 15%',
      type: 'percentage', discountValue: 15, maxDiscountAmount: 1000000,
      minOrderAmount: 500000,
      startDate: '2026-04-01', endDate: '2026-09-30',
      maxUsageTotal: 0, currentUsage: 3,
    },
  ]
  for (const p of promos) {
    await Promotion.findByIdAndUpdate(p._id, {
      ...p, description: '', status: 'active',
      applicableServiceTypes: [], applicableServiceIds: [], applicableSites: [],
      maxUsagePerPatient: 0, createdBy: 'admin', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${promos.length} chương trình giảm giá`)

  // PROMO CODES
  const promoCodes = [
    { _id: 'PC-1', code: 'LINKRAD10', promotionId: 'PROMO-1', promotionName: 'Khai trương giảm 10%', maxUsage: 10, usedCount: 2 },
    { _id: 'PC-2', code: 'WELCOME2026', promotionId: 'PROMO-1', promotionName: 'Khai trương giảm 10%', maxUsage: 5, usedCount: 0 },
    { _id: 'PC-3', code: 'MRI50K', promotionId: 'PROMO-2', promotionName: 'Giảm 50K dịch vụ MRI', maxUsage: 50, usedCount: 8 },
    { _id: 'PC-4', code: 'COMBO15', promotionId: 'PROMO-3', promotionName: 'Combo khám + CĐHA giảm 15%', maxUsage: 1, usedCount: 0 },
    { _id: 'PC-5', code: 'VIP2026', promotionId: 'PROMO-3', promotionName: 'Combo khám + CĐHA giảm 15%', maxUsage: 3, usedCount: 1 },
  ]
  for (const pc of promoCodes) {
    await PromoCode.findByIdAndUpdate(pc._id, {
      ...pc, status: 'active', assignedToPatientId: null, createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${promoCodes.length} mã giảm giá (LINKRAD10, WELCOME2026, MRI50K, COMBO15, VIP2026)`)

  console.log('\n✅ Seed hoàn tất! Dữ liệu mẫu đã được tạo.')
  console.log('\nMã giảm giá để test: LINKRAD10 (10%), MRI50K (50K), COMBO15 (15% cho đơn ≥500K)')
  process.exit(0)
}

// Wait for MongoDB connection
setTimeout(seed, 2000)
