const mongoose = require('mongoose')

// Disease ↔ finding edges (the QMR-style weighted graph).
// frequency: P(finding | disease) — how often the disease has this finding
// evokingStrength: P(disease | finding) signal — how strongly the finding points
//                  at this disease vs others (handwritten ordinal, 0-1)
const dxEdgeSchema = new mongoose.Schema({
  diseaseId: String,
  findingId: String,
  frequency: { type: Number, default: 0.5 },
  evokingStrength: { type: Number, default: 0.3 },
  appliesWhen: { type: mongoose.Schema.Types.Mixed, default: null },
  negativePredictiveWindow: String,
  provenance: String,
}, { collection: 'dxedges' })

dxEdgeSchema.index({ diseaseId: 1, findingId: 1 }, { unique: true })
dxEdgeSchema.index({ findingId: 1 })

module.exports = mongoose.model('DxEdge', dxEdgeSchema)
