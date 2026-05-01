const mongoose = require('mongoose')

const cancelReasonSchema = new mongoose.Schema({
  _id: String,
  code: String,
  name: String,
  type: { type: String, enum: ['import', 'export'], default: 'import' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('CancelReason', cancelReasonSchema)
