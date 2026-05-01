const mongoose = require('mongoose')

const serviceSchema = new mongoose.Schema({
  _id: String,
  code: { type: String, unique: true },
  technicalInfo: String,       // Thông tin kỹ thuật
  name: String,
  serviceTypeId: String,
  serviceTypeCode: String,     // Nhóm dịch vụ
  modality: { type: String, enum: ['CT', 'MRI', 'XR', 'US', 'LAB', 'OTHER', null], default: null },
  bodyPart: String,
  basePrice: { type: Number, default: 0 },
  unit: { type: String, default: 'lần' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Service', serviceSchema)
