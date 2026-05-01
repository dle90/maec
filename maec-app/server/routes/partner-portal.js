const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const { sign } = require('./auth')
const { requirePartner } = require('../middleware/auth')
const PartnerAccount = require('../models/PartnerAccount')
const PartnerFacility = require('../models/PartnerFacility')
const PartnerReferral = require('../models/PartnerReferral')
const CommissionRule = require('../models/CommissionRule')
const Invoice = require('../models/Invoice')
const Appointment = require('../models/Appointment')
const Study = require('../models/Study')
const Service = require('../models/Service')

const now = () => new Date().toISOString()

// ── Public: partner login ───────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' })
    }

    const account = await PartnerAccount.findOne({ username }).lean()
    if (!account || account.password !== password) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' })
    }
    if (account.status !== 'active') {
      return res.status(403).json({ error: 'Tài khoản đã bị khóa' })
    }

    await PartnerAccount.findByIdAndUpdate(account._id, { lastLoginAt: now(), updatedAt: now() })

    const token = sign({ type: 'partner', facilityId: account.facilityId, accountId: account._id, displayName: account.displayName })
    const facility = await PartnerFacility.findById(account.facilityId).lean()
    res.json({
      token,
      displayName: account.displayName,
      facilityName: facility ? facility.name : '',
      facilityId: account.facilityId,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Protected: profile ──────────────────────────────────
router.get('/profile', requirePartner, async (req, res) => {
  try {
    const account = await PartnerAccount.findById(req.partner.accountId).select('-password').lean()
    const facility = await PartnerFacility.findById(req.partner.facilityId).lean()
    res.json({ account, facility })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Protected: list services ────────────────────────────
router.get('/services', requirePartner, async (req, res) => {
  try {
    const services = await Service.find({ status: 'active' }).sort({ serviceTypeCode: 1, name: 1 }).lean()
    res.json(services.map(s => ({
      _id: s._id, code: s.code, name: s.name,
      serviceTypeCode: s.serviceTypeCode, modality: s.modality,
      basePrice: s.basePrice,
    })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Protected: list sites ───────────────────────────────
router.get('/sites', requirePartner, async (req, res) => {
  try {
    const sites = await Appointment.distinct('site')
    if (sites.length === 0) return res.json(['LinkRad Hai Phong', 'LinkRad Ha Noi'])
    res.json(sites.filter(Boolean))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Protected: submit referral ──────────────────────────
router.post('/referrals', requirePartner, async (req, res) => {
  try {
    const { patientName, patientPhone, patientDob, patientGender, patientIdCard,
      requestedServiceId, requestedServiceName, modality, site, clinicalInfo, notes } = req.body

    if (!patientName || !patientPhone || !site) {
      return res.status(400).json({ error: 'Vui lòng nhập tên bệnh nhân, số điện thoại và chi nhánh' })
    }

    const referral = new PartnerReferral({
      _id: crypto.randomUUID(),
      facilityId: req.partner.facilityId,
      partnerAccountId: req.partner.accountId,
      patientName, patientPhone, patientDob: patientDob || '',
      patientGender: patientGender || 'other', patientIdCard: patientIdCard || '',
      requestedServiceId: requestedServiceId || '', requestedServiceName: requestedServiceName || '',
      modality: modality || '', site,
      clinicalInfo: clinicalInfo || '', notes: notes || '',
      status: 'pending',
      createdAt: now(), updatedAt: now(),
    })
    await referral.save()

    res.status(201).json({ ok: true, referral })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Protected: list referrals ───────────────────────────
router.get('/referrals', requirePartner, async (req, res) => {
  try {
    const { status, dateFrom, dateTo } = req.query
    const filter = { facilityId: req.partner.facilityId }
    if (status) filter.status = status
    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = dateFrom
      if (dateTo) filter.createdAt.$lte = dateTo + 'T23:59:59'
    }

    const referrals = await PartnerReferral.find(filter).sort({ createdAt: -1 }).lean()

    // Enrich with appointment/study status
    const aptIds = referrals.map(r => r.appointmentId).filter(Boolean)
    const studyIds = referrals.map(r => r.studyId).filter(Boolean)
    const [apts, studies] = await Promise.all([
      Appointment.find({ _id: { $in: aptIds } }).lean(),
      Study.find({ _id: { $in: studyIds } }).lean(),
    ])
    const aptMap = {}; for (const a of apts) aptMap[a._id] = a
    const studyMap = {}; for (const s of studies) studyMap[s._id] = s

    const enriched = referrals.map(r => ({
      ...r,
      appointmentStatus: r.appointmentId && aptMap[r.appointmentId] ? aptMap[r.appointmentId].status : null,
      studyStatus: r.studyId && studyMap[r.studyId] ? studyMap[r.studyId].status : null,
    }))

    res.json(enriched)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Protected: commission summary ───────────────────────
router.get('/commissions', requirePartner, async (req, res) => {
  try {
    // Get all completed referrals for this facility
    const referrals = await PartnerReferral.find({
      facilityId: req.partner.facilityId,
      status: { $in: ['completed', 'appointment_created'] },
    }).lean()

    if (referrals.length === 0) return res.json([])

    // Get partner's commission group
    const account = await PartnerAccount.findById(req.partner.accountId).lean()
    const rules = account && account.commissionGroupId
      ? await CommissionRule.find({ commissionGroupId: account.commissionGroupId, status: 'active' }).lean()
      : []

    // Build rule lookup by serviceId
    const ruleMap = {}
    for (const r of rules) {
      if (r.serviceId) ruleMap[r.serviceId] = r
    }

    // Get paid invoices linked to referral appointments
    const aptIds = referrals.map(r => r.appointmentId).filter(Boolean)
    const invoices = await Invoice.find({
      appointmentId: { $in: aptIds },
      status: { $in: ['paid', 'partially_paid'] },
    }).lean()

    // Group by month
    const monthly = {}
    for (const inv of invoices) {
      const month = (inv.paidAt || inv.createdAt || '').slice(0, 7) || 'unknown'
      if (!monthly[month]) monthly[month] = { month, referralCount: 0, totalRevenue: 0, commissionAmount: 0 }
      monthly[month].referralCount++
      monthly[month].totalRevenue += inv.grandTotal || 0

      // Calculate commission per item
      for (const item of (inv.items || [])) {
        const rule = ruleMap[item.serviceCode] || ruleMap[item.serviceId]
        if (rule) {
          const comm = rule.type === 'percentage'
            ? (item.amount || 0) * rule.value / 100
            : rule.value
          monthly[month].commissionAmount += comm
        }
      }
    }

    res.json(Object.values(monthly).sort((a, b) => b.month.localeCompare(a.month)))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
