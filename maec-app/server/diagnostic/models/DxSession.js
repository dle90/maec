const mongoose = require('mongoose')

// Per-encounter diagnostic session: complaint in, ranked differential + red-flags
// + suggested next tests out. Mutated as observations are added during the exam.
// Clinician outcome captured at the end → training signal for v1.
const dxSessionSchema = new mongoose.Schema({
  _id: String,                  // dx_<random>
  patientId: String,
  encounterId: String,
  createdAt: String,
  updatedAt: String,

  // Input — structured complaint that drives the run.
  complaint: {
    text: String,
    eyeAffected: { type: String, enum: ['OD', 'OS', 'OU', 'unknown'], default: 'unknown' },
    onset: { type: String, enum: ['sudden', 'subacute', 'gradual', 'unknown'], default: 'unknown' },
    durationDays: Number,
    pain: { type: String, enum: ['none', 'mild', 'moderate', 'severe', 'unknown'], default: 'unknown' },
    redness: { type: String, enum: ['none', 'mild', 'moderate', 'severe', 'unknown'], default: 'unknown' },
    visionChange: { type: String, enum: ['none', 'mild', 'severe', 'lost', 'unknown'], default: 'unknown' },
    symptoms: [String],
    patientContext: {
      ageYears: Number,
      sex: { type: String, enum: ['M', 'F', 'unknown'], default: 'unknown' },
      isContactLensWearer: Boolean,
      recentTrauma: Boolean,
      recentIntraocularSurgeryOrInjection: Boolean,
      systemic: [String],
      medications: [String],
      familyHistory: [String],
    },
  },

  // Observations — findings added during the exam (test results entered live).
  // Each entry is independent + amendable. The ranker re-runs on each addition.
  observations: [{
    at: String,
    findingId: String,
    eye: { type: String, enum: ['OD', 'OS', 'OU', null], default: null },
    value: mongoose.Schema.Types.Mixed,
    unit: String,
    flag: String,
    measurementKey: String,   // set on a raw measurement row (e.g. 'sphere')
    derivedFrom: String,      // set on a derived finding row: "<testId>:<key>"
    enteredBy: String,
    source: { type: String, enum: ['manual', 'device', 'patient', 'import', 'derived'], default: 'manual' },
    amended: { type: Boolean, default: false },
    supersededBy: String,
  }],

  // Output — last computed differential + suggestions.
  redFlags: [{
    redFlagId: String,
    name: String,
    nameVi: String,
    urgency: String,
    services: [String],
    candidateDiseases: [String],
    actionGuidance: String,
    actionGuidanceEn: String,
    matchedBy: mongoose.Schema.Types.Mixed,
    triggeredAt: String,
    excludedAt: String,
    excludedBy: String,
    excludedReason: String,
  }],
  differential: [{
    diseaseId: String,
    name: String,
    nameVi: String,
    services: [String],
    score: Number,
    urgency: String,
    isRedFlagCandidate: { type: Boolean, default: false },
    supportingFindings: [String],
    refutingFindings: [String],
    summary: String,
    treatments: [String],   // treatment tokens (→ treatments.json vocab) for the outcome panel
  }],
  recommendedNextTests: [{
    testId: String,
    name: String,
    nameVi: String,
    expectedUtility: Number,
    availableInClinic: Boolean,
    rationale: String,
    svcCode: String,
    producesFindings: [String],                 // findings the test can record (categorical chips)
    measurements: mongoose.Schema.Types.Mixed,  // structured numeric/enum fields → per-eye entry (see DxTest.measurements)
  }],

  // Clinician outcome — closes the session, feeds v1 training.
  clinicianOutcome: {
    confirmedDiseaseId: String,
    confirmedDiseaseName: String,
    accepted: Boolean,
    rejected: Boolean,
    referred: Boolean,
    referredReason: String,
    selectedTreatments: [String],   // treatment tokens the clinician chose (→ treatments.json)
    notes: String,
    closedAt: String,
    closedBy: String,
  },

  engineVersion: { type: String, default: 'v0' },
  kbVersion: String,
  disclaimer: { type: String, default: 'Decision support only. A licensed clinician must confirm before acting on any output.' },
}, { _id: false, collection: 'dxsessions' })

dxSessionSchema.index({ patientId: 1, createdAt: -1 })
dxSessionSchema.index({ encounterId: 1 })

module.exports = mongoose.model('DxSession', dxSessionSchema)
