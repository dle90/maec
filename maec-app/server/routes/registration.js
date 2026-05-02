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
      filter.$or = [
        { name: re }, { patientId: re }, { phone: re }, { idCard: re },
        { guardianName: re }, { guardianPhone: re },
      ]
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

// ─── APPOINTMENTS — removed 2026-05-02 ────────────────────────────────────────
// The /his/appointments GET/POST/PUT/DELETE block lived here (mounted at
// /api/registration/appointments). It carried radiology-era validation
// (modality required as CT/MRI/XR/US) and auto-created a DICOM-shaped
// Encounter on status=in_progress. Replaced by the ophth-shaped
// /api/appointments router (maec-app/server/routes/appointments.js) which
// is what LichHen.jsx talks to. No client code was hitting the old block;
// removed entirely.

// ─── CHECK-IN (creates encounter; optional service orders + invoice) ─────────
// POST /registration/check-in — atomic bundle for the Đăng ký flow:
//   1 Encounter (always — lands on Khám queue for KTV/BS)
//   1 Invoice (only if services provided — status=draft, lands on Phiếu thu)
// Body: { patientId, services?: [{code, name, price, qty}], paymentMethod?, notes? }
// As of 2026-05-02 the Đăng ký UI sends services=[] — receptionist just checks
// the patient in, KTV/BS pick services later in Khám. Legacy non-empty path
// (services with prices) is still honored and creates bill items + an Invoice.
// The radiology Appointment+Study fan-out was removed 2026-05-02 — eye clinic
// doesn't use those modalities.
router.post('/check-in', requireAuth, async (req, res) => {
  try {
    const { patientId, paymentMethod = 'cash', notes = '' } = req.body
    if (!patientId) return res.status(400).json({ error: 'patientId required' })
    const services = Array.isArray(req.body.services) ? req.body.services : []

    const patient = await Patient.findById(patientId).lean()
    if (!patient) return res.status(404).json({ error: 'Patient not found' })

    // Idempotent check-in: if this patient already has an open encounter
    // (anything not yet paid or cancelled), return that one instead of
    // creating a duplicate. Prevents accidental double check-ins from the
    // Đăng ký flow when a patient is still being seen by KTV/BS.
    // If the caller explicitly picked a site that differs from the existing
    // encounter, sync the existing encounter's site over so the BN appears
    // in the right Khám site filter (otherwise the old default-site value
    // stays and the BN can't be found by site).
    const existing = await Encounter.findOne({
      patientId: patient.patientId || patient._id,
      status: { $nin: ['paid', 'cancelled'] },
    }).lean()
    if (existing) {
      if (req.body.site && existing.site !== req.body.site) {
        await Encounter.updateOne(
          { _id: existing._id },
          { $set: { site: req.body.site, updatedAt: now() } }
        )
      }
      return res.status(200).json({
        encounterId: existing._id,
        existing: true,
        siteUpdated: !!(req.body.site && existing.site !== req.body.site),
        message: 'Bệnh nhân đã có lượt khám đang mở',
      })
    }

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
    // Encounter.gender is enum: M | F only, so fold 'other'/empty to 'M'.
    const studyGender = ['M', 'F'].includes(patient.gender) ? patient.gender : 'M'

    // Service docs (no longer used for radiology bodyPart — kept for the
    // assignedServices derivation below + svcByCode lookup).
    const codesNeeded = services.map(s => s.code).filter(Boolean)

    try {
      // Radiology fan-out (one Appointment + linked Encounter per CT/MRI/XR/US
      // service) was removed 2026-05-02 — eye clinic doesn't have those
      // modalities, and the new /api/appointments router handles scheduling
      // through Lịch hẹn instead. The check-in flow now creates exactly one
      // clinical Encounter (below); imaging studies will be a separate
      // sub-array on Encounter once PACS lands (see FOLLOWUPS deferred field
      // renames).

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
          appointmentId: '',
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

      // Create the MAEC clinical Encounter. The cart's services become bill
      // items; assignedServices is derived for cart codes that match the
      // Service catalog so KTV/BS see them in Khám immediately. Packages
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

      // Denormalize last-encounter timestamp on the Patient — drives the
      // "Last visit" filter on the Bệnh Nhân catalog without aggregation.
      await Patient.updateOne(
        { _id: patient._id },
        { $set: { lastEncounterAt: encounter.createdAt, updatedAt: now() } }
      ).catch(() => {})

      res.status(201).json({ invoice, encounterId: encounter._id })
    } catch (inner) {
      // No fan-out to roll back — only the invoice + encounter exist now,
      // and a partial failure of those is rare enough that we just bubble.
      throw inner
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
