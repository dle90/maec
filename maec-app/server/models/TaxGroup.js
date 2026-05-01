const mongoose = require('mongoose')
const schema = new mongoose.Schema({
  _id: String,
  code: String,
  name: String,
  description: String,         // Mô tả
  vatType: { type: String, default: 'percentage' }, // Loại thuế VAT: percentage / exempt
  rate: { type: Number, default: 0 },  // % VAT
  branchCode: { type: String, default: 'all' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String, updatedAt: String,
}, { _id: false })
module.exports = mongoose.model('TaxGroup', schema)
