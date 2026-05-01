const mongoose = require('mongoose')

const customerSourceSchema = new mongoose.Schema({
  _id: String,
  code: String,
  name: { type: String, required: true },
  // When true, registration must also capture a referral partner (bác sĩ / cơ sở / NVKD)
  requiresReferralPartner: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('CustomerSource', customerSourceSchema)
