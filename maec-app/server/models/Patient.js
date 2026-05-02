const mongoose = require('mongoose')

const patientSchema = new mongoose.Schema({
  _id: String,
  patientId: String,          // BN-YYYYMMDD-seq (display ID)
  name: { type: String, required: true },
  phone: String,
  email: String,
  dob: String,                // YYYY-MM-DD
  gender: { type: String, enum: ['M', 'F', 'other'] },
  idCard: String,             // CMND/CCCD
  insuranceNumber: String,    // Mã BHYT
  province: String,           // Tỉnh/Thành phố
  district: String,           // Quận/huyện
  ward: String,               // Phường/Xã
  address: String,
  // Guardian / parent — relevant for kids; falls back to here when patient.phone is empty
  guardianName: String,
  guardianPhone: String,
  guardianRelation: String,   // mẹ / bố / ông / bà / người thân / ...
  registeredSite: String,     // site where first registered
  // Referral source — last-known value on patient; per-visit truth lives on Appointment.
  sourceCode: String,
  sourceName: String,
  referralType: { type: String, enum: ['doctor', 'facility', 'salesperson', ''], default: '' },
  referralId: String,
  referralName: String,
  notes: String,
  // Denormalized timestamp of the patient's most recent Encounter — updated by
  // the check-in flow. Powers the "last encounter" filter on the Bệnh Nhân
  // catalog without needing an aggregation per row.
  lastEncounterAt: String,
  createdAt: String,
  updatedAt: String,
}, { _id: false })

// Indexes — required to scale the Bệnh nhân list past ~1k rows. Each filter
// the catalog UI exposes (gender, age range via dob, createdAt range,
// lastEncounterAt range) plus the default sort needs an index. Search regex
// fields (name/phone/patientId/idCard/guardianName/guardianPhone) can't use
// indexes for partial matches, but `name` gets one anyway since exact-match
// dedup checks rely on it.
patientSchema.index({ createdAt: -1 })
patientSchema.index({ name: 1 })
patientSchema.index({ phone: 1 })
patientSchema.index({ patientId: 1 })
patientSchema.index({ guardianPhone: 1 })
patientSchema.index({ dob: 1 })
patientSchema.index({ gender: 1 })
patientSchema.index({ lastEncounterAt: -1 })
patientSchema.index({ registeredSite: 1 })

module.exports = mongoose.model('Patient', patientSchema)
