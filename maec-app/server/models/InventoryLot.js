const mongoose = require('mongoose')

// A lot is a specific batch of a supply received into a specific warehouse.
// warehouseId is the source of truth for location; `site` is kept as a
// legacy read-only echo (filled from warehouse on creation) for older code
// paths and reporting until those migrate.
const inventoryLotSchema = new mongoose.Schema({
  _id: String,
  supplyId: { type: String, required: true },
  warehouseId: { type: String, required: true },
  site: String,
  lotNumber: String,
  manufacturingDate: String,
  expiryDate: String,
  importTransactionId: String,
  importDate: String,
  initialQuantity: Number,
  currentQuantity: { type: Number, default: 0 },
  unitPrice: { type: Number, default: 0 },
  status: { type: String, enum: ['available', 'expired', 'depleted'], default: 'available' },
  createdAt: String,
}, { _id: false })

inventoryLotSchema.index({ supplyId: 1, warehouseId: 1 })
inventoryLotSchema.index({ warehouseId: 1, expiryDate: 1, status: 1 })

module.exports = mongoose.model('InventoryLot', inventoryLotSchema)
