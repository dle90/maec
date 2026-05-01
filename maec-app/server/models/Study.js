const mongoose = require('mongoose')

const studySchema = new mongoose.Schema({
  _id: String,
  studyUID: String,
  patientName: String,
  patientId: String,
  dob: String,
  gender: { type: String, enum: ['M', 'F'] },
  modality: { type: String, enum: ['CT', 'MRI', 'XR', 'US'] },
  bodyPart: String,
  clinicalInfo: String,
  site: String,
  scheduledDate: String,
  studyDate: String,
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'pending_read', 'reading', 'reported', 'verified', 'cancelled'],
    default: 'scheduled',
  },
  priority: {
    type: String,
    enum: ['routine', 'urgent', 'stat'],
    default: 'routine',
  },
  technician: String,
  technicianName: String,
  radiologist: String,
  radiologistName: String,
  assignedAt: String,
  reportId: String,
  reportText: { type: String, default: '' },
  reportedAt: String,
  verifiedAt: String,
  imageStatus: {
    type: String,
    enum: ['no_images', 'receiving', 'available'],
    default: 'no_images',
  },
  imageCount: { type: Number, default: 0 },
  consumables: {
    type: [{
      supplyId: String,
      supplyCode: String,
      supplyName: String,
      unit: String,
      standardQty: { type: Number, default: 0 },
      actualQty: { type: Number, default: 0 },
      notes: String,
    }],
    default: [],
  },
  consumablesDeductedAt: String,
  consumablesTransactionId: String,
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Study', studySchema)
