const express = require('express')
const crypto = require('crypto')
const router = express.Router()
const Patient = require('../models/Patient')
const Appointment = require('../models/Appointment')
const Service = require('../models/Service')

const now = () => new Date().toISOString()
const today = () => now().slice(0, 10)

// ── Public: list active services for booking ─────────────
router.get('/services', async (req, res) => {
  try {
    const services = await Service.find({ status: 'active' }).sort({ serviceTypeCode: 1, name: 1 }).lean()
    res.json(services.map(s => ({
      _id: s._id, code: s.code, name: s.name,
      serviceTypeCode: s.serviceTypeCode, modality: s.modality,
      basePrice: s.basePrice,
    })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Public: list sites ───────────────────────────────────
router.get('/sites', async (req, res) => {
  try {
    const sites = await Appointment.distinct('site')
    // Fallback: if no appointments yet, return default sites
    if (sites.length === 0) {
      return res.json(['Minh Anh — Cơ sở 1', 'Minh Anh — Cơ sở 2'])
    }
    res.json(sites.filter(Boolean))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Public: available time slots ─────────────────────────
router.get('/slots', async (req, res) => {
  try {
    const { site, date } = req.query
    if (!site || !date) return res.status(400).json({ error: 'Thiếu chi nhánh hoặc ngày' })

    // Get existing appointments for that date+site
    const existing = await Appointment.find({
      site, scheduledAt: { $regex: `^${date}` },
      status: { $nin: ['cancelled', 'no_show'] },
    }).lean()

    const bookedTimes = new Set(existing.map(a => a.scheduledAt?.slice(11, 16)))

    // Generate available 30-min slots from 07:30 to 17:00
    const slots = []
    for (let h = 7; h <= 16; h++) {
      for (const m of ['00', '30']) {
        if (h === 7 && m === '00') continue // start at 7:30
        if (h === 16 && m === '30') continue // end at 16:30
        const time = `${String(h).padStart(2, '0')}:${m}`
        if (!bookedTimes.has(time)) {
          slots.push(time)
        }
      }
    }
    res.json(slots)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Public: submit booking ───────────────────────────────
router.post('/submit', async (req, res) => {
  try {
    const { name, phone, dob, gender, site, serviceId, serviceName, modality, scheduledDate, scheduledTime, clinicalInfo } = req.body

    if (!name || !phone || !site || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin bắt buộc' })
    }

    // Find or create patient by phone
    let patient = await Patient.findOne({ phone }).lean()
    if (!patient) {
      const d = today().replace(/-/g, '')
      const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
      patient = new Patient({
        _id: crypto.randomUUID(),
        patientId: `BN-${d}-${seq}`,
        name,
        phone,
        dob: dob || '',
        gender: gender || 'other',
        registeredSite: site,
        createdAt: now(),
        updatedAt: now(),
      })
      await patient.save()
      patient = patient.toObject()
    }

    // Create appointment
    const scheduledAt = `${scheduledDate}T${scheduledTime}:00`
    const appointment = new Appointment({
      _id: `APT-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      patientId: patient._id,
      patientName: name,
      dob: dob || patient.dob || '',
      gender: gender || patient.gender || 'other',
      phone,
      site,
      modality: modality || 'US',
      scheduledAt,
      duration: 30,
      status: 'scheduled',
      clinicalInfo: clinicalInfo || '',
      notes: `Đặt lịch online - DV: ${serviceName || ''}`,
      createdBy: 'booking-form',
      createdAt: now(),
      updatedAt: now(),
    })
    await appointment.save()

    res.status(201).json({
      bookingId: appointment._id,
      message: 'Đặt lịch thành công! Chúng tôi sẽ liên hệ xác nhận.',
      scheduledAt,
      site,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Public: check booking status ─────────────────────────
router.get('/status/:bookingId', async (req, res) => {
  try {
    const apt = await Appointment.findById(req.params.bookingId).lean()
    if (!apt) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn' })
    res.json({
      bookingId: apt._id,
      patientName: apt.patientName,
      site: apt.site,
      scheduledAt: apt.scheduledAt,
      status: apt.status,
      modality: apt.modality,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
