const express = require('express')
const crypto = require('crypto')
const router = express.Router()
const { requireAuth, requirePermission } = require('../middleware/auth')
const Department = require('../models/Department')
const RolePermission = require('../models/RolePermission')
const User = require('../models/User')
const { PERMISSIONS, PERMISSION_GROUPS } = require('../shared/permissions')

const now = () => new Date().toISOString()

// All HR routes require authentication
router.use(requireAuth)

// ═══════════════════════════════════════════════════════
// EMPLOYEES — backed by the User collection (login = HR record)
// ═══════════════════════════════════════════════════════

router.get('/employees', async (req, res) => {
  try {
    const { q, departmentId, status, site, limit = 100 } = req.query
    const filter = {}
    if (q) {
      const re = new RegExp(q, 'i')
      filter.$or = [{ displayName: re }, { _id: re }, { phone: re }, { email: re }]
    }
    if (departmentId) filter.departmentId = departmentId
    if (status) filter.employmentStatus = status
    if (site) filter.department = site
    const users = await User.find(filter).select('-password').sort({ _id: 1 }).limit(Number(limit)).lean()
    res.json(users)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/employees/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean()
    if (!user) return res.status(404).json({ error: 'Không tìm thấy nhân viên' })
    res.json(user)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/employees', requirePermission('hr.manage'), async (req, res) => {
  try {
    const { _id, password, displayName } = req.body
    if (!_id?.trim()) return res.status(400).json({ error: 'Mã nhân viên là bắt buộc' })
    if (!displayName?.trim()) return res.status(400).json({ error: 'Vui lòng nhập họ tên' })
    const existing = await User.findById(_id)
    if (existing) return res.status(400).json({ error: 'Mã nhân viên đã tồn tại' })
    const user = new User({
      ...req.body,
      _id: _id.trim(),
      password: password || _id.trim(),
      employmentStatus: req.body.employmentStatus || 'active',
    })
    await user.save()
    const result = user.toObject()
    delete result.password
    res.status(201).json({ ok: true, employee: result })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/employees/:id', requirePermission('hr.manage'), async (req, res) => {
  try {
    const update = { ...req.body }
    delete update._id
    if (!update.password) delete update.password  // don't overwrite password with empty
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password').lean()
    if (!user) return res.status(404).json({ error: 'Không tìm thấy nhân viên' })
    res.json({ ok: true, employee: user })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/employees/:id', requirePermission('hr.manage'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { employmentStatus: 'inactive' }, { new: true }).select('-password').lean()
    if (!user) return res.status(404).json({ error: 'Không tìm thấy nhân viên' })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════
// DEPARTMENTS
// ═══════════════════════════════════════════════════════

router.get('/departments', async (req, res) => {
  try {
    const { type, status, q } = req.query
    const filter = {}
    if (type) filter.type = type
    if (status) filter.status = status
    if (q) filter.name = new RegExp(q, 'i')
    const depts = await Department.find(filter).sort({ type: 1, code: 1 }).lean()
    res.json(depts)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/departments', requirePermission('hr.manage'), async (req, res) => {
  try {
    const { code, name, type, parentId, headUserId, headName, phone, address, description } = req.body
    if (!code || !name) return res.status(400).json({ error: 'Vui lòng nhập mã và tên phòng ban' })

    const dept = new Department({
      _id: crypto.randomUUID(),
      code, name, type: type || 'hq',
      parentId: parentId || '', headUserId: headUserId || '', headName: headName || '',
      phone: phone || '', address: address || '', description: description || '',
      status: 'active', createdAt: now(), updatedAt: now(),
    })
    await dept.save()
    res.status(201).json({ ok: true, department: dept.toObject() })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/departments/:id', requirePermission('hr.manage'), async (req, res) => {
  try {
    const update = { ...req.body, updatedAt: now() }
    delete update._id
    const dept = await Department.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!dept) return res.status(404).json({ error: 'Không tìm thấy phòng ban' })
    res.json({ ok: true, department: dept.toObject() })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/departments/:id', requirePermission('hr.manage'), async (req, res) => {
  try {
    const dept = await Department.findByIdAndUpdate(req.params.id, { status: 'inactive', updatedAt: now() }, { new: true })
    if (!dept) return res.status(404).json({ error: 'Không tìm thấy phòng ban' })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════
// ROLES & PERMISSIONS
// ═══════════════════════════════════════════════════════

router.get('/permissions', (req, res) => {
  res.json({ permissions: PERMISSIONS, groups: PERMISSION_GROUPS })
})

router.get('/roles', async (req, res) => {
  try {
    const roles = await RolePermission.find({}).sort({ _id: 1 }).lean()
    res.json(roles)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/roles/:roleId', requirePermission('system.admin'), async (req, res) => {
  try {
    const { permissions, label, description, scope } = req.body
    const update = { updatedAt: now() }
    if (permissions !== undefined) update.permissions = permissions
    if (label !== undefined) update.label = label
    if (description !== undefined) update.description = description
    if (scope !== undefined && ['group', 'site'].includes(scope)) update.scope = scope

    const role = await RolePermission.findByIdAndUpdate(req.params.roleId, update, { new: true })
    if (!role) return res.status(404).json({ error: 'Không tìm thấy vai trò' })
    res.json({ ok: true, role })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /hr/roles — create a new custom role
router.post('/roles', requirePermission('system.admin'), async (req, res) => {
  try {
    const { _id, label, description, scope, permissions } = req.body
    if (!_id || !label) return res.status(400).json({ error: 'Mã vai trò và tên hiển thị là bắt buộc' })
    if (!/^[a-z0-9_]+$/.test(_id)) return res.status(400).json({ error: 'Mã vai trò chỉ cho phép chữ thường, số và _' })
    const existing = await RolePermission.findById(_id).lean()
    if (existing) return res.status(400).json({ error: 'Mã vai trò đã tồn tại' })
    const role = new RolePermission({
      _id, label, description: description || '',
      scope: scope === 'site' ? 'site' : 'group',
      permissions: Array.isArray(permissions) ? permissions : [],
      isSystem: false,
      createdAt: now(), updatedAt: now(),
    })
    await role.save()
    res.status(201).json({ ok: true, role: role.toObject() })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /hr/roles/:roleId — delete a custom (non-system) role
router.delete('/roles/:roleId', requirePermission('system.admin'), async (req, res) => {
  try {
    const role = await RolePermission.findById(req.params.roleId).lean()
    if (!role) return res.status(404).json({ error: 'Không tìm thấy vai trò' })
    if (role.isSystem) return res.status(400).json({ error: 'Không thể xóa vai trò hệ thống' })
    // Refuse delete if any user still has this role assigned
    const inUse = await User.countDocuments({
      $or: [{ role: role._id }, { 'assignments.roleId': role._id }],
    })
    if (inUse > 0) return res.status(400).json({ error: `Vai trò đang được gán cho ${inUse} nhân viên — gỡ gán trước khi xóa` })
    await RolePermission.findByIdAndDelete(role._id)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /hr/users/:id/assignments — admin/HR can update a user's functional-role assignments
router.put('/users/:id/assignments', requirePermission('hr.manage'), async (req, res) => {
  try {
    const incoming = Array.isArray(req.body.assignments) ? req.body.assignments : []
    const cleaned = incoming
      .filter(a => a && typeof a.roleId === 'string' && a.roleId.trim())
      .map(a => ({ roleId: a.roleId.trim(), siteId: a.siteId || null }))
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { assignments: cleaned } },
      { new: true },
    ).select('-password').lean()
    if (!user) return res.status(404).json({ error: 'Không tìm thấy nhân viên' })
    res.json({ ok: true, user })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════
// USERS (for linking employees to accounts)
// ═══════════════════════════════════════════════════════

router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password').lean()
    res.json(users)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
