const mongoose = require('mongoose')

const partnerReferralSchema = new mongoose.Schema({
  _id: String,
  facilityId: String,
  partnerAccountId: String,
  patientName: String,
  patientPhone: String,
  patientDob: String,
  patientGender: { type: String, enum: ['M', 'F', 'other'] },
  patientIdCard: String,
  requestedServiceId: String,
  requestedServiceName: String,
  modality: String,
  site: String,
  clinicalInfo: String,
  notes: String,
  status: { type: String, enum: ['pending', 'accepted', 'appointment_created', 'completed', 'cancelled'], default: 'pending' },
  appointmentId: String,
  studyId: String,
  patientId: String,
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('PartnerReferral', partnerReferralSchema)
