const mongoose = require('mongoose')

const reportTemplateSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  examType:       { type: String },     // matches Encounter.examType — empty = any
  modality:       { type: String },     // imaging modality if template is imaging-specific — empty = any
  bodyPart:       { type: String },     // free text (e.g. OD/OS/OU for eye) — empty = any
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

reportTemplateSchema.index({ ownerId: 1, examType: 1, modality: 1, bodyPart: 1 })

module.exports = mongoose.model('ReportTemplate', reportTemplateSchema)
