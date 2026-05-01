const mongoose = require('mongoose')

const partnerAccountSchema = new mongoose.Schema({
  _id: String,
  facilityId: String,
  username: { type: String, index: true, unique: true },
  password: String,
  displayName: String,
  email: String,
  phone: String,
  commissionGroupId: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  lastLoginAt: String,
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('PartnerAccount', partnerAccountSchema)
