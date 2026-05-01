const mongoose = require('mongoose')

const promoCodeSchema = new mongoose.Schema({
  _id: String,
  code: { type: String, unique: true },
  promotionId: String,
  promotionName: String,
  assignedToPatientId: String,
  usedCount: { type: Number, default: 0 },
  maxUsage: { type: Number, default: 1 },
  status: { type: String, enum: ['active', 'used', 'expired', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('PromoCode', promoCodeSchema)
