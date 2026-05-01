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
  // Product origin link. 'supply' = legacy radiology vật tư; 'thuoc' / 'kinh'
  // = mirror of MAEC catalog entry. productCode == catalog code (e.g. TH-001,
  // KN-005). Inventory tabs filter on productKind. Editing the catalog auto-
  // syncs name/unit/packagingSpec onto the Supply mirror.
  productKind: { type: String, enum: ['supply', 'thuoc', 'kinh'], default: 'supply' },
  productCode: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

supplySchema.index({ productKind: 1, status: 1 })

module.exports = mongoose.model('Supply', supplySchema)
