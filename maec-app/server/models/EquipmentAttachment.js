const mongoose = require('mongoose')

// A file attached to an Equipment row — vendor contract, quote, manual,
// service receipt, calibration cert. Bytes live in Cloudflare R2; this
// collection holds only metadata. Mirrors EncounterAttachment's shape.
const equipmentAttachmentSchema = new mongoose.Schema({
  _id: String,                                  // ATT-eq-<sha8>
  equipmentId: { type: String, index: true },
  filename: String,                             // Original filename, for display
  mimeType: String,
  size: Number,                                 // Bytes
  // What kind of doc this is — drives the icon/badge in the UI. Free-form;
  // common values: 'contract', 'quote', 'manual', 'service', 'calibration', 'other'.
  kind: { type: String, default: 'other' },
  storage: { type: String, default: 'r2' },
  r2Key: String,
  uploadedBy: String,
  uploadedByName: String,
  uploadedAt: String,
}, { _id: false })

module.exports = mongoose.model('EquipmentAttachment', equipmentAttachmentSchema)
