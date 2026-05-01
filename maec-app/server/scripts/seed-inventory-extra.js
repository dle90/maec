/**
 * Seed extra inventory data: warehouses, cancel reasons, HIS mappings, transactions, lots
 * Run: node scripts/seed-inventory-extra.js
 */
require('../db')
const crypto = require('crypto')

const Warehouse = require('../models/Warehouse')
const CancelReason = require('../models/CancelReason')
const SupplyServiceMapping = require('../models/SupplyServiceMapping')
const InventoryTransaction = require('../models/InventoryTransaction')
const InventoryLot = require('../models/InventoryLot')
const Supply = require('../models/Supply')

const now = () => new Date().toISOString()
const today = () => now().slice(0, 10)

async function seed() {
  console.log('Seeding extra inventory data...\n')

  // ═══════════════════════════════════════════════════════
  // WAREHOUSES
  // ═══════════════════════════════════════════════════════
  const warehouses = [
    { _id: 'WH-1', code: 'KH-001', name: 'Kho chính Hải Phòng', site: 'Minh Anh — Cơ sở 1', manager: 'Nguyễn Thị Dung', phone: '0901234001', address: 'Tầng 1, Tòa A' },
    { _id: 'WH-2', code: 'KH-002', name: 'Kho hóa chất', site: 'Minh Anh — Cơ sở 1', manager: 'Trần Văn Hùng', phone: '0901234002', address: 'Phòng B2, Tầng hầm' },
    { _id: 'WH-3', code: 'KH-003', name: 'Kho vật tư tiêu hao', site: 'Minh Anh — Cơ sở 1', manager: 'Lê Thị Mai', phone: '0901234003', address: 'Phòng C1, Tầng 2' },
    { _id: 'WH-4', code: 'KH-004', name: 'Kho Hà Nội', site: 'Minh Anh — Cơ sở 2', manager: 'Phạm Đức Anh', phone: '0901234004', address: '12 Trần Hưng Đạo' },
  ]
  for (const wh of warehouses) {
    await Warehouse.findByIdAndUpdate(wh._id, { ...wh, description: '', status: 'active', createdAt: now(), updatedAt: now() }, { upsert: true })
  }
  console.log(`✓ ${warehouses.length} kho hàng`)

  // ═══════════════════════════════════════════════════════
  // CANCEL REASONS
  // ═══════════════════════════════════════════════════════
  const cancelReasons = [
    { _id: 'CR-1', code: 'LDH-N01', name: 'Hàng không đúng quy cách', type: 'import' },
    { _id: 'CR-2', code: 'LDH-N02', name: 'Hàng hết hạn sử dụng', type: 'import' },
    { _id: 'CR-3', code: 'LDH-N03', name: 'Nhập sai số lượng', type: 'import' },
    { _id: 'CR-4', code: 'LDH-N04', name: 'Đổi nhà cung cấp', type: 'import' },
    { _id: 'CR-5', code: 'LDH-X01', name: 'Bệnh nhân hủy dịch vụ', type: 'export' },
    { _id: 'CR-6', code: 'LDH-X02', name: 'Xuất sai vật tư', type: 'export' },
    { _id: 'CR-7', code: 'LDH-X03', name: 'Vật tư bị hỏng', type: 'export' },
    { _id: 'CR-8', code: 'LDH-X04', name: 'Điều chỉnh tồn kho', type: 'export' },
  ]
  for (const cr of cancelReasons) {
    await CancelReason.findByIdAndUpdate(cr._id, { ...cr, status: 'active', createdAt: now(), updatedAt: now() }, { upsert: true })
  }
  console.log(`✓ ${cancelReasons.length} lý do hủy (${cancelReasons.filter(r => r.type === 'import').length} nhập, ${cancelReasons.filter(r => r.type === 'export').length} xuất)`)

  // ═══════════════════════════════════════════════════════
  // HIS MAPPINGS (Supply-Service)
  // ═══════════════════════════════════════════════════════
  const hisMappings = [
    { _id: 'HSM-1', serviceId: 'SVC-4', serviceCode: 'CT001', serviceName: 'Chụp CT sọ não', supplyId: 'SPL-1', supplyCode: 'VT-001', supplyName: 'Thuốc cản quang Ultravist 370', quantity: 1, unit: 'chai' },
    { _id: 'HSM-2', serviceId: 'SVC-4', serviceCode: 'CT001', serviceName: 'Chụp CT sọ não', supplyId: 'SPL-4', supplyCode: 'VT-004', supplyName: 'Kim tiêm 22G', quantity: 2, unit: 'cái' },
    { _id: 'HSM-3', serviceId: 'SVC-5', serviceCode: 'CT002', serviceName: 'Chụp CT ngực', supplyId: 'SPL-1', supplyCode: 'VT-001', supplyName: 'Thuốc cản quang Ultravist 370', quantity: 1, unit: 'chai' },
    { _id: 'HSM-4', serviceId: 'SVC-5', serviceCode: 'CT002', serviceName: 'Chụp CT ngực', supplyId: 'SPL-5', supplyCode: 'VT-005', supplyName: 'Bơm tiêm 20ml', quantity: 1, unit: 'cái' },
    { _id: 'HSM-5', serviceId: 'SVC-1', serviceCode: 'SA020', serviceName: 'Siêu âm ổ bụng', supplyId: 'SPL-2', supplyCode: 'VT-002', supplyName: 'Gel siêu âm 250ml', quantity: 1, unit: 'chai' },
    { _id: 'HSM-6', serviceId: 'SVC-10', serviceCode: 'XQ001', serviceName: 'X-Quang ngực thẳng', supplyId: 'SPL-3', supplyCode: 'VT-003', supplyName: 'Film X-Quang 35x43cm', quantity: 1, unit: 'tờ' },
    { _id: 'HSM-7', serviceId: 'SVC-12', serviceCode: 'XN001', serviceName: 'Xét nghiệm máu tổng quát', supplyId: 'SPL-4', supplyCode: 'VT-004', supplyName: 'Kim tiêm 22G', quantity: 1, unit: 'cái' },
  ]
  for (const m of hisMappings) {
    await SupplyServiceMapping.findByIdAndUpdate(m._id, { ...m, createdAt: now(), updatedAt: now() }, { upsert: true })
  }
  console.log(`✓ ${hisMappings.length} định mức vật tư - dịch vụ (Hàng hóa HIS)`)

  // ═══════════════════════════════════════════════════════
  // IMPORT TRANSACTIONS + LOTS
  // ═══════════════════════════════════════════════════════
  const d = today().replace(/-/g, '')

  // Update supplies with packagingSpec and conversionRate
  const supplyUpdates = [
    { _id: 'SPL-1', packagingSpec: 'Chai 100ml', conversionRate: 1 },
    { _id: 'SPL-2', packagingSpec: 'Chai 250ml', conversionRate: 1 },
    { _id: 'SPL-3', packagingSpec: 'Hộp 100 tờ', conversionRate: 100 },
    { _id: 'SPL-4', packagingSpec: 'Hộp 100 cái', conversionRate: 100 },
    { _id: 'SPL-5', packagingSpec: 'Hộp 50 cái', conversionRate: 50 },
    { _id: 'SPL-6', packagingSpec: 'Hộp 100 đôi', conversionRate: 100 },
    { _id: 'SPL-7', packagingSpec: 'Hộp 50 cái', conversionRate: 50 },
    { _id: 'SPL-8', packagingSpec: 'Chai 500ml', conversionRate: 1 },
  ]
  for (const u of supplyUpdates) {
    await Supply.findByIdAndUpdate(u._id, { packagingSpec: u.packagingSpec, conversionRate: u.conversionRate, updatedAt: now() })
  }
  console.log(`✓ ${supplyUpdates.length} vật tư cập nhật quy cách đóng gói`)

  const importTxs = [
    {
      _id: 'TX-IMP-1', transactionNumber: `NK-${d}-001`, type: 'import', site: 'Minh Anh — Cơ sở 1',
      warehouseId: 'WH-1', warehouseName: 'Kho chính Hải Phòng', warehouseCode: 'KH-001',
      accountingPeriod: '04/2026',
      supplierId: 'SUP-1', supplierName: 'Công ty TNHH Thiết bị Y tế Phương Đông',
      reason: 'Nhập hàng định kỳ tháng 4', notes: 'Đơn hàng PO-2026-041',
      items: [
        { supplyId: 'SPL-1', supplyName: 'Thuốc cản quang Ultravist 370', supplyCode: 'VT-001', unit: 'chai', packagingSpec: 'Chai 100ml',
          lotNumber: 'L-ULT-2026-04', manufacturingDate: '2026-01-10', expiryDate: '2027-04-15',
          quantity: 20, conversionQuantity: 20, purchasePrice: 350000, unitPrice: 350000,
          amountBeforeTax: 7000000, vatRate: 5, vatAmount: 350000, amountAfterTax: 7350000,
          discountPercent: 0, discountAmount: 0, amount: 7350000, notes: '' },
        { supplyId: 'SPL-4', supplyName: 'Kim tiêm 22G', supplyCode: 'VT-004', unit: 'hộp', packagingSpec: 'Hộp 100 cái',
          lotNumber: 'L-KT-2026-04', manufacturingDate: '2026-02-01', expiryDate: '2028-12-31',
          quantity: 2, conversionQuantity: 200, purchasePrice: 150000, unitPrice: 1500,
          amountBeforeTax: 300000, vatRate: 5, vatAmount: 15000, amountAfterTax: 315000,
          discountPercent: 0, discountAmount: 0, amount: 315000, notes: '' },
      ],
      totalAmountBeforeTax: 7300000, totalVat: 365000, totalDiscount: 0, totalAmount: 7665000,
      status: 'confirmed', confirmedBy: 'admin', confirmedAt: now(), createdBy: 'admin',
    },
    {
      _id: 'TX-IMP-2', transactionNumber: `NK-${d}-002`, type: 'import', site: 'Minh Anh — Cơ sở 1',
      warehouseId: 'WH-2', warehouseName: 'Kho hóa chất', warehouseCode: 'KH-002',
      accountingPeriod: '04/2026',
      supplierId: 'SUP-2', supplierName: 'Công ty CP Vật tư Y tế Hải Phòng',
      reason: 'Bổ sung gel siêu âm', notes: '',
      items: [
        { supplyId: 'SPL-2', supplyName: 'Gel siêu âm 250ml', supplyCode: 'VT-002', unit: 'chai', packagingSpec: 'Chai 250ml',
          lotNumber: 'L-GEL-2026-04', manufacturingDate: '2025-12-01', expiryDate: '2027-06-30',
          quantity: 30, conversionQuantity: 30, purchasePrice: 45000, unitPrice: 45000,
          amountBeforeTax: 1350000, vatRate: 10, vatAmount: 135000, amountAfterTax: 1485000,
          discountPercent: 5, discountAmount: 74250, amount: 1410750, notes: 'Được giảm 5%' },
        { supplyId: 'SPL-6', supplyName: 'Găng tay y tế (hộp 100)', supplyCode: 'VT-006', unit: 'hộp', packagingSpec: 'Hộp 100 đôi',
          lotNumber: 'L-GT-2026-04', manufacturingDate: '2026-01-15', expiryDate: '2028-01-01',
          quantity: 15, conversionQuantity: 1500, purchasePrice: 85000, unitPrice: 850,
          amountBeforeTax: 1275000, vatRate: 10, vatAmount: 127500, amountAfterTax: 1402500,
          discountPercent: 0, discountAmount: 0, amount: 1402500, notes: '' },
      ],
      totalAmountBeforeTax: 2625000, totalVat: 262500, totalDiscount: 74250, totalAmount: 2813250,
      status: 'confirmed', confirmedBy: 'admin', confirmedAt: now(), createdBy: 'admin',
    },
    {
      _id: 'TX-IMP-3', transactionNumber: `NK-${d}-003`, type: 'import', site: 'Minh Anh — Cơ sở 1',
      warehouseId: 'WH-3', warehouseName: 'Kho vật tư tiêu hao', warehouseCode: 'KH-003',
      accountingPeriod: '04/2026',
      supplierId: 'SUP-3', supplierName: 'Đại lý Film & Hóa chất Siemens',
      reason: 'Nhập film X-Quang', notes: '',
      items: [
        { supplyId: 'SPL-3', supplyName: 'Film X-Quang 35x43cm', supplyCode: 'VT-003', unit: 'hộp', packagingSpec: 'Hộp 100 tờ',
          lotNumber: 'L-FILM-2026-04', manufacturingDate: '2026-03-01', expiryDate: '2028-03-15',
          quantity: 1, conversionQuantity: 100, purchasePrice: 1200000, unitPrice: 12000,
          amountBeforeTax: 1200000, vatRate: 10, vatAmount: 120000, amountAfterTax: 1320000,
          discountPercent: 0, discountAmount: 0, amount: 1320000, notes: '' },
      ],
      totalAmountBeforeTax: 1200000, totalVat: 120000, totalDiscount: 0, totalAmount: 1320000,
      status: 'draft', createdBy: 'admin',
    },
  ]

  for (const tx of importTxs) {
    await InventoryTransaction.findByIdAndUpdate(tx._id, { ...tx, createdAt: now(), updatedAt: now() }, { upsert: true })
    // Create lots for confirmed imports
    if (tx.status === 'confirmed') {
      for (const item of tx.items) {
        await InventoryLot.findByIdAndUpdate(`LOT-${tx._id}-${item.supplyId}`, {
          _id: `LOT-${tx._id}-${item.supplyId}`,
          supplyId: item.supplyId, site: tx.site, warehouseId: tx.warehouseId || '',
          lotNumber: item.lotNumber, manufacturingDate: item.manufacturingDate || '',
          expiryDate: item.expiryDate, importTransactionId: tx._id, importDate: today(),
          initialQuantity: item.quantity, currentQuantity: item.quantity,
          unitPrice: item.unitPrice, status: 'available', createdAt: now(),
        }, { upsert: true })
      }
    }
  }
  console.log(`✓ ${importTxs.length} phiếu nhập kho (2 đã xác nhận, 1 nháp)`)

  // ═══════════════════════════════════════════════════════
  // EXPORT TRANSACTIONS
  // ═══════════════════════════════════════════════════════
  const exportTxs = [
    {
      _id: 'TX-EXP-1', transactionNumber: `XK-${d}-001`, type: 'export', site: 'Minh Anh — Cơ sở 1',
      warehouseId: 'WH-1', warehouseName: 'Kho chính Hải Phòng', warehouseCode: 'KH-001',
      accountingPeriod: '04/2026',
      reason: 'Xuất cho phòng chụp CT', notes: '',
      items: [
        { supplyId: 'SPL-1', supplyName: 'Thuốc cản quang Ultravist 370', supplyCode: 'VT-001', unit: 'chai', packagingSpec: 'Chai 100ml',
          quantity: 5, conversionQuantity: 5, purchasePrice: 350000, unitPrice: 350000,
          amountBeforeTax: 1750000, vatRate: 0, vatAmount: 0, amountAfterTax: 1750000,
          discountPercent: 0, discountAmount: 0, amount: 1750000, notes: '' },
        { supplyId: 'SPL-4', supplyName: 'Kim tiêm 22G', supplyCode: 'VT-004', unit: 'cái', packagingSpec: 'Hộp 100 cái',
          quantity: 20, conversionQuantity: 20, purchasePrice: 1500, unitPrice: 1500,
          amountBeforeTax: 30000, vatRate: 0, vatAmount: 0, amountAfterTax: 30000,
          discountPercent: 0, discountAmount: 0, amount: 30000, notes: '' },
      ],
      totalAmountBeforeTax: 1780000, totalVat: 0, totalDiscount: 0, totalAmount: 1780000,
      status: 'confirmed', confirmedBy: 'admin', confirmedAt: now(), createdBy: 'admin',
    },
    {
      _id: 'TX-EXP-2', transactionNumber: `XK-${d}-002`, type: 'export', site: 'Minh Anh — Cơ sở 1',
      warehouseId: 'WH-2', warehouseName: 'Kho hóa chất', warehouseCode: 'KH-002',
      accountingPeriod: '04/2026',
      reason: 'Xuất cho phòng siêu âm', notes: '',
      items: [
        { supplyId: 'SPL-2', supplyName: 'Gel siêu âm 250ml', supplyCode: 'VT-002', unit: 'chai', packagingSpec: 'Chai 250ml',
          quantity: 5, conversionQuantity: 5, purchasePrice: 45000, unitPrice: 45000,
          amountBeforeTax: 225000, vatRate: 0, vatAmount: 0, amountAfterTax: 225000,
          discountPercent: 0, discountAmount: 0, amount: 225000, notes: '' },
      ],
      totalAmountBeforeTax: 225000, totalVat: 0, totalDiscount: 0, totalAmount: 225000,
      status: 'confirmed', confirmedBy: 'admin', confirmedAt: now(), createdBy: 'admin',
    },
    {
      _id: 'TX-EXP-3', transactionNumber: `XK-${d}-003`, type: 'export', site: 'Minh Anh — Cơ sở 1',
      warehouseId: 'WH-3', warehouseName: 'Kho vật tư tiêu hao', warehouseCode: 'KH-003',
      accountingPeriod: '04/2026',
      reason: 'Xuất khẩu trang cho nhân viên', notes: '',
      items: [
        { supplyId: 'SPL-7', supplyName: 'Khẩu trang y tế (hộp 50)', supplyCode: 'VT-007', unit: 'hộp', packagingSpec: 'Hộp 50 cái',
          quantity: 2, conversionQuantity: 100, purchasePrice: 50000, unitPrice: 1000,
          amountBeforeTax: 100000, vatRate: 0, vatAmount: 0, amountAfterTax: 100000,
          discountPercent: 0, discountAmount: 0, amount: 100000, notes: '' },
      ],
      totalAmountBeforeTax: 100000, totalVat: 0, totalDiscount: 0, totalAmount: 100000,
      status: 'draft', createdBy: 'admin',
    },
  ]

  for (const tx of exportTxs) {
    await InventoryTransaction.findByIdAndUpdate(tx._id, { ...tx, createdAt: now(), updatedAt: now() }, { upsert: true })
  }
  console.log(`✓ ${exportTxs.length} phiếu xuất kho (2 đã xác nhận, 1 nháp)`)

  // Add an extra lot with near-expiry for testing
  await InventoryLot.findByIdAndUpdate('LOT-EXPIRING-1', {
    _id: 'LOT-EXPIRING-1',
    supplyId: 'SPL-1', site: 'Minh Anh — Cơ sở 1', warehouseId: 'WH-1',
    lotNumber: 'L-ULT-2025-OLD', manufacturingDate: '2025-04-01',
    expiryDate: '2026-05-01', importTransactionId: 'TX-OLD', importDate: '2025-10-01',
    initialQuantity: 10, currentQuantity: 3, unitPrice: 320000, status: 'available', createdAt: now(),
  }, { upsert: true })
  console.log('✓ 1 lô hàng sắp hết hạn (Ultravist, HSD 2026-05-01)')

  console.log('\n✅ Seed inventory hoàn tất!')
  process.exit(0)
}

setTimeout(seed, 2000)
