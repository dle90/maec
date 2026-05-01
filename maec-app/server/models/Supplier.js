const mongoose = require('mongoose')

const supplierSchema = new mongoose.Schema({
  _id: String,
  code: String,
  name: String,
  contactPerson: String,
  phone: String,
  email: String,
  address: String,
  taxCode: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Supplier', supplierSchema)
