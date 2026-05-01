const mongoose = require('mongoose')

const mappingSchema = new mongoose.Schema({
  _id: String,
  serviceId: String,
  serviceCode: String,
  serviceName: String,
  supplyId: String,
  supplyCode: String,
  supplyName: String,
  quantity: { type: Number, default: 1 },
  unit: String,
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('SupplyServiceMapping', mappingSchema)
