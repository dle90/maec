const mongoose = require('mongoose')

const serviceSchema = new mongoose.Schema({
  _id: String,
  code: { type: String, unique: true },
  name: String,
  category: { type: String },
  station: String,
  role: String,
  devices: { type: [String], default: [] },
  basePrice: { type: Number, default: 0 },
  unit: { type: String, default: 'lần' },
  description: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Service', serviceSchema)
