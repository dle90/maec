const mongoose = require('mongoose')

const patientFeedbackSchema = new mongoose.Schema({
  _id: String,
  patientId: String,
  appointmentId: { type: String, index: true },
  rating: { type: Number, min: 1, max: 5 },
  comment: String,
  createdAt: String,
}, { _id: false })

module.exports = mongoose.model('PatientFeedback', patientFeedbackSchema)
