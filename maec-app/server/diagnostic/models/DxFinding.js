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
  // When this finding is present, these other findings are implicitly present
  // too (clinical entailment). pain_severe implies pain; vf_altitudinal implies
  // field_loss_altitudinal which implies field_loss. The engine expands the
  // active-findings set along these edges before matching/ranking.
  implies: [String],
  // Free-form notes (e.g. KB authoring caveats, [CHECK] flags). Not used by
  // the engine.
  notes: String,
}, { _id: false, collection: 'dxfindings' })

dxFindingSchema.index({ kind: 1 })

module.exports = mongoose.model('DxFinding', dxFindingSchema)
