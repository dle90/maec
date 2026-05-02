const mongoose = require('mongoose')

const kinhSchema = new mongoose.Schema({
  _id: String,
  code: { type: String, unique: true },
  name: String,
  category: { type: String, enum: ['gong', 'trong', 'ktx', 'ortho-k', 'phu-kien'], default: 'phu-kien' },
  // Sub-type, primarily for category='ortho-k' (Standard / Toric / Customized).
  // Packages bundle by type instead of specific SKU; the actual SKU is picked
  // at billing time. Free-form so the clinic can introduce new types later.
  kinhType: String,
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
