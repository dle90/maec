const mongoose = require('mongoose')

// Treatment vocabulary — maps the free-form treatment tokens on DxDisease.treatments
// to a Vietnamese label + a category for grouped display in the outcome panel.
// Authored in kb/treatments.json; read-only (the seeder is the write path).
const dxTreatmentSchema = new mongoose.Schema({
  _id: String,        // token, e.g. "minus_spectacles"
  name: String,       // optional English label
  nameVi: String,     // Vietnamese label shown to the clinician
  category: {
    type: String,
    enum: ['spectacles', 'contact_lens', 'optical_other', 'surgery', 'laser',
           'injection', 'procedure', 'medication', 'systemic', 'referral',
           'lifestyle', 'monitoring', 'supportive'],
  },
  note: String,
}, { _id: false, collection: 'dxtreatments' })

module.exports = mongoose.model('DxTreatment', dxTreatmentSchema)
