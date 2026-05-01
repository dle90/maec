const mongoose = require('mongoose')

const specialtySchema = new mongoose.Schema({
  _id: String,
  code: String,
  name: String,
  description: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Specialty', specialtySchema)
