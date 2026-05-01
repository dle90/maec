const mongoose = require('mongoose')

const thuocSchema = new mongoose.Schema({
  _id: String,
  code: { type: String, unique: true },
  name: String,
  category: { type: String, enum: ['drops', 'oral', 'accessory'], default: 'drops' },
  brand: String,
  spec: String,
  importPrice: { type: Number, default: 0 },
  sellPrice: { type: Number, default: 0 },
  needsRx: { type: Boolean, default: true },
  description: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Thuoc', thuocSchema)
