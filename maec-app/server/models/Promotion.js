const mongoose = require('mongoose')

const promotionSchema = new mongoose.Schema({
  _id: String,
  code: String,
  name: String,
  description: String,
  type: { type: String, enum: ['percentage', 'fixed_amount'], default: 'percentage' },
  discountValue: { type: Number, default: 0 },
  maxDiscountAmount: { type: Number, default: 0 },
  applicableServiceTypes: [String],
  applicableServiceIds: [String],
  applicableSites: [String],
  minOrderAmount: { type: Number, default: 0 },
  startDate: String,
  endDate: String,
  maxUsageTotal: { type: Number, default: 0 },
  maxUsagePerPatient: { type: Number, default: 0 },
  currentUsage: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'inactive', 'expired'], default: 'active' },
  createdBy: String,
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Promotion', promotionSchema)
