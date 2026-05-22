// Encounter file attachments — upload/list/view/delete PDFs (and images)
// attached to an Encounter. Bytes are stored in Cloudflare R2; metadata in
// the EncounterAttachment collection. See lib/r2.js for the R2 config.

const express = require('express')
const crypto = require('crypto')
const multer = require('multer')
const router = express.Router()
const Encounter = require('../models/Encounter')
const EncounterAttachment = require('../models/EncounterAttachment')
const r2 = require('../lib/r2')
const { requireAuth } = require('../middleware/auth')

const now = () => new Date().toISOString()

// In-memory multipart parsing — file buffers go straight to R2, never to disk
// (Railway's filesystem is ephemeral anyway). 25 MB/file ceiling; clinic PDFs
// (device reports, scans) run roughly 0.3–5 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
})

// Original filename → safe segment for the R2 object key. The human-readable
// name is kept verbatim in the `filename` field; the key just needs to be clean.
const keySafe = (n) => (n || 'file').normalize('NFC').replace(/[^\w.\-]+/g, '_').slice(0, 120)

// POST /encounters/:id/attachments — upload one or more files (form field: files)
router.post('/encounters/:id/attachments', requireAuth, upload.array('files', 10), async (req, res) => {
  try {
    if (!r2.isConfigured()) {
      return res.status(503).json({ error: 'Lưu trữ tệp (Cloudflare R2) chưa được cấu hình' })
    }
    const enc = await Encounter.findById(req.params.id).lean()
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    const files = req.files || []
    if (!files.length) return res.status(400).json({ error: 'Không có tệp nào được tải lên' })

    const created = []
    for (const f of files) {
      const attId = `ATT-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
      const key = `encounters/${req.params.id}/${attId}/${keySafe(f.originalname)}`
      await r2.putObject(key, f.buffer, f.mimetype || 'application/octet-stream')
      const doc = {
        _id: attId,
        encounterId: req.params.id,
        patientId: enc.patientId || '',
        filename: f.originalname,
        mimeType: f.mimetype || 'application/octet-stream',
        size: f.size,
        storage: 'r2',
        r2Key: key,
        uploadedBy: req.user.username,
        uploadedByName: req.user.displayName || req.user.username,
        uploadedAt: now(),
      }
      await EncounterAttachment.create(doc)
      created.push(doc)
    }
    res.status(201).json({ attachments: created })
  } catch (err) {
    console.error('attachment upload error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /encounters/:id/attachments — list metadata for an encounter
router.get('/encounters/:id/attachments', requireAuth, async (req, res) => {
  try {
    const list = await EncounterAttachment.find({ encounterId: req.params.id })
      .sort({ uploadedAt: 1 }).lean()
    res.json(list)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /attachments/:id/url — short-lived presigned R2 URL to view/download.
// A new browser tab can't carry our Bearer token, so we hand back a
// self-authorizing R2 URL. ?download=1 forces a download over inline view.
router.get('/attachments/:id/url', requireAuth, async (req, res) => {
  try {
    if (!r2.isConfigured()) {
      return res.status(503).json({ error: 'Lưu trữ tệp (Cloudflare R2) chưa được cấu hình' })
    }
    const att = await EncounterAttachment.findById(req.params.id).lean()
    if (!att) return res.status(404).json({ error: 'Không tìm thấy tệp' })
    const url = await r2.presignGet(att.r2Key, {
      filename: att.filename,
      contentType: att.mimeType,
      inline: !req.query.download,
    })
    res.json({ url })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /attachments/:id — remove the R2 object + the metadata row
router.delete('/attachments/:id', requireAuth, async (req, res) => {
  try {
    const att = await EncounterAttachment.findById(req.params.id).lean()
    if (!att) return res.status(404).json({ error: 'Không tìm thấy tệp' })
    if (r2.isConfigured()) {
      try { await r2.deleteObject(att.r2Key) } catch (e) { console.error('R2 delete failed:', e.message) }
    }
    await EncounterAttachment.deleteOne({ _id: att._id })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
