const mongoose = require('mongoose')

// A warehouse (kho) is the unit of inventory. One per branch site, plus one or
// more central warehouses (kho tổng) used for regional restocking. "Kho tổng"
// is just a warehouse with no site — no separate type flag. Multiple kho tổng
// allowed (e.g. one per region later).
const warehouseSchema = new mongoose.Schema({
  _id: String,
  code: String,
  name: String,
  site: { type: String, default: null },  // Department._id of branch, null for kho tổng
  region: { type: String, default: null }, // optional grouping for regional kho tổng
  address: String,
  manager: String,
  phone: String,
  description: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Warehouse', warehouseSchema)
