const mongoose = require('mongoose')

const dxRedFlagSchema = new mongoose.Schema({
  _id: String,
  name: String,
  nameVi: String,
  description: String,
  trigger: {
    hasAllSymptoms: [String],
    hasAnySymptoms: [String],
    qualifiers: { type: mongoose.Schema.Types.Mixed, default: {} },
    patientContext: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  services: [String],
  candidateDiseases: [String],
  urgency: {
    type: String,
    enum: ['emergency', 'urgent', 'urgent_referral'],
  },
  actionGuidance: String,
  actionGuidanceEn: String,
}, { _id: false, collection: 'dxredflags' })

module.exports = mongoose.model('DxRedFlag', dxRedFlagSchema)
