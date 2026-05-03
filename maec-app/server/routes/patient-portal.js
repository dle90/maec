const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const { sign } = require('./auth')
const { requirePatient } = require('../middleware/auth')
const Patient = require('../models/Patient')
const PatientAccount = require('../models/PatientAccount')
const Encounter = require('../models/Encounter')
const PatientFeedback = require('../models/PatientFeedback')

const now = () => new Date().toISOString()

// Net paid across the payments[] ledger (positive payments minus refunds).
// Mirrors the helper used by Khám / Thu Ngân pages.
function netPaid(enc) {
  let sum = 0
  for (const p of (enc.payments || [])) sum += (p.kind === 'refund' ? -1 : 1) * (p.amount || 0)
  return Math.max(0, sum)
}
function effectiveDiscount(enc) {
  const subtotal = enc.billTotal || 0
  const pct = enc.discountPercent || 0
  if (pct > 0) return Math.round(subtotal * pct / 100)
  return enc.discountAmount || 0
}
function grandTotal(enc) {
  return Math.max(0, (enc.billTotal || 0) - effectiveDiscount(enc))
}

// ── Public: patient login (phone + dob) ─────────────────
router.post('/login', async (req, res) => {
  try {
    const { phone, dob } = req.body
    if (!phone || !dob) {
      return res.status(400).json({ error: 'Vui lòng nhập số điện thoại và ngày sinh' })
    }
    const patient = await Patient.findOne({ phone }).lean()
    if (!patient) {
      return res.status(401).json({ error: 'Không tìm thấy bệnh nhân với số điện thoại này' })
    }
    if (patient.dob !== dob) {
      return res.status(401).json({ error: 'Ngày sinh không đúng' })
    }
    await PatientAccount.findOneAndUpdate(
      { phone },
      {
        $setOnInsert: { _id: crypto.randomUUID(), patientId: patient._id, phone, dob: patient.dob, idCardLast4: (patient.idCard || '').slice(-4), createdAt: now() },
        $set: { lastLoginAt: now(), updatedAt: now() },
      },
      { upsert: true }
    )
    const token = sign({ type: 'patient', patientId: patient._id, phone })
    res.json({ token, patientName: patient.name, phone: patient.phone })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Protected: patient profile ──────────────────────────
router.get('/profile', requirePatient, async (req, res) => {
  try {
    const patient = await Patient.findById(req.patient.patientId).lean()
    if (!patient) return res.status(404).json({ error: 'Không tìm thấy bệnh nhân' })
    res.json({
      name: patient.name, phone: patient.phone, dob: patient.dob,
      gender: patient.gender, address: patient.address,
      patientId: patient.patientId || patient._id,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Protected: visit history (encounter list, summary view) ─────────────────
// One row per Encounter for this patient. Compact: counts + bill totals only;
// full clinical detail (service outputs, bill items, payments ledger) lives
// behind GET /visits/:encounterId. Sorted newest first.
router.get('/visits', requirePatient, async (req, res) => {
  try {
    const patientId = req.patient.patientId
    const encounters = await Encounter.find({ patientId })
      .sort({ createdAt: -1 })
      .lean()
    const ids = encounters.map(e => e._id)
    const feedbacks = await PatientFeedback.find({ encounterId: { $in: ids } }).lean()
    const fbByEnc = {}
    for (const f of feedbacks) fbByEnc[f.encounterId] = f

    const visits = encounters.map(e => {
      const subtotal = e.billTotal || 0
      const disc = effectiveDiscount(e)
      const grand = grandTotal(e)
      const paid = netPaid(e)
      const services = e.assignedServices || []
      const doneCount = services.filter(s => s.status === 'done').length
      const hasResults =
        !!(e.conclusion && e.conclusion.trim()) ||
        services.some(s => s.status === 'done' && s.output && Object.keys(s.output).length > 0)
      const fb = fbByEnc[e._id]
      return {
        encounterId: e._id,
        date: e.createdAt,
        site: e.site || '',
        examType: e.examType || '',
        status: e.status,
        clinicalInfo: e.clinicalInfo || '',
        packages: (e.packages || []).map(p => ({ code: p.code, name: p.name, tier: p.tier })),
        servicesSummary: { total: services.length, done: doneCount },
        hasResults,
        bill: {
          subtotal,
          discountAmount: disc,
          discountPercent: e.discountPercent || 0,
          grandTotal: grand,
          paidAmount: paid,
          remaining: Math.max(0, grand - paid),
        },
        feedback: fb ? { rating: fb.rating, comment: fb.comment } : null,
      }
    })
    res.json(visits)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Protected: visit detail (full clinical + bill + payments) ───────────────
// Patient must own the encounter. Shape matches what the print "Phiếu Khám"
// and "Phiếu Thu" surface internally, minus admin-only fields.
router.get('/visits/:encounterId', requirePatient, async (req, res) => {
  try {
    const enc = await Encounter.findById(req.params.encounterId).lean()
    if (!enc || enc.patientId !== req.patient.patientId) {
      return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    }
    const subtotal = enc.billTotal || 0
    const disc = effectiveDiscount(enc)
    const grand = grandTotal(enc)
    const paid = netPaid(enc)
    res.json({
      encounterId: enc._id,
      date: enc.createdAt,
      site: enc.site || '',
      status: enc.status,
      examType: enc.examType || '',
      clinicalInfo: enc.clinicalInfo || '',
      presentIllness: enc.presentIllness || '',
      pastHistory: enc.pastHistory || '',
      diagnosis: enc.diagnosis || '',
      conclusion: enc.conclusion || '',
      packages: (enc.packages || []).map(p => ({ code: p.code, name: p.name, tier: p.tier })),
      services: (enc.assignedServices || []).map(s => ({
        code: s.serviceCode,
        name: s.serviceName,
        status: s.status,
        completedAt: s.completedAt,
        output: s.output || {},
      })),
      bill: {
        items: (enc.billItems || []).map(b => ({
          kind: b.kind, code: b.code, name: b.name,
          qty: b.qty || 1, unitPrice: b.unitPrice || 0, totalPrice: b.totalPrice || 0,
        })),
        subtotal,
        discountAmount: disc,
        discountPercent: enc.discountPercent || 0,
        discountReason: enc.discountReason || '',
        grandTotal: grand,
        paidAmount: paid,
        remaining: Math.max(0, grand - paid),
      },
      payments: (enc.payments || []).map(p => ({
        at: p.at, amount: p.amount || 0, method: p.method || '',
        kind: p.kind || 'payment', byName: p.byName || p.by || '',
      })),
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Protected: submit feedback for an encounter ─────────────────────────────
// Idempotent — re-submitting the same encounterId updates the existing entry.
router.post('/feedback', requirePatient, async (req, res) => {
  try {
    const { encounterId, rating, comment } = req.body
    if (!encounterId || !rating) {
      return res.status(400).json({ error: 'Vui lòng chọn đánh giá' })
    }
    const enc = await Encounter.findById(encounterId).lean()
    if (!enc || enc.patientId !== req.patient.patientId) {
      return res.status(403).json({ error: 'Không có quyền đánh giá lượt khám này' })
    }
    const feedback = await PatientFeedback.findOneAndUpdate(
      { encounterId },
      {
        $setOnInsert: { _id: crypto.randomUUID(), patientId: req.patient.patientId },
        $set: { rating, comment: comment || '', createdAt: now() },
      },
      { upsert: true, new: true }
    )
    res.status(201).json({ ok: true, feedback })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
