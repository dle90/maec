const mongoose = require('mongoose')

const serviceTypeSchema = new mongoose.Schema({
  _id: String,
  code: { type: String, unique: true },
  name: String,
  abbreviation: String,      // Tên viết tắt
  taxGroupId: String,        // Nhóm thuế dịch vụ
  taxGroupName: String,      // Tên nhóm thuế (denormalized)
  description: String,
  sortOrder: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('ServiceType', serviceTypeSchema)
