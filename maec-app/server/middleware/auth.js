const { verify } = require('../routes/auth')

const requireAdmin = (req, res, next) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '')
  const session = token ? verify(token) : null
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ admin mới có quyền thực hiện thao tác này' })
  }
  req.user = session
  next()
}

// Any authenticated user (any role)
const requireAuth = (req, res, next) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '')
  const session = token ? verify(token) : null
  if (!session) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập' })
  }
  req.user = session  // { username, role, department, displayName }
  next()
}

// Patient portal auth (token.type === 'patient')
const requirePatient = (req, res, next) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '')
  const session = token ? verify(token) : null
  if (!session || session.type !== 'patient') {
    return res.status(401).json({ error: 'Vui lòng đăng nhập cổng bệnh nhân' })
  }
  req.patient = session  // { type: 'patient', patientId, phone }
  next()
}

// Partner portal auth (token.type === 'partner')
const requirePartner = (req, res, next) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '')
  const session = token ? verify(token) : null
  if (!session || session.type !== 'partner') {
    return res.status(401).json({ error: 'Vui lòng đăng nhập cổng đối tác' })
  }
  req.partner = session  // { type: 'partner', facilityId, accountId, displayName }
  next()
}

// ── Permission-based auth ────────────────────────────────
// Effective permissions are computed at login time and embedded in the token.
// If an older token predates the multi-role model, fall back to a DB lookup.

let _roleCache = {}
let _roleCacheTime = 0

async function getRolePerms(roleId) {
  if (Date.now() - _roleCacheTime > 300000) {
    const RolePermission = require('../models/RolePermission')
    const all = await RolePermission.find({}).lean()
    _roleCache = {}
    all.forEach(r => { _roleCache[r._id] = r.permissions || [] })
    _roleCacheTime = Date.now()
  }
  return _roleCache[roleId] || []
}

function userHasPermission(user, permKey) {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.permissions && Array.isArray(user.permissions)) {
    if (user.permissions.includes(permKey) || user.permissions.includes('system.admin')) return true
  }
  return false
}

function userHasPermissionAtSite(user, permKey, siteId) {
  if (!user) return false
  if (user.role === 'admin') return true
  // Group-wide perm (from legacy role or group-scope assignment) applies everywhere
  if (user.permissions?.includes('system.admin')) return true
  const sitePerms = user.sitePerms?.[siteId] || []
  if (sitePerms.includes(permKey)) return true
  // If perm was granted via group scope (not tied to a site), check global list too
  // Heuristic: perm is in permissions[] but the user has at least one group-scope grant.
  // Cheap approximation — if there's ANY site-specific entry for this perm, user must be at that site.
  const siteScopedPerms = new Set()
  Object.values(user.sitePerms || {}).forEach(arr => arr.forEach(p => siteScopedPerms.add(p)))
  if (user.permissions?.includes(permKey) && !siteScopedPerms.has(permKey)) return true
  return false
}

const requirePermission = (permKey) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Vui lòng đăng nhập' })
  if (userHasPermission(req.user, permKey)) return next()
  // Fallback for tokens issued before the new schema — refresh from DB
  const perms = await getRolePerms(req.user.role)
  if (perms.includes(permKey) || perms.includes('system.admin')) return next()
  return res.status(403).json({ error: 'Không có quyền thực hiện thao tác này' })
}

module.exports = {
  requireAdmin, requireAuth, requirePatient, requirePartner, requirePermission,
  userHasPermission, userHasPermissionAtSite,
}
