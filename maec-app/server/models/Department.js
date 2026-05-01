const mongoose = require('mongoose')

const departmentSchema = new mongoose.Schema({
  _id: String,
  code: { type: String, index: true },
  name: String,
  type: { type: String, enum: ['branch', 'hq'], default: 'hq' },
  parentId: String,
  headUserId: String,
  headName: String,
  phone: String,
  address: String,
  description: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Department', departmentSchema)
