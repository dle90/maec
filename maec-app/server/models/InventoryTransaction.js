const mongoose = require('mongoose')

const txItemSchema = new mongoose.Schema({
  supplyId: String,
  supplyName: String,
  supplyCode: String,
  unit: String,
  packagingSpec: String,
  lotId: String,                       // set on export-type txs to record which lot was consumed
  lotNumber: String,
  manufacturingDate: String,
  expiryDate: String,
  quantity: Number,
  conversionQuantity: { type: Number, default: 0 },
  purchasePrice: { type: Number, default: 0 },
  unitPrice: { type: Number, default: 0 },
  amountBeforeTax: { type: Number, default: 0 },
  vatRate: { type: Number, default: 0 },
  vatAmount: { type: Number, default: 0 },
  amountAfterTax: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
  notes: String,
}, { _id: false })

// type semantics:
//   import       — from external supplier into warehouseId (creates lots)
//   export       — out of warehouseId to external (discard, trả NCC, etc.) (FIFO deduct)
//   auto_deduct  — system-generated from KTV scan completion (FIFO deduct)
//   adjustment   — manual count correction (+/-); spawned by kiểm kê approval or ad-hoc
//   transfer_out — leaving warehouseId, destined for counterpartyWarehouseId
//   transfer_in  — arriving into warehouseId from counterpartyWarehouseId
// Every transfer is a pair linked by transferId.
const inventoryTransactionSchema = new mongoose.Schema({
  _id: String,
  transactionNumber: String,
  type: { type: String, enum: ['import', 'export', 'adjustment', 'auto_deduct', 'transfer_out', 'transfer_in'] },
  warehouseId: { type: String, required: true },
  warehouseName: String,
  warehouseCode: String,
  site: String,                              // legacy echo: warehouse's site at time of write
  counterpartyWarehouseId: String,           // transfer only: the other end
  counterpartyWarehouseName: String,
  transferId: String,                        // shared by both legs of a transfer
  accountingPeriod: String,
  items: [txItemSchema],
  totalAmountBeforeTax: { type: Number, default: 0 },
  totalVat: { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  supplierId: String,
  supplierName: String,
  reasonCode: String,
  reason: String,
  notes: String,
  relatedServiceOrderId: String,
  relatedVisitId: String,
  relatedStudyId: String,                    // auto_deduct back-reference
  stocktakeSessionId: String,                // adjustment from kiểm kê
  status: { type: String, enum: ['draft', 'confirmed', 'cancelled'], default: 'draft' },
  confirmedBy: String,
  confirmedAt: String,
  createdBy: String,
  createdAt: String,
  updatedAt: String,
}, { _id: false })

inventoryTransactionSchema.index({ warehouseId: 1, createdAt: -1 })
inventoryTransactionSchema.index({ transferId: 1 })

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema)
