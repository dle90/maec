const mongoose = require('mongoose')

// Supply is a master SKU, stateless with respect to stock. Actual on-hand
// is aggregated from InventoryLot per warehouse. `currentStock` is kept for
// one release as a deprecated read-only cache — do not write to it; reads
// should prefer live aggregation via GET /inventory/stock.
const supplySchema = new mongoose.Schema({
  _id: String,
  code: String,
  name: String,
  categoryId: String,
  unit: String,
  packagingSpec: String,
  conversionRate: { type: Number, default: 1 },
  minimumStock: { type: Number, default: 0 },  // default reorder threshold per warehouse
  currentStock: { type: Number, default: 0 },  // DEPRECATED — do not trust, will be removed
  supplierId: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Supply', supplySchema)
