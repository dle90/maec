const express = require('express')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const User = require('../models/User')
const RolePermission = require('../models/RolePermission')

const router = express.Router()
// Phase 0: signing secret should come from the environment. The literal is a
// last-resort fallback so a deploy never crashes if the env var is missing — it
// is removed once SESSION_SECRET is set + rotated in Railway (a deliberate
// off-hours step, since rotating invalidates all live tokens). See
// docs/prod-upgrade-plan.md Phase 0.
const SECRET = process.env.SESSION_SECRET || (() => {
  console.warn('[auth] SESSION_SECRET not set — using insecure built-in default. Set it in Railway and rotate.')
  return 'maec-secret-2026'
})()
const BCRYPT_ROUNDS = 10
const TOKEN_TTL_SEC = Number(process.env.AUTH_TOKEN_TTL_SEC) || 12 * 3600 // 12h

const isHashed = (s) => typeof s === 'string' && /^\$2[aby]\$/.test(s)

// Stateless HMAC-signed tokens — survive server restarts. Now time-bounded:
// iat/exp are stamped at sign time and enforced in verify() (legacy tokens with
// no exp are grandfathered so this rolls out with zero forced logout).
const sign = (payload) => {
  const now = Math.floor(Date.now() / 1000)
  const body = { ...payload, iat: now, exp: now + TOKEN_TTL_SEC }
  const data = Buffer.from(JSON.stringify(body)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

const verify = (token) => {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const data = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
    // Constant-time compare on equal-length buffers
    const sigBuf = Buffer.from(sig)
    const expBuf = Buffer.from(expected)
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (parsed.exp && Math.floor(Date.now() / 1000) > parsed.exp) return null // expired
    return parsed
  } catch { return null }
}

// Compute effective permissions + sites for a user by unioning permissions from
// the legacy `role` field and every entry in `assignments[]`. Group-scope roles
// grant their perms everywhere; site-scope roles grant their perms only at that
// siteId (but the union here is the full set — route-level code enforces site).
async function computeEffective(user) {
  const roleIds = new Set()
  if (user.role) roleIds.add(user.role)
  ;(user.assignments || []).forEach(a => { if (a?.roleId) roleIds.add(a.roleId) })
  const roles = await RolePermission.find({ _id: { $in: [...roleIds] } }).lean()
  const permissions = new Set()
  const groupPerms = new Set() // perms granted everywhere (from group-scope roles)
  const sitePerms = {} // { siteId: Set<permKey> }
  for (const r of roles) {
    const myScope = r.scope || 'group'
    // For the legacy `role` field or group-scope assignment, perms apply everywhere
    const appliesEverywhere =
      r._id === user.role || (user.assignments || []).some(a => a.roleId === r._id && (!a.siteId || myScope === 'group'))
    if (appliesEverywhere) {
      for (const p of r.permissions || []) { permissions.add(p); groupPerms.add(p) }
    }
    // For each site-scope assignment at a specific siteId, track perms per site
    for (const a of user.assignments || []) {
      if (a.roleId === r._id && a.siteId) {
        sitePerms[a.siteId] = sitePerms[a.siteId] || new Set()
        for (const p of r.permissions || []) { permissions.add(p); sitePerms[a.siteId].add(p) }
      }
    }
  }
  // Union of all sites the user has any site-scope role at + their primary department
  const sites = new Set()
  if (user.department) sites.add(user.department)
  Object.keys(sitePerms).forEach(s => sites.add(s))
  return {
    permissions: [...permissions],
    groupPerms: [...groupPerms],
    sitePerms: Object.fromEntries(Object.entries(sitePerms).map(([k, v]) => [k, [...v]])),
    sites: [...sites],
  }
}

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    const user = await User.findById(username)
    if (!user) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' })
    }
    if (user.employmentStatus === 'inactive' || user.employmentStatus === 'resigned') {
      return res.status(403).json({ error: 'Tài khoản đã bị vô hiệu hóa' })
    }
    // bcrypt for hashed passwords; legacy plaintext is compared directly and
    // lazily re-hashed on the first successful login (zero-downtime migration).
    let ok = false
    if (isHashed(user.password)) {
      ok = await bcrypt.compare(password || '', user.password)
    } else {
      ok = !!password && user.password === password
      if (ok) {
        user.password = await bcrypt.hash(password, BCRYPT_ROUNDS)
        await user.save()
      }
    }
    if (!ok) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' })
    }
    const eff = await computeEffective(user)
    const session = {
      username, role: user.role,
      department: user.department || null,
      departmentId: user.departmentId || null,
      displayName: user.displayName || username,
      assignments: user.assignments || [],
      permissions: eff.permissions,
      sites: eff.sites,
      sitePerms: eff.sitePerms,
    }
    const token = sign(session)
    res.json({ token, expiresAt: Date.now() + TOKEN_TTL_SEC * 1000, ...session })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/logout', (req, res) => {
  // Stateless — client discards the token
  res.json({ ok: true })
})

// POST /auth/users — admin only: create or update a user
router.post('/users', async (req, res) => {
  try {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '')
    const session = token ? verify(token) : null
    if (!session || session.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' })
    }
    const { username, password, role, department, displayName } = req.body
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'username, password, role required' })
    }
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const user = await User.findByIdAndUpdate(
      username,
      { _id: username, password: hashed, role, department: department || null, displayName: displayName || username },
      { upsert: true, new: true }
    )
    res.json({ ok: true, user: { username: user._id, role: user.role, displayName: user.displayName } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /auth/users — admin only: list all users
router.get('/users', async (req, res) => {
  try {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '')
    const session = token ? verify(token) : null
    if (!session || session.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' })
    }
    const users = await User.find({}).select('-password')
    res.json(users)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = { router, sign, verify, computeEffective }
