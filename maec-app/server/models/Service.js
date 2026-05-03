const mongoose = require('mongoose')

const serviceSchema = new mongoose.Schema({
  _id: String,
  code: { type: String, unique: true },
  name: String,
  category: { type: String },
  basePrice: { type: Number, default: 0 },
  inPackagePrice: { type: Number, default: null },
  unit: { type: String, default: 'lần' },
  description: String,
  // Per-service clinical output schema. The Khám exam form renders these
  // fields when the doctor opens this service. Editable from the Dịch vụ
  // catalog UI. Falls back to static serviceOutputFields.js when empty —
  // kept for backward compat with any service not yet migrated.
  outputFields: {
    type: [{
      key: { type: String, required: true },        // JSON key into encounter.assignedServices[].output
      label: { type: String, required: true },      // Display label
      type: { type: String, enum: ['text', 'textarea', 'number', 'boolean', 'select', 'datetime'], default: 'text' },
      options: { type: [String], default: [] },     // For type=select
      placeholder: String,                          // For text/textarea/number
      step: Number,                                 // For number (e.g. 0.25 for diopters)
      required: { type: Boolean, default: false },
    }],
    default: [],
  },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Service', serviceSchema)
