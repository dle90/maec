const mongoose = require('mongoose')

const patientAccountSchema = new mongoose.Schema({
  _id: String,
  patientId: String,
  phone: { type: String, index: true, unique: true },
  dob: String,
  idCardLast4: String,
  lastLoginAt: String,
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('PatientAccount', patientAccountSchema)
