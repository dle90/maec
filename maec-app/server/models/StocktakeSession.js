const mongoose = require('mongoose')

// Kiểm kê session. Lifecycle: open → counting → submitted → approved (→ applied).
// On approval, spawns one adjustment InventoryTransaction per non-zero variance
// line, with stocktakeSessionId and reasonCode set. `applied` is the terminal
// state reached once the adjustments are confirmed.
const stocktakeItemSchema = new mongoose.Schema({
  supplyId: String,
  supplyCode: String,
  supplyName: String,
  unit: String,
  systemQty: { type: Number, default: 0 },   // snapshot at session start
  actualQty: { type: Number, default: null }, // null = not yet counted
  variance: { type: Number, default: 0 },
  reasonCode: String,                         // required when variance ≠ 0 on submit
  reasonText: String,
  notes: String,
  countedAt: String,
  countedBy: String,
}, { _id: false })

const stocktakeSessionSchema = new mongoose.Schema({
  _id: String,
  sessionNumber: String,                      // e.g. KK-202604-001
  warehouseId: { type: String, required: true },
  warehouseName: String,
  name: String,                               // e.g. "Kiểm kê tháng 4"
  scope: { type: String, enum: ['all', 'category'], default: 'all' },
  categoryId: String,                         // when scope='category'
  productKind: String,                        // optional Q5 narrowing: 'thuoc' | 'kinh' | 'supply' | other
  items: [stocktakeItemSchema],
  status: { type: String, enum: ['open', 'submitted', 'approved', 'cancelled', 'applied'], default: 'open' },
  adjustmentTxIds: [String],
  startedBy: String,
  startedAt: String,
  submittedBy: String,
  submittedAt: String,
  approvedBy: String,
  approvedAt: String,
  cancelledBy: String,
  cancelledAt: String,
  notes: String,
  updatedAt: String,
}, { _id: false })

stocktakeSessionSchema.index({ warehouseId: 1, status: 1 })

module.exports = mongoose.model('StocktakeSession', stocktakeSessionSchema)
