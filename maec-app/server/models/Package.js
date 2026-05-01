const mongoose = require('mongoose')

const packageSchema = new mongoose.Schema({
  _id: String,
  code: { type: String, unique: true },
  name: String,
  description: String,

  bundledServices: { type: [String], default: [] },

  basePrice: { type: Number, default: 0 },

  pricingTiers: {
    type: [{
      code: String,
      name: String,
      extraServices: { type: [String], default: [] },
      extraProductSku: String,
      totalPrice: Number,
    }],
    default: [],
  },

  pricingRules: {
    type: [{
      condition: String,
      sourcePackages: { type: [String], default: [] },
      price: Number,
    }],
    default: [],
  },

  activatesEntitlement: {
    durationMonths: Number,
    coveredServices: {
      type: [{
        serviceCode: String,
        maxUses: { type: Number, default: null },
      }],
      default: [],
    },
  },

  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Package', packageSchema)
