const mongoose = require('mongoose')

const supplyCategorySchema = new mongoose.Schema({
  _id: String,
  code: String,
  name: String,
  parentId: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('SupplyCategory', supplyCategorySchema)
