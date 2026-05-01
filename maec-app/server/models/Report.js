const mongoose = require('mongoose')

const reportSchema = new mongoose.Schema({
  studyId:           { type: String, required: true },
  studyUID:          String,
  radiologistId:     String,
  radiologistName:   String,
  status:            { type: String, enum: ['draft', 'preliminary', 'final'], default: 'draft' },
  technique:         { type: String, default: '' },
  clinicalInfo:      { type: String, default: '' },
  findings:          { type: String, default: '' },
  impression:        { type: String, default: '' },
  recommendation:    { type: String, default: '' },
  // Critical findings escalation
  criticalFinding:   { type: Boolean, default: false },
  criticalNote:      { type: String, default: '' },
  criticalAckedBy:   String,        // username of staff who acknowledged the alert
  criticalAckedAt:   String,
  templateUsedId:    String,        // ReportTemplate id, if any
  // Co-signers (radiologist signs implicitly via finalizedAt; tech signs separately)
  technicianSignerId:    String,
  technicianSignerName:  String,
  technicianSignedAt:    String,
  // Snapshotted signature image URLs at finalize/sign time (so later profile changes don't alter past reports)
  radiologistSignatureUrl: String,
  technicianSignatureUrl:  String,
  createdAt:         String,
  updatedAt:         String,
  finalizedAt:       String,
})

module.exports = mongoose.model('Report', reportSchema)
