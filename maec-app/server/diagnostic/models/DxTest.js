const mongoose = require('mongoose')

// A structured numeric/enum output field of a test (e.g. refraction sphere,
// IOP, Schirmer mm). The clinician types the raw value; `derives` rules turn it
// into the categorical findings the engine reasons over. See engine/deriveFindings.js.
const measurementSchema = new mongoose.Schema({
  key: String,                 // stable id within the test: "sphere","cyl","axis","se","iop","va_decimal"…
  label: String,
  labelVi: String,
  unit: String,                // display-only, fixed per field: "D","mmHg","decimal","µm","mm","s","dB"…
  valueType: {
    type: String,
    enum: ['number', 'enum', 'boolean', 'computed'],
    default: 'number',
  },
  compute: { type: String, default: null },   // named formula for valueType:'computed' (e.g. 'spherical_equivalent') — no eval
  computeFrom: [String],                       // input keys the formula reads, e.g. ['sphere','cyl']
  perEye: { type: Boolean, default: true },    // false = binocular / systemic (ESR, stereopsis)
  input: { type: Boolean, default: true },     // false = not directly typed (computed/derived-only)
  min: Number,
  max: Number,
  step: Number,
  enumOptions: [String],                       // valueType:'enum' only
  derives: [{
    op: { type: String, enum: ['<', '<=', '>', '>=', '==', 'between', 'abs>=', 'abs<='] },
    value: mongoose.Schema.Types.Mixed,        // for <=,>=,==,abs>=,abs<=
    lo: Number,                                 // for between
    hi: Number,                                 // for between
    finding: String,                            // derived finding _id emitted when the rule matches
  }],
}, { _id: false })

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
  measurements: [measurementSchema],
  harmIfSkipped: { type: Number, default: 3 },
}, { _id: false, collection: 'dxtests' })

module.exports = mongoose.model('DxTest', dxTestSchema)
