const mongoose = require('mongoose')
const schema = new mongoose.Schema({
  _id: String,
  commissionGroupId: String,
  commissionGroupName: String,
  serviceTypeCode: String,
  serviceId: String,
  serviceName: String,
  type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  value: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String, updatedAt: String,
}, { _id: false })
module.exports = mongoose.model('CommissionRule', schema)
