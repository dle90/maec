const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema({
  ts:           { type: String, required: true, index: true },
  type:         { type: String, enum: ['critical_finding', 'system', 'message', 'task'], default: 'system' },
  severity:     { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  title:        String,
  message:      String,
  // Targeting — empty arrays mean "everyone with role(s)"
  toUsers:      [String],     // usernames
  toRoles:      [String],     // role names
  toSites:      [String],     // site names (department)
  // Linkage
  resource:     String,       // 'study' | 'report' | etc.
  resourceId:   String,
  // Read tracking
  readBy:       [String],     // usernames
  ackedBy:      [String],     // usernames who acknowledged
  createdBy:    String,
  createdAt:    String,
})

notificationSchema.index({ type: 1, ts: -1 })
notificationSchema.index({ severity: 1, ts: -1 })

module.exports = mongoose.model('Notification', notificationSchema)
