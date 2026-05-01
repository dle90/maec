const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const { sign } = require('./auth')
const { requirePatient } = require('../middleware/auth')
const Patient = require('../models/Patient')
const PatientAccount = require('../models/PatientAccount')
const Appointment = require('../models/Appointment')
const Encounter = require('../models/Encounter')
const Report = require('../models/Report')
const Invoice = require('../models/Invoice')
const PatientFeedback = require('../models/PatientFeedback')

const now = () => new Date().toISOString()

// ── Public: patient login (phone + dob) ─────────────────
router.post('/login', async (req, res) => {
  try {
    const { phone, dob } = req.body
    if (!phone || !dob) {
      return res.status(400).json({ error: 'Vui lòng nhập số điện thoại và ngày sinh' })
    }

    // Find patient by phone
    const patient = await Patient.findOne({ phone }).lean()
    if (!patient) {
      return res.status(401).json({ error: 'Không tìm thấy bệnh nhân với số điện thoại này' })
    }

    // Verify DOB matches
    if (patient.dob !== dob) {
      return res.status(401).json({ error: 'Ngày sinh không đúng' })
    }

    // Create or update PatientAccount
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
      patientId: patient.patientId,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Protected: visit history ────────────────────────────
router.get('/visits', requirePatient, async (req, res) => {
  try {
    const patientId = req.patient.patientId

    // Get all appointments for this patient
    const appointments = await Appointment.find({ patientId })
      .sort({ scheduledAt: -1 }).lean()

    // Get linked data in parallel
    const aptIds = appointments.map(a => a._id)
    const studyIds = appointments.map(a => a.studyId).filter(Boolean)

    const [invoices, studies, feedbacks] = await Promise.all([
      Invoice.find({ appointmentId: { $in: aptIds } }).lean(),
      Encounter.find({ _id: { $in: studyIds } }).lean(),
      PatientFeedback.find({ appointmentId: { $in: aptIds } }).lean(),
    ])

    const invoiceMap = {}
    for (const inv of invoices) invoiceMap[inv.appointmentId] = inv
    const studyMap = {}
    for (const s of studies) studyMap[s._id] = s
    const feedbackMap = {}
    for (const f of feedbacks) feedbackMap[f.appointmentId] = f

    const visits = appointments.map(apt => {
      const inv = invoiceMap[apt._id]
      const study = apt.studyId ? studyMap[apt.studyId] : null
      const fb = feedbackMap[apt._id]
      return {
        appointmentId: apt._id,
        date: apt.scheduledAt,
        site: apt.site,
        modality: apt.modality,
        status: apt.status,
        clinicalInfo: apt.clinicalInfo,
        invoice: inv ? {
          grandTotal: inv.grandTotal, paidAmount: inv.paidAmount,
          status: inv.status, items: inv.items,
        } : null,
        study: study ? {
          studyId: study._id, status: study.status,
          hasReport: !!(study.reportText || study.reportId),
          modality: study.modality, bodyPart: study.bodyPart,
        } : null,
        feedback: fb ? { rating: fb.rating, comment: fb.comment } : null,
      }
    })

    res.json(visits)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Protected: view report for a visit ──────────────────
router.get('/visits/:appointmentId/report', requirePatient, async (req, res) => {
  try {
    const apt = await Appointment.findById(req.params.appointmentId).lean()
    if (!apt || apt.patientId !== req.patient.patientId) {
      return res.status(404).json({ error: 'Không tìm thấy lịch hẹn' })
    }
    if (!apt.studyId) {
      return res.status(404).json({ error: 'Chưa có ca chụp liên kết' })
    }

    const study = await Encounter.findById(apt.studyId).lean()
    if (!study) return res.status(404).json({ error: 'Không tìm thấy ca chụp' })

    // Try to find a formal Report document first
    const report = await Report.findOne({ studyId: study._id }).lean()

    if (report && (report.status === 'final' || report.status === 'preliminary')) {
      return res.json({
        technique: report.technique, clinicalInfo: report.clinicalInfo,
        findings: report.findings, impression: report.impression,
        recommendation: report.recommendation, status: report.status,
        reportedAt: report.finalizedAt || report.updatedAt,
      })
    }

    // Fallback: use reportText from Study
    if (study.reportText) {
      return res.json({
        findings: study.reportText, impression: '',
        status: study.status === 'verified' ? 'final' : 'preliminary',
        reportedAt: study.reportedAt || study.updatedAt,
      })
    }

    res.status(404).json({ error: 'Chưa có kết quả' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Protected: submit feedback ──────────────────────────
router.post('/feedback', requirePatient, async (req, res) => {
  try {
    const { appointmentId, rating, comment } = req.body
    if (!appointmentId || !rating) {
      return res.status(400).json({ error: 'Vui lòng chọn đánh giá' })
    }

    // Verify appointment belongs to patient
    const apt = await Appointment.findById(appointmentId).lean()
    if (!apt || apt.patientId !== req.patient.patientId) {
      return res.status(403).json({ error: 'Không có quyền đánh giá lịch hẹn này' })
    }

    const feedback = await PatientFeedback.findOneAndUpdate(
      { appointmentId },
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
