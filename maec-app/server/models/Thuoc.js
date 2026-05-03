const mongoose = require('mongoose')

const thuocSchema = new mongoose.Schema({
  _id: String,
  code: { type: String, unique: true },
  name: String,
  category: { type: String, enum: ['drops', 'oral', 'accessory'], default: 'drops' },
  brand: String,
  spec: String,
  importPrice: { type: Number, default: 0 },
  sellPrice: { type: Number, default: 0 },
  // VAT rate (% of gross). Vietnamese pharma typically 5% or 8%; some
  // accessories/non-medicinal can be 0. sellPrice is treated as VAT-inclusive
  // — VAT is extracted for reporting, not added on top.
  vatRate: { type: Number, default: 5, enum: [0, 5, 8] },
  needsRx: { type: Boolean, default: true },
  description: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Thuoc', thuocSchema)
