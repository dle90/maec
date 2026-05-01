const mongoose = require('mongoose')

const rolePermissionSchema = new mongoose.Schema({
  _id: String,           // role name: 'admin', 'bacsi', 'letan', etc.
  label: String,         // display name: 'Admin', 'Bác sĩ', 'Lễ tân'
  description: String,
  // 'group' → role applies org-wide; 'site' → role is site-scoped (assignment must carry siteId)
  scope: { type: String, enum: ['group', 'site'], default: 'group' },
  permissions: [String], // array of permission keys
  // Seeded roles should not be deletable via UI. Custom roles (created by admin) have this false.
  isSystem: { type: Boolean, default: false },
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('RolePermission', rolePermissionSchema)
