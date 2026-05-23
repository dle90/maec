// Equipment module — CRUD on Equipment + per-equipment file attachments
// (contracts, quotes, manuals, service receipts). Attachment bytes go to
// Cloudflare R2; metadata in EquipmentAttachment. Mirrors routes/attachments.js
// for the file half so the client component pattern stays identical.

const express = require('express')
const crypto = require('crypto')
const multer = require('multer')
const router = express.Router()
const Equipment = require('../models/Equipment')
const EquipmentAttachment = require('../models/EquipmentAttachment')
const r2 = require('../lib/r2')
const { requireAuth, requireAdmin } = require('../middleware/auth')

const now = () => new Date().toISOString()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
})

const keySafe = (n) => (n || 'file').normalize('NFC').replace(/[^\w.\-]+/g, '_').slice(0, 120)

// ─── Equipment CRUD ─────────────────────────────────────────────────

// GET /equipment — list with optional filters
router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.siteId) filter.siteId = req.query.siteId
    if (req.query.category) filter.category = req.query.category
    if (req.query.status) filter.status = req.query.status
    if (req.query.q) {
      const rx = { $regex: req.query.q, $options: 'i' }
      filter.$or = [{ name: rx }, { model: rx }, { manufacturer: rx }, { code: rx }]
    }
    const items = await Equipment.find(filter).sort({ siteId: 1, category: 1, code: 1 }).lean()
    res.json(items)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /equipment/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const item = await Equipment.findById(req.params.id).lean()
    if (!item) return res.status(404).json({ error: 'Không tìm thấy thiết bị' })
    res.json(item)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /equipment — create. _id defaults to body.code.
router.post('/', requireAdmin, async (req, res) => {
  try {
    const body = { ...req.body }
    if (!body.code) return res.status(400).json({ error: 'Thiếu mã thiết bị (code)' })
    body._id = body._id || body.code
    body.createdAt = body.createdAt || now()
    body.updatedAt = now()
    const created = await Equipment.create(body)
    res.status(201).json(created)
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Mã thiết bị đã tồn tại' })
    res.status(500).json({ error: err.message })
  }
})

// PUT /equipment/:id
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const body = { ...req.body, updatedAt: now() }
    delete body._id
    const updated = await Equipment.findByIdAndUpdate(req.params.id, { $set: body }, { new: true }).lean()
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy thiết bị' })
    res.json(updated)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /equipment/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await Equipment.findByIdAndDelete(req.params.id).lean()
    if (!deleted) return res.status(404).json({ error: 'Không tìm thấy thiết bị' })
    // Leave attachments behind (orphan). UI can show them or you can wipe via
    // a separate script — but auto-deleting R2 objects from a DELETE call is
    // a footgun for restoration.
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Equipment attachments ──────────────────────────────────────────
// Same shape as routes/attachments.js for encounters, just scoped to equipment.

// POST /equipment/:id/attachments — upload (form field: files; optional ?kind=)
router.post('/:id/attachments', requireAuth, upload.array('files', 10), async (req, res) => {
  try {
    if (!r2.isConfigured()) {
      return res.status(503).json({ error: 'Lưu trữ tệp (Cloudflare R2) chưa được cấu hình' })
    }
    const eq = await Equipment.findById(req.params.id).lean()
    if (!eq) return res.status(404).json({ error: 'Không tìm thấy thiết bị' })
    const files = req.files || []
    if (!files.length) return res.status(400).json({ error: 'Không có tệp nào được tải lên' })

    const kind = (req.query.kind || req.body?.kind || 'other').toString().slice(0, 32)
    const created = []
    for (const f of files) {
      const attId = `ATT-eq-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
      const key = `equipment/${req.params.id}/${attId}/${keySafe(f.originalname)}`
      await r2.putObject(key, f.buffer, f.mimetype || 'application/octet-stream')
      const doc = {
        _id: attId,
        equipmentId: req.params.id,
        filename: f.originalname,
        mimeType: f.mimetype || 'application/octet-stream',
        size: f.size,
        kind,
        storage: 'r2',
        r2Key: key,
        uploadedBy: req.user.username,
        uploadedByName: req.user.displayName || req.user.username,
        uploadedAt: now(),
      }
      await EquipmentAttachment.create(doc)
      created.push(doc)
    }
    res.status(201).json({ attachments: created })
  } catch (err) {
    console.error('equipment attachment upload error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /equipment/:id/attachments
router.get('/:id/attachments', requireAuth, async (req, res) => {
  try {
    const list = await EquipmentAttachment.find({ equipmentId: req.params.id })
      .sort({ uploadedAt: 1 }).lean()
    res.json(list)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /equipment-attachments/:id/url — presigned R2 view URL
// Mounted at /api/equipment-attachments/* via index.js — kept separate so the
// path doesn't collide with /api/equipment/:id/attachments above.
const attRouter = express.Router()

attRouter.get('/:id/url', requireAuth, async (req, res) => {
  try {
    if (!r2.isConfigured()) {
      return res.status(503).json({ error: 'Lưu trữ tệp (Cloudflare R2) chưa được cấu hình' })
    }
    const att = await EquipmentAttachment.findById(req.params.id).lean()
    if (!att) return res.status(404).json({ error: 'Không tìm thấy tệp' })
    const url = await r2.presignGet(att.r2Key, {
      filename: att.filename,
      contentType: att.mimeType,
      inline: !req.query.download,
    })
    res.json({ url })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

attRouter.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const att = await EquipmentAttachment.findById(req.params.id).lean()
    if (!att) return res.status(404).json({ error: 'Không tìm thấy tệp' })
    if (r2.isConfigured()) {
      try { await r2.deleteObject(att.r2Key) } catch (e) { console.error('R2 delete failed:', e.message) }
    }
    await EquipmentAttachment.deleteOne({ _id: att._id })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = { router, attRouter }
