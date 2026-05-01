const mongoose = require('mongoose')

const auditLogSchema = new mongoose.Schema({
  ts:         { type: String, required: true, index: true },  // ISO timestamp
  userId:     String,
  username:   String,
  role:       String,
  method:     String,    // GET / POST / PUT / DELETE
  path:       String,    // request URL path
  resource:   String,    // friendly resource name (derived from path)
  resourceId: String,    // primary key from req.params.id (if any)
  status:     Number,    // HTTP status returned
  ip:         String,
  userAgent:  String,
  payload:    mongoose.Schema.Types.Mixed,   // sanitized req.body for writes
}, { _id: true })

auditLogSchema.index({ username: 1, ts: -1 })
auditLogSchema.index({ resource: 1, ts: -1 })

module.exports = mongoose.model('AuditLog', auditLogSchema)
