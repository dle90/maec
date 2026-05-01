const mongoose = require('mongoose')

const encounterSchema = new mongoose.Schema({
  _id: String,
  studyUID: String,
  patientName: String,
  patientId: String,
  dob: String,
  gender: { type: String, enum: ['M', 'F'] },
  examType: String,
  modality: String,
  bodyPart: String,
  clinicalInfo: String,
  site: String,
  scheduledDate: String,
  studyDate: String,
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'pending_read', 'reading', 'reported', 'verified', 'completed', 'paid', 'cancelled'],
    default: 'scheduled',
  },
  paidAt: String,
  paidBy: String,
  paidByName: String,
  paidAmount: Number,
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

  packageCode: String,
  packageName: String,
  packageTier: String,

  assignedServices: {
    type: [{
      serviceCode: String,
      serviceName: String,
      status: { type: String, enum: ['pending', 'in_progress', 'done', 'skipped'], default: 'pending' },
      assignedTo: String,
      assignedToName: String,
      startedAt: String,
      completedAt: String,
      output: { type: mongoose.Schema.Types.Mixed, default: {} },
      coveredByEntitlement: { type: Boolean, default: false },
      entitlementId: String,
    }],
    default: [],
  },

  billItems: {
    type: [{
      kind: { type: String, enum: ['service', 'package', 'kinh', 'thuoc'] },
      code: String,
      name: String,
      qty: { type: Number, default: 1 },
      unitPrice: { type: Number, default: 0 },
      totalPrice: { type: Number, default: 0 },
      addedBy: String,
      addedAt: String,
      note: String,
    }],
    default: [],
  },

  billTotal: { type: Number, default: 0 },

  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Encounter', encounterSchema)
