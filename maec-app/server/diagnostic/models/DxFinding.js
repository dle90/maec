const mongoose = require('mongoose')

const dxFindingSchema = new mongoose.Schema({
  _id: String,
  name: String,
  nameVi: String,
  kind: {
    type: String,
    enum: ['symptom', 'sign', 'test_result', 'context', 'qualifier'],
  },
  producedByTest: String,
  serviceHints: [String],
  qualifiers: [String],
  aliases: [String],
}, { _id: false, collection: 'dxfindings' })

dxFindingSchema.index({ kind: 1 })

module.exports = mongoose.model('DxFinding', dxFindingSchema)
