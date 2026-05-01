const mongoose = require('mongoose')

const kinhSchema = new mongoose.Schema({
  _id: String,
  code: { type: String, unique: true },
  name: String,
  category: { type: String, enum: ['gong', 'trong', 'ktx', 'phu-kien'], default: 'phu-kien' },
  brand: String,
  spec: String,
  importPrice: { type: Number, default: 0 },
  sellPrice: { type: Number, default: 0 },
  description: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Kinh', kinhSchema)
