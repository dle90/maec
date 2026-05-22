const mongoose = require('mongoose')

// A file attached to an Encounter — PDF device reports, scanned forms, etc.
// The bytes live in Cloudflare R2; this collection holds only metadata.
const encounterAttachmentSchema = new mongoose.Schema({
  _id: String,                                  // ATT-<ts>-<rand>
  encounterId: { type: String, index: true },
  patientId: String,
  filename: String,                             // original filename, for display
  mimeType: String,
  size: Number,                                 // bytes
  // Storage backend + object key. 'r2' is the only backend today; the field
  // leaves room to migrate or mix later without a schema change.
  storage: { type: String, default: 'r2' },
  r2Key: String,
  uploadedBy: String,
  uploadedByName: String,
  uploadedAt: String,
}, { _id: false })

module.exports = mongoose.model('EncounterAttachment', encounterAttachmentSchema)
