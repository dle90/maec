const mongoose = require('mongoose')

// Ophth-shaped appointment. Replaces the LinkRad radiology shape
// (modality enum CT/MRI/XR/US, studyId reference) with a free-form
// modality + examType drawn from the 4 documented exam workflows,
// and an encounterId link created when the patient checks in.
const appointmentSchema = new mongoose.Schema({
  _id: String,
  patientId: String,
  patientName: String,
  dob: String,
  gender: String,
  phone: String,
  guardianName: String,
  guardianPhone: String,
  site: { type: String, required: true },
  // Free-form examType drawn from CLAUDE.md's 4 documented workflows.
  // Drives default duration + colour coding on the calendar.
  examType: String,
  // Free-form modality kept for back-compat with the legacy public
  // booking router which still posts modality. Not required.
  modality: String,
  room: String,
  scheduledAt: String,        // ISO datetime — local time, no TZ suffix
  duration: { type: Number, default: 30 }, // minutes
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show'],
    default: 'scheduled',
  },
  // Reminder workflow. v1 is manual: staff calls/messages the patient,
  // then ticks "đã nhắc" which sets remindedAt/By + reminderStatus.
  // remindMethod (call/sms/zalo/other) is captured for the day SMS/Zalo
  // automation lands; until then it's just a free label.
  reminderStatus: {
    type: String,
    enum: ['pending', 'reminded', 'failed', 'skipped'],
    default: 'pending',
  },
  remindedAt: String,
  remindedBy: String,
  remindMethod: String,
  remindNote: String,
  // Set when the patient is checked in from the appointment card → encounter
  // is created (or reused, if idempotent) and appointment flips to 'arrived'.
  encounterId: String,
  // Legacy radiology field kept temporarily so older docs deserialize
  // cleanly; new appointments use encounterId.
  studyId: String,
  referringDoctor: String,
  sourceCode: String,
  sourceName: String,
  referralType: { type: String, enum: ['doctor', 'facility', 'salesperson', ''], default: '' },
  referralId: String,
  referralName: String,
  clinicalInfo: String,
  notes: String,
  cancelReason: String,
  cancelledAt: String,
  cancelledBy: String,
  createdBy: String,
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Appointment', appointmentSchema)
