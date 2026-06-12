const mongoose = require('mongoose')

const dxServiceSchema = new mongoose.Schema({
  _id: String,
  name: String,
  nameVi: String,
  plane: { type: String, enum: ['data', 'cross', 'support'] },
  color: String,
  oneLineJob: String,
  components: [String],
  cascadesTo: [{
    service: String,
    relation: String,
    mechanism: String,
    exampleDisease: String,
  }],
}, { _id: false, collection: 'dxservices' })

module.exports = mongoose.model('DxService', dxServiceSchema)
