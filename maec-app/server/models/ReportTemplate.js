const mongoose = require('mongoose')

const reportTemplateSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  modality:       { type: String },     // CT/MRI/XR/US — empty = any
  bodyPart:       { type: String },     // free text — empty = any
  technique:      { type: String, default: '' },
  clinicalInfo:   { type: String, default: '' },
  findings:       { type: String, default: '' },
  impression:     { type: String, default: '' },
  recommendation: { type: String, default: '' },
  ownerId:        { type: String },     // username — null/empty = global
  isShared:       { type: Boolean, default: false },
  useCount:       { type: Number, default: 0 },
  lastUsedAt:     String,
  createdAt:      String,
  updatedAt:      String,
})

reportTemplateSchema.index({ ownerId: 1, modality: 1, bodyPart: 1 })

module.exports = mongoose.model('ReportTemplate', reportTemplateSchema)
