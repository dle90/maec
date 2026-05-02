const mongoose = require('mongoose')

const packageSchema = new mongoose.Schema({
  _id: String,
  code: { type: String, unique: true },
  name: String,
  description: String,

  bundledServices: { type: [String], default: [] },
  // Per-service price mode (parallel to bundledServices).
  //   'base'      — uses Service.basePrice (à la carte)
  //   'inPackage' — uses Service.inPackagePrice (discounted)
  //   'custom'    — uses customPrice on this entry (override)
  // Missing entries default to 'inPackage' on read.
  bundledServiceModes: {
    type: [{
      code: String,
      priceMode: { type: String, enum: ['base', 'inPackage', 'custom'], default: 'inPackage' },
      customPrice: { type: Number, default: 0 },
    }],
    default: [],
  },
  // Optional Kính SKUs bundled with this package (e.g. ortho-K lens for the
  // myopia-control package). Each Kính's sellPrice is added to the
  // service-portion total to compute the package's overall price.
  // Use bundledKinhSkus going forward; bundledKinhSku is kept for backward
  // compat with old single-field data and is ignored on write.
  bundledKinhSkus: { type: [String], default: [] },
  bundledKinhSku: String,
  // Type-level Kính bundling (e.g. 'standard' / 'toric' / 'customized' for
  // ortho-K). The package commits to a type; the specific SKU is picked at
  // billing time from whichever's in stock + matches. Matrix uses average
  // sellPrice across SKUs of that type for display totals.
  bundledKinhTypes: { type: [String], default: [] },

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
