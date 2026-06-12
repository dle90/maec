const mongoose = require('mongoose')

const dxTestSchema = new mongoose.Schema({
  _id: String,
  name: String,
  nameVi: String,
  services: [String],
  expensive: { type: Boolean, default: false },
  invasiveness: {
    type: String,
    enum: ['none', 'topical', 'invasive'],
    default: 'none',
  },
  availableInClinic: { type: Boolean, default: true },
  svcCode: String,
  producesFindings: [String],
  harmIfSkipped: { type: Number, default: 3 },
}, { _id: false, collection: 'dxtests' })

module.exports = mongoose.model('DxTest', dxTestSchema)
