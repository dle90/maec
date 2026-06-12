const mongoose = require('mongoose')

const dxDiseaseSchema = new mongoose.Schema({
  _id: String,
  name: String,
  nameVi: String,
  services: [String],
  codes: {
    snomed: String,
    icd11: String,
    edo: String,
  },
  redFlag: { type: Boolean, default: false },
  urgency: {
    type: String,
    enum: ['emergency', 'urgent', 'urgent_referral', 'routine'],
    default: 'routine',
  },
  ageMin: Number,
  ageMax: Number,
  prevalenceTag: {
    type: String,
    enum: ['very_common', 'common', 'uncommon', 'rare', 'rare_critical'],
  },
  summary: String,
  treatments: [String],
  provenance: {
    sources: [String],
    lastReviewed: String,
    checkFlags: [String],
  },
}, { _id: false, collection: 'dxdiseases' })

dxDiseaseSchema.index({ services: 1 })
dxDiseaseSchema.index({ redFlag: 1 })

module.exports = mongoose.model('DxDisease', dxDiseaseSchema)
