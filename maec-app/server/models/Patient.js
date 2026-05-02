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
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Patient', patientSchema)
