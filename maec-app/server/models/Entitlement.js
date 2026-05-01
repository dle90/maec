const mongoose = require('mongoose')

const entitlementSchema = new mongoose.Schema({
  _id: String,
  patientId: String,
  sourcePackageCode: String,
  encounterId: String,
  activatedAt: String,
  expiresAt: String,
  coveredServices: {
    type: [{
      serviceCode: String,
      maxUses: { type: Number, default: null },
      used: { type: Number, default: 0 },
    }],
    default: [],
  },
  status: { type: String, enum: ['active', 'expired', 'revoked'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

entitlementSchema.index({ patientId: 1, status: 1 })

module.exports = mongoose.model('Entitlement', entitlementSchema)
