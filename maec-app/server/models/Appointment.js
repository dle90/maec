const mongoose = require('mongoose')

const appointmentSchema = new mongoose.Schema({
  _id: String,
  patientId: String,
  patientName: String,
  dob: String,
  gender: String,
  phone: String,
  site: { type: String, required: true },
  modality: { type: String, enum: ['CT', 'MRI', 'XR', 'US'], required: true },
  room: String,               // e.g. "Phòng CT 1"
  scheduledAt: String,        // ISO datetime string
  duration: { type: Number, default: 30 }, // minutes
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show'],
    default: 'scheduled',
  },
  referringDoctor: String,
  // Referral source attribution — captured at registration, used for revenue/KPI rollup.
  sourceCode: String,
  sourceName: String,
  referralType: { type: String, enum: ['doctor', 'facility', 'salesperson', ''], default: '' },
  referralId: String,
  referralName: String,
  clinicalInfo: String,
  notes: String,
  studyId: String,            // linked RIS study (set when appointment → in_progress)
  createdBy: String,
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Appointment', appointmentSchema)
