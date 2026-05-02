const express = require('express')
const crypto = require('crypto')
const router = express.Router()
const Patient = require('../models/Patient')
const Appointment = require('../models/Appointment')
const Encounter = require('../models/Encounter')
const Invoice = require('../models/Invoice')
const Service = require('../models/Service')
const { requireAuth } = require('../middleware/auth')
const { resolveEffectiveSalesperson, nextInvoiceNumber } = require('../lib/invoicing')

// Helper: site filter based on role
function buildSiteFilter(user) {
  if (user.role === 'nhanvien' || user.role === 'truongphong') {
    return { site: user.department }
  }
  return {} // giamdoc, admin, bacsi: all sites
}

// Generate IDs
function genPatientId() {
  const d = new Date()
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
  return `BN-${ymd}-${Math.floor(Math.random() * 9000) + 1000}`
}

function genAppointmentId() {
  return `APT-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function now() {
  return new Date().toISOString()
}

// ─── PATIENTS ────────────────────────────────────────────────────────────────

// GET /his/patients?q=&site=&limit=
router.get('/patients', requireAuth, async (req, res) => {
  try {
    const { q, site, limit = 50 } = req.query
    const filter = {}
    if (q) {
      const re = new RegExp(q, 'i')
      filter.$or = [{ name: re }, { patientId: re }, { phone: re }, { idCard: re }]
    }
    if (site) filter.registeredSite = site
    const patients = await Patient.find(filter).limit(Number(limit)).lean()
    res.json(patients)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /his/patients/:id
router.get('/patients/:id', requireAuth, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id).lean()
    if (!patient) return res.status(404).json({ error: 'Not found' })
    // fetch appointment history
    const appointments = await Appointment.find({ patientId: req.params.id })
      .sort({ scheduledAt: -1 }).limit(20).lean()
    res.json({ ...patient, appointments })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /his/patients
router.post('/patients', requireAuth, async (req, res) => {
  try {
    const {
      name, dob, gender, phone, email, address, idCard, insuranceNumber, notes,
      guardianName, guardianPhone, guardianRelation,
      sourceCode, sourceName, referralType, referralId, referralName,
    } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    const id = genPatientId()
    const patient = new Patient({
      _id: id,
      patientId: id,
      name, dob, gender, phone, email, address, idCard, insuranceNumber, notes,
      guardianName, guardianPhone, guardianRelation,
      sourceCode, sourceName,
      referralType: referralType || '',
      referralId, referralName,
      registeredSite: req.user.department || '',
      createdAt: now(),
      updatedAt: now(),
    })
    await patient.save()
    res.json(patient)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /his/patients/:id
router.put('/patients/:id', requireAuth, async (req, res) => {
  try {
    const allowed = [
      'name', 'dob', 'gender', 'phone', 'email', 'address', 'idCard', 'insuranceNumber', 'notes',
      'guardianName', 'guardianPhone', 'guardianRelation',
      'sourceCode', 'sourceName', 'referralType', 'referralId', 'referralName',
    ]
    const update = {}
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k] })
    update.updatedAt = now()
    const patient = await Patient.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!patient) return res.status(404).json({ error: 'Not found' })
    res.json(patient)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────

// GET /his/appointments?site=&date=YYYY-MM-DD&week=YYYY-MM-DD&status=
router.get('/appointments', requireAuth, async (req, res) => {
  try {
    const { site, date, week, status, patientId } = req.query
    const filter = { ...buildSiteFilter(req.user) }

    if (site && (req.user.role === 'admin' || req.user.role === 'giamdoc')) {
      filter.site = site
    }
    if (patientId) filter.patientId = patientId
    if (status) filter.status = status

    if (week) {
      // week = start date (Monday), fetch 7 days
      const start = new Date(week)
      const end = new Date(week)
      end.setDate(end.getDate() + 7)
      filter.scheduledAt = { $gte: start.toISOString(), $lt: end.toISOString() }
    } else if (date) {
      filter.scheduledAt = { $gte: `${date}T00:00:00`, $lt: `${date}T23:59:59` }
    }

    const appointments = await Appointment.find(filter)
      .sort({ scheduledAt: 1 }).lean()
    res.json(appointments)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /his/appointments
router.post('/appointments', requireAuth, async (req, res) => {
  try {
    const {
      patientId, patientName, dob, gender, phone,
      site, modality, room, scheduledAt, duration,
      referringDoctor, clinicalInfo, notes,
      sourceCode, sourceName, referralType, referralId, referralName,
    } = req.body
    if (!site || !modality || !scheduledAt) {
      return res.status(400).json({ error: 'site, modality, scheduledAt required' })
    }
    const id = genAppointmentId()
    const appt = new Appointment({
      _id: id,
      patientId, patientName, dob, gender, phone,
      site, modality, room, scheduledAt,
      duration: duration || 30,
      status: 'scheduled',
      referringDoctor, clinicalInfo, notes,
      sourceCode, sourceName,
      referralType: referralType || '',
      referralId, referralName,
      createdBy: req.user.username,
      createdAt: now(),
      updatedAt: now(),
    })
    await appt.save()
    res.json(appt)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /his/appointments/:id
router.put('/appointments/:id', requireAuth, async (req, res) => {
  try {
    const allowed = [
      'status', 'scheduledAt', 'room', 'duration', 'modality',
      'referringDoctor', 'clinicalInfo', 'notes', 'site',
      'sourceCode', 'sourceName', 'referralType', 'referralId', 'referralName',
    ]
    const update = {}
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k] })
    update.updatedAt = now()

    // When appointment moves to in_progress, auto-create a RIS Study
    if (update.status === 'in_progress') {
      const appt = await Appointment.findById(req.params.id).lean()
      if (appt && !appt.studyId) {
        const studyId = `std-${Date.now()}`
        const study = new Encounter({
          _id: studyId,
          patientName: appt.patientName,
          patientId: appt.patientId || '',
          dob: appt.dob || '',
          gender: appt.gender || 'M',
          modality: appt.modality,
          clinicalInfo: appt.clinicalInfo || '',
          site: appt.site,
          scheduledDate: appt.scheduledAt ? appt.scheduledAt.slice(0, 10) : '',
          studyDate: new Date().toISOString().slice(0, 10),
          status: 'in_progress',
          priority: 'routine',
          studyUID: `1.2.840.10008.5.1.4.1.1.2.${Date.now()}.${Math.floor(Math.random() * 100000)}`,
          imageStatus: 'no_images',
          imageCount: 0,
          createdAt: now(),
          updatedAt: now(),
        })
        await study.save()
        update.studyId = studyId
      }
    }

    const appt = await Appointment.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!appt) return res.status(404).json({ error: 'Not found' })
    res.json(appt)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /his/appointments/:id  (cancel only — set status=cancelled)
router.delete('/appointments/:id', requireAuth, async (req, res) => {
  try {
    const appt = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', updatedAt: now() },
      { new: true }
    ).lean()
    if (!appt) return res.status(404).json({ error: 'Not found' })
    res.json(appt)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── CHECK-IN (creates encounter; optional service orders + invoice) ─────────
// POST /registration/check-in — atomic bundle for the Đăng ký flow:
//   1 Encounter (always — lands on Khám queue for KTV/BS)
//   1 Invoice (only if services provided — status=draft, lands on Phiếu thu)
//   N Appointments + Studies (only for imaging services — lands on Ca chụp)
// Body: { patientId, services?: [{code, name, price, modality, qty}], paymentMethod?, notes? }
// As of 2026-05-02 the Đăng ký UI sends services=[] — receptionist just checks
// the patient in, KTV/BS pick services later in Khám. Legacy non-empty path
// is preserved for any caller still posting cart items.
router.post('/check-in', requireAuth, async (req, res) => {
  try {
    const { patientId, paymentMethod = 'cash', notes = '' } = req.body
    if (!patientId) return res.status(400).json({ error: 'patientId required' })
    const services = Array.isArray(req.body.services) ? req.body.services : []

    const patient = await Patient.findById(patientId).lean()
    if (!patient) return res.status(404).json({ error: 'Patient not found' })

    // Site precedence: body override → patient's registered site → user's
    // department → distinct existing site → 'default'. Appointment.site is
    // required by Mongoose, so we must always have something non-empty.
    let site = req.body.site || patient.registeredSite || req.user.department || ''
    if (!site) {
      const existing = await Appointment.distinct('site')
      site = existing.find(Boolean) || 'default'
    }
    const scheduledAt = now()
    const scheduledDate = scheduledAt.slice(0, 10)
    const created = { appointments: [], studies: [] }
    // Study + Appointment enums only cover imaging modalities. Non-imaging
    // services (LAB/TDCN/KH) still go on the invoice as line items but
    // don't create a Ca chụp worklist row — that's a different workflow.
    const IMAGING_MODALITIES = ['CT', 'MRI', 'XR', 'US']
    // Encounter.gender is enum: M | F only, so fold 'other'/empty to 'M'.
    const studyGender = ['M', 'F'].includes(patient.gender) ? patient.gender : 'M'

    // Pre-fetch bodyPart from Service catalog for the codes we'll need.
    // Used by the report editor's template matching + pre-fill of "Kỹ thuật chụp".
    const codesNeeded = services.map(s => s.code).filter(Boolean)
    const serviceDocs = codesNeeded.length
      ? await Service.find({ code: { $in: codesNeeded } }).select('code bodyPart').lean()
      : []
    const bodyPartByCode = Object.fromEntries(serviceDocs.map(d => [d.code, d.bodyPart || '']))

    try {
      // Fan out: one Appointment + linked Study per imaging service
      for (const s of services) {
        const modality = (s.modality || '').toUpperCase()
        if (!IMAGING_MODALITIES.includes(modality)) continue

        const studyId = `std-${Date.now()}-${Math.floor(Math.random() * 10000)}`
        const apptId = genAppointmentId()
        const bodyPart = bodyPartByCode[s.code] || ''

        const study = await new Encounter({
          _id: studyId,
          patientName: patient.name,
          patientId: patient.patientId || patient._id,
          dob: patient.dob || '',
          gender: studyGender,
          modality,
          bodyPart,
          clinicalInfo: patient.clinicalInfo || '',
          site,
          scheduledDate,
          studyDate: scheduledDate,
          status: 'scheduled',
          priority: 'routine',
          studyUID: `1.2.840.10008.5.1.4.1.1.2.${Date.now()}.${Math.floor(Math.random() * 100000)}`,
          imageStatus: 'no_images',
          imageCount: 0,
          createdAt: now(),
          updatedAt: now(),
        }).save()
        created.studies.push(study)

        const appt = await new Appointment({
          _id: apptId,
          patientId: patient._id,
          patientName: patient.name,
          dob: patient.dob || '',
          gender: patient.gender || 'M',
          phone: patient.phone || '',
          site,
          modality,
          scheduledAt,
          duration: 30,
          status: 'scheduled',
          studyId,
          clinicalInfo: patient.clinicalInfo || '',
          notes: `${s.code || ''} · ${s.name || ''} · SL ${s.qty || 1}`,
          sourceCode: patient.sourceCode || '',
          sourceName: patient.sourceName || '',
          referralType: patient.referralType || '',
          referralId: patient.referralId || '',
          referralName: patient.referralName || '',
          createdBy: req.user.username,
          createdAt: now(),
          updatedAt: now(),
        }).save()
        created.appointments.push(appt)
      }

      // Invoice — only when services were provided. Empty check-in (the new
      // default Đăng ký flow) skips invoice creation; Thu Ngân handles billing
      // after the visit completes.
      let invoice = null
      if (services.length > 0) {
        const items = services.map(s => ({
          serviceCode: s.code || '',
          serviceName: s.name || '',
          quantity: s.qty || 1,
          unitPrice: s.price || 0,
          discountAmount: 0,
          taxRate: 0,
          taxAmount: 0,
          amount: (s.price || 0) * (s.qty || 1),
        }))
        const subtotal = items.reduce((a, it) => a + it.amount, 0)
        const eff = await resolveEffectiveSalesperson(patient.referralType, patient.referralId)

        invoice = await new Invoice({
          _id: `INV-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
          invoiceNumber: await nextInvoiceNumber(),
          patientId: patient._id,
          patientName: patient.name,
          phone: patient.phone || '',
          appointmentId: created.appointments[0]?._id || '',
          site,
          sourceCode: patient.sourceCode || '',
          sourceName: patient.sourceName || '',
          referralType: patient.referralType || '',
          referralId: patient.referralId || '',
          referralName: patient.referralName || '',
          effectiveSalespersonId: eff.id,
          effectiveSalespersonName: eff.name,
          items,
          subtotal,
          totalDiscount: 0,
          totalTax: 0,
          grandTotal: subtotal,
          paymentMethod: ['cash', 'transfer', 'card', 'mixed'].includes(paymentMethod) ? paymentMethod : 'cash',
          status: 'draft',
          createdBy: req.user.username,
          notes,
          createdAt: now(),
          updatedAt: now(),
        }).save()
      }

      // Create one MAEC clinical Encounter (always — separate from any Studies
      // the radiology fan-out above may produce). The cart's services become
      // bill items here; assignedServices is derived for cart codes that match
      // the Service catalog so KTV/BS see them in Khám immediately. Packages
      // (codes starting PKG-) are recorded as bill 'package' items only —
      // the Khám drawer's "Gán gói" action populates assignedServices.
      const fullSvcDocs = codesNeeded.length
        ? await Service.find({ code: { $in: codesNeeded } }).lean()
        : []
      const svcByCode = Object.fromEntries(fullSvcDocs.map(d => [d.code, d]))
      const encId = `enc-${Date.now()}-${Math.floor(Math.random() * 10000)}`
      const encBillItems = []
      const encAssigned = []
      for (const s of services) {
        const svc = s.code ? svcByCode[s.code] : null
        const isPackage = (s.code || '').startsWith('PKG-')
        encBillItems.push({
          kind: isPackage ? 'package' : 'service',
          code: s.code || '',
          name: s.name || svc?.name || s.code || '',
          qty: s.qty || 1,
          unitPrice: s.price || 0,
          totalPrice: (s.price || 0) * (s.qty || 1),
          addedBy: req.user.username,
          addedAt: now(),
        })
        if (svc) {
          encAssigned.push({
            serviceCode: svc.code,
            serviceName: svc.name,
            status: 'pending',
            output: {},
          })
        }
      }
      const encBillTotal = encBillItems.reduce((a, b) => a + (b.totalPrice || 0), 0)
      const encounter = await new Encounter({
        _id: encId,
        patientId: patient.patientId || patient._id,
        patientName: patient.name,
        dob: patient.dob || '',
        gender: studyGender,
        site,
        scheduledDate,
        studyDate: scheduledDate,
        status: 'scheduled',
        priority: 'routine',
        assignedServices: encAssigned,
        billItems: encBillItems,
        billTotal: encBillTotal,
        createdAt: now(),
        updatedAt: now(),
      }).save()

      res.status(201).json({ invoice, appointments: created.appointments, studies: created.studies, encounterId: encounter._id })
    } catch (inner) {
      // Best-effort rollback — no Mongo transactions in use elsewhere in this codebase
      await Promise.all([
        ...created.studies.map(s => Encounter.deleteOne({ _id: s._id }).catch(() => {})),
        ...created.appointments.map(a => Appointment.deleteOne({ _id: a._id }).catch(() => {})),
      ])
      throw inner
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /his/sites — list distinct sites from appointments (for filter dropdown)
router.get('/sites', requireAuth, async (req, res) => {
  try {
    const sites = await Appointment.distinct('site')
    res.json(sites)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
