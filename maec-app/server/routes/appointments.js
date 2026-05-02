const express = require('express')
const crypto = require('crypto')
const router = express.Router()
const Patient = require('../models/Patient')
const Appointment = require('../models/Appointment')
const Encounter = require('../models/Encounter')
const { requireAuth } = require('../middleware/auth')

// ── helpers ────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString()
const localDate = () => {
  // Local date stamp YYYY-MM-DD (Asia/Ho_Chi_Minh — sv-SE locale gives ISO).
  return new Date().toLocaleDateString('sv-SE')
}
const genId = () => `APT-${Date.now()}-${Math.floor(Math.random() * 1000)}`

// Default duration per examType. Workflow (2) — refraction with cycloplegic
// drops — needs 90 min because the dilation wait blocks the patient for 45.
// Workflow (3) is a fitting and runs ~60. Everything else fits a 30-min slot.
function defaultDuration(examType) {
  if (!examType) return 30
  const t = String(examType).toLowerCase()
  if (t.includes('khúc xạ') || t.includes('khuc xa')) return 90
  if (t.includes('mới') || t.includes('moi') || t.includes('fitting')) return 60
  return 30
}

function buildSiteFilter(user) {
  if (user.role === 'nhanvien' || user.role === 'truongphong') {
    return { site: user.department }
  }
  return {}
}

// ── GET /api/appointments?date=YYYY-MM-DD | ?from=&to= ─────────────────────
// Single-day fetch (date) or arbitrary range (from/to inclusive). Week view
// uses from/to with a 7-day window. Defaults to today when neither is given.
router.get('/', requireAuth, async (req, res) => {
  try {
    const { site, status, q, patientId, from, to } = req.query
    const filter = { ...buildSiteFilter(req.user) }
    if (site && (req.user.role === 'admin' || req.user.role === 'giamdoc' || req.user.role === 'bacsi')) {
      filter.site = site
    }
    if (status) filter.status = status
    if (patientId) filter.patientId = patientId

    if (from || to) {
      const f = from || localDate()
      const t = to || from || localDate()
      filter.scheduledAt = { $gte: `${f}T00:00:00`, $lte: `${t}T23:59:59` }
    } else {
      const date = req.query.date || localDate()
      filter.scheduledAt = { $gte: `${date}T00:00:00`, $lte: `${date}T23:59:59` }
    }

    let appts = await Appointment.find(filter).sort({ scheduledAt: 1 }).lean()
    if (q) {
      const re = new RegExp(q, 'i')
      appts = appts.filter(a => re.test(a.patientName || '') || re.test(a.phone || '') || re.test(a.guardianPhone || ''))
    }
    res.json(appts)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── GET /api/appointments/upcoming-reminders?date=YYYY-MM-DD ───────────────
// Reminder queue: appointments scheduled for the given date (default tomorrow)
// that are not cancelled/done and haven't been ticked off yet.
router.get('/upcoming-reminders', requireAuth, async (req, res) => {
  try {
    const target = req.query.date || (() => {
      const d = new Date(); d.setDate(d.getDate() + 1)
      return d.toLocaleDateString('sv-SE')
    })()
    const filter = {
      ...buildSiteFilter(req.user),
      scheduledAt: { $gte: `${target}T00:00:00`, $lte: `${target}T23:59:59` },
      status: { $in: ['scheduled', 'confirmed'] },
    }
    if (req.query.site && (req.user.role === 'admin' || req.user.role === 'giamdoc' || req.user.role === 'bacsi')) {
      filter.site = req.query.site
    }
    const appts = await Appointment.find(filter).sort({ reminderStatus: 1, scheduledAt: 1 }).lean()
    res.json({ date: target, appointments: appts })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── GET /api/appointments/:id ──────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.id).lean()
    if (!appt) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn' })
    res.json(appt)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/appointments ─────────────────────────────────────────────────
// Body: { patientId, site, examType, scheduledAt, duration?, notes? }
// patientId is optional — walk-in bookings (e.g. phone enquiry from a non-
// patient) can pass patientName/phone instead and we'll record them inline.
// The dedicated patient is created at check-in time, not now.
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      patientId, patientName, phone, dob, gender,
      guardianName, guardianPhone,
      site, examType, room, scheduledAt, duration,
      modality, referringDoctor, clinicalInfo, notes,
      sourceCode, sourceName, referralType, referralId, referralName,
    } = req.body
    if (!site) return res.status(400).json({ error: 'Thiếu chi nhánh' })
    if (!scheduledAt) return res.status(400).json({ error: 'Thiếu thời gian hẹn' })
    if (!patientId && !patientName) return res.status(400).json({ error: 'Cần chọn bệnh nhân hoặc nhập tên' })

    // If patientId given, snapshot identity fields from Patient so the
    // calendar card has everything without a join.
    let snap = { patientName, phone, dob, gender, guardianName, guardianPhone }
    if (patientId) {
      const p = await Patient.findById(patientId).lean()
      if (!p) return res.status(404).json({ error: 'Không tìm thấy bệnh nhân' })
      snap = {
        patientName: p.name || patientName || '',
        phone: p.phone || phone || '',
        dob: p.dob || dob || '',
        gender: p.gender || gender || '',
        guardianName: p.guardianName || guardianName || '',
        guardianPhone: p.guardianPhone || guardianPhone || '',
      }
    }

    const dur = duration || defaultDuration(examType)
    const id = genId()
    const appt = new Appointment({
      _id: id,
      patientId: patientId || '',
      ...snap,
      site,
      examType: examType || '',
      modality: modality || '',
      room: room || '',
      scheduledAt,
      duration: dur,
      status: 'scheduled',
      reminderStatus: 'pending',
      referringDoctor: referringDoctor || '',
      clinicalInfo: clinicalInfo || '',
      notes: notes || '',
      sourceCode: sourceCode || '',
      sourceName: sourceName || '',
      referralType: referralType || '',
      referralId: referralId || '',
      referralName: referralName || '',
      createdBy: req.user.username,
      createdAt: now(),
      updatedAt: now(),
    })
    await appt.save()
    res.status(201).json(appt)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── PUT /api/appointments/:id ──────────────────────────────────────────────
// Allow status flips + reschedule + edits to clinical/notes. Status flips
// to 'arrived' should go through /:id/check-in instead so the encounter
// is created — direct PUT just records the status without side-effects.
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const allowed = [
      'status', 'scheduledAt', 'duration', 'site', 'examType', 'modality', 'room',
      'referringDoctor', 'clinicalInfo', 'notes',
      'patientName', 'phone', 'dob', 'gender', 'guardianName', 'guardianPhone',
      'sourceCode', 'sourceName', 'referralType', 'referralId', 'referralName',
    ]
    const update = {}
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k] })
    update.updatedAt = now()
    const appt = await Appointment.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!appt) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn' })
    res.json(appt)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/appointments/:id/cancel ──────────────────────────────────────
router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const update = {
      status: 'cancelled',
      cancelReason: req.body.reason || '',
      cancelledAt: now(),
      cancelledBy: req.user.username,
      updatedAt: now(),
    }
    const appt = await Appointment.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!appt) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn' })
    res.json(appt)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/appointments/:id/no-show ─────────────────────────────────────
router.post('/:id/no-show', requireAuth, async (req, res) => {
  try {
    const appt = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: 'no_show', updatedAt: now() },
      { new: true }
    ).lean()
    if (!appt) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn' })
    res.json(appt)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/appointments/:id/remind ──────────────────────────────────────
// Manual reminder tick — staff records that they've contacted the patient.
// Body: { method?: 'call'|'sms'|'zalo'|'other', note?, status?: 'reminded'|'failed'|'skipped' }
router.post('/:id/remind', requireAuth, async (req, res) => {
  try {
    const status = req.body.status || 'reminded'
    if (!['reminded', 'failed', 'skipped', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Trạng thái nhắc lịch không hợp lệ' })
    }
    const update = {
      reminderStatus: status,
      remindedAt: status === 'pending' ? '' : now(),
      remindedBy: status === 'pending' ? '' : req.user.username,
      remindMethod: req.body.method || '',
      remindNote: req.body.note || '',
      updatedAt: now(),
    }
    const appt = await Appointment.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!appt) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn' })
    res.json(appt)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/appointments/:id/check-in ────────────────────────────────────
// Patient has arrived. Reuse the idempotent encounter-creation pattern:
//   • If the appointment already has encounterId → return it (no duplicate)
//   • Else if the patient has an open encounter → adopt it + sync site
//   • Else create a new Encounter
// Also flips appointment status to 'arrived' and stamps encounterId.
router.post('/:id/check-in', requireAuth, async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.id).lean()
    if (!appt) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn' })
    if (!appt.patientId) {
      return res.status(400).json({ error: 'Lịch hẹn chưa gắn với bệnh nhân — vui lòng tạo bệnh nhân trước' })
    }

    const patient = await Patient.findById(appt.patientId).lean()
    if (!patient) return res.status(404).json({ error: 'Không tìm thấy bệnh nhân' })

    // 1) Already linked
    if (appt.encounterId) {
      const existing = await Encounter.findById(appt.encounterId).lean()
      if (existing) {
        await Appointment.updateOne(
          { _id: appt._id },
          { $set: { status: 'arrived', updatedAt: now() } }
        )
        return res.json({ encounterId: existing._id, appointmentId: appt._id, existing: true })
      }
    }

    // 2) Patient has open encounter — adopt
    const open = await Encounter.findOne({
      patientId: patient.patientId || patient._id,
      status: { $nin: ['paid', 'cancelled'] },
    }).lean()
    if (open) {
      const setDoc = { updatedAt: now() }
      if (appt.site && open.site !== appt.site) setDoc.site = appt.site
      if (Object.keys(setDoc).length > 1) {
        await Encounter.updateOne({ _id: open._id }, { $set: setDoc })
      }
      await Appointment.updateOne(
        { _id: appt._id },
        { $set: { encounterId: open._id, status: 'arrived', updatedAt: now() } }
      )
      return res.json({ encounterId: open._id, appointmentId: appt._id, existing: true, adopted: true })
    }

    // 3) Fresh encounter
    const encounterId = `enc-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    const studyGender = ['M', 'F'].includes(patient.gender) ? patient.gender : 'M'
    const today = localDate()
    await new Encounter({
      _id: encounterId,
      patientName: patient.name,
      patientId: patient.patientId || patient._id,
      dob: patient.dob || '',
      gender: studyGender,
      site: appt.site,
      examType: appt.examType || '',
      modality: appt.modality || '',
      clinicalInfo: appt.clinicalInfo || patient.clinicalInfo || '',
      scheduledDate: today,
      studyDate: today,
      status: 'scheduled',
      priority: 'routine',
      studyUID: `enc.${Date.now()}.${Math.floor(Math.random() * 100000)}`,
      imageStatus: 'no_images',
      imageCount: 0,
      sourceCode: patient.sourceCode || '',
      sourceName: patient.sourceName || '',
      referralType: patient.referralType || '',
      referralId: patient.referralId || '',
      referralName: patient.referralName || '',
      createdAt: now(),
      updatedAt: now(),
    }).save()

    // Denormalise lastEncounterAt onto Patient (mirrors registration.js)
    await Patient.updateOne(
      { _id: patient._id },
      { $set: { lastEncounterAt: now() } }
    )

    await Appointment.updateOne(
      { _id: appt._id },
      { $set: { encounterId, status: 'arrived', updatedAt: now() } }
    )
    res.json({ encounterId, appointmentId: appt._id, existing: false })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
