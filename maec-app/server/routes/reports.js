const express = require('express')
const router = express.Router()
const { requireAuth, requirePermission } = require('../middleware/auth')

const Invoice = require('../models/Invoice')
const Patient = require('../models/Patient')
const ReferralDoctor = require('../models/ReferralDoctor')
const Service = require('../models/Service')
const User = require('../models/User')
const Encounter = require('../models/Encounter')
const { localDate, localDayStartUtcZ, localWeekStart, localMonthStart, localYearStart, addDaysLocal } = require('../lib/dates')

const PAYMENT_LABELS = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', card: 'Thẻ', mixed: 'Hỗn hợp' }

// GET /reports/maec-overview — Tổng Quan dashboard payload.
// Aggregates paid Encounter.paidAmount by site for Today / WTD / MTD / YTD,
// plus a 12-month series and today's check-in queue. Open to all authenticated
// users (it's the home page); per-role gating can layer on top later.
router.get('/maec-overview', requireAuth, async (req, res) => {
  try {
    // All "today / this week / this month / this year" boundaries are computed
    // in Asia/Ho_Chi_Minh local time so cashier KPIs match wall-clock reality.
    // Without this, between UTC midnight (~7am local) and local midnight the
    // server would still answer "yesterday" for 7 hours each day.
    const todayStr = localDate()
    const wtdStr = localWeekStart(todayStr)
    const mtdStr = localMonthStart(todayStr)
    const ytdStr = localYearStart(todayStr)
    // 12-month series: anchor at the 1st of the month 11 months before this
    // local month.
    const [yy, mm] = todayStr.split('-').map(Number)
    const start12Date = new Date(Date.UTC(yy, mm - 1 - 11, 1))
    const start12Str = start12Date.toISOString().slice(0, 10)

    // Q3 — paidAmount is now denormalized as the NET (positive payments minus
    // refunds), and an encounter that's been fully refunded ends up in
    // status='completed'. Widen the status filter to capture partial + fully
    // refunded encounters; paidAmount > 0 keeps the zero-revenue rows out.
    const REVENUE_STATUSES = ['paid', 'partial', 'completed']
    async function aggRange(fromLocalDate) {
      const docs = await Encounter.aggregate([
        { $match: { status: { $in: REVENUE_STATUSES }, paidAmount: { $gt: 0 }, paidAt: { $gte: localDayStartUtcZ(fromLocalDate) } } },
        { $group: { _id: '$site', revenue: { $sum: '$paidAmount' }, encounters: { $sum: 1 } } },
      ])
      const result = { total: 0, encounters: 0, bySite: {} }
      for (const d of docs) {
        const site = d._id || 'unknown'
        result.bySite[site] = d.revenue
        result.total += d.revenue
        result.encounters += d.encounters
      }
      return result
    }

    const [today, wtd, mtd, ytd, monthlyDocs, todayCheckIns] = await Promise.all([
      aggRange(todayStr),
      aggRange(wtdStr),
      aggRange(mtdStr),
      aggRange(ytdStr),
      Encounter.aggregate([
        { $match: { status: { $in: REVENUE_STATUSES }, paidAmount: { $gt: 0 }, paidAt: { $gte: localDayStartUtcZ(start12Str) } } },
        { $group: { _id: { month: { $substr: ['$paidAt', 0, 7] }, site: '$site' }, revenue: { $sum: '$paidAmount' } } },
        { $sort: { '_id.month': 1 } },
      ]),
      Encounter.find({ createdAt: { $gte: localDayStartUtcZ(todayStr), $lte: new Date(`${todayStr}T23:59:59.999+07:00`).toISOString() } })
        .sort({ createdAt: -1 }).limit(20).lean(),
    ])

    // Reshape monthly: one row per month with per-site columns + total
    const monthMap = {}
    for (const r of monthlyDocs) {
      const m = r._id.month
      if (!monthMap[m]) monthMap[m] = { month: m, total: 0, bySite: {} }
      const site = r._id.site || 'unknown'
      monthMap[m].bySite[site] = r.revenue
      monthMap[m].total += r.revenue
    }
    const monthly = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(yy, mm - 1 - i, 1))
      const m = d.toISOString().slice(0, 7)
      monthly.push(monthMap[m] || { month: m, total: 0, bySite: {} })
    }

    res.json({ today, wtd, mtd, ytd, monthly, todayCheckIns })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /reports/revenue-detail
router.get('/revenue-detail', requireAuth, requirePermission('reports.view'), async (req, res) => {
  try {
    const { dateFrom, dateTo, branch } = req.query
    const filter = {}

    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom).toISOString()
      if (dateTo) {
        const end = new Date(dateTo)
        end.setDate(end.getDate() + 1)
        filter.createdAt.$lt = end.toISOString()
      }
    }
    if (branch) filter.site = { $regex: branch, $options: 'i' }

    const invoices = await Invoice.find(filter).sort({ createdAt: -1 }).limit(500).lean()

    // Batch lookups
    const patientIds = [...new Set(invoices.map(b => b.patientId).filter(Boolean))]
    const [patients, doctors, users, services] = await Promise.all([
      Patient.find({ _id: { $in: patientIds } }).lean(),
      ReferralDoctor.find({}).lean(),
      User.find({}).select('-password').lean(),
      Service.find({}).lean(),
    ])
    const patientMap = Object.fromEntries(patients.map(p => [p._id, p]))
    const doctorMap = Object.fromEntries(doctors.map(d => [d.code, d]))
    const userMap = Object.fromEntries(users.map(u => [u._id, u]))
    const serviceMap = Object.fromEntries(services.map(s => [s.code, s]))

    // Build report rows — one row per invoice line item
    const rows = []
    for (const inv of invoices) {
      const patient = patientMap[inv.patientId] || {}
      const doctor = inv.referringDoctorCode ? doctorMap[inv.referringDoctorCode] : null
      const staff = inv.cashierId ? userMap[inv.cashierId] : (inv.createdBy ? userMap[inv.createdBy] : null)

      const baseRow = {
        branch: inv.site || '',
        date: inv.createdAt,
        billingCode: inv.invoiceNumber || inv._id,
        doctorCode: inv.referringDoctorCode || '',
        doctorName: doctor?.name || '',
        doctorWorkplace: doctor?.workplace || '',
        doctorPhone: doctor?.phone || '',
        staffCode: staff?._id || inv.cashierId || inv.createdBy || '',
        staffName: staff?.displayName || '',
        patientCode: patient.patientId || inv.patientId || '',
        patientName: inv.patientName || patient.name || '',
        patientPhone: inv.phone || patient.phone || '',
        patientAddress: [patient.ward, patient.district, patient.province].filter(Boolean).join(', ') || patient.address || '',
        patientDob: patient.dob || '',
        patientIdCard: patient.idCard || '',
        paymentMethod: PAYMENT_LABELS[inv.paymentMethod] || inv.paymentMethod || '',
      }

      const items = inv.items || []
      if (items.length === 0) {
        rows.push({
          ...baseRow,
          _id: inv._id,
          customerSource: doctor ? 'Đối tác giới thiệu' : 'Tự đến',
          serviceCode: '', serviceTypeCode: '', serviceName: '',
          unitPrice: inv.grandTotal || 0, quantity: 1,
          subtotal: inv.grandTotal || 0, consultFee: 0,
          revenue: inv.grandTotal || 0,
          discount: inv.totalDiscount || 0,
          collected: inv.paidAmount || 0,
          remaining: (inv.grandTotal || 0) - (inv.paidAmount || 0),
          injectionLot: '', injectionType: '',
          notes: inv.notes || '', paymentInfo: '',
        })
      } else {
        for (const item of items) {
          const svc = item.serviceCode ? serviceMap[item.serviceCode] : null
          const subtotal = (item.unitPrice || 0) * (item.quantity || 1)
          const disc = item.discountAmount || 0
          rows.push({
            ...baseRow,
            _id: `${inv._id}-${item.serviceCode}`,
            customerSource: doctor ? 'Đối tác giới thiệu' : 'Tự đến',
            serviceCode: item.serviceCode || '',
            serviceTypeCode: svc?.serviceTypeCode || '',
            serviceName: item.serviceName || svc?.name || '',
            unitPrice: item.unitPrice || 0,
            quantity: item.quantity || 1,
            subtotal,
            consultFee: 0,
            revenue: subtotal,
            discount: disc,
            collected: ['paid', 'partially_paid'].includes(inv.status) ? subtotal - disc : 0,
            remaining: ['paid', 'partially_paid'].includes(inv.status) ? 0 : subtotal - disc,
            injectionLot: '', injectionType: '',
            notes: inv.notes || '', paymentInfo: '',
          })
        }
      }
    }

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /reports/customer-detail
router.get('/customer-detail', requireAuth, requirePermission('reports.view'), async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query
    const filter = {}

    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom).toISOString()
      if (dateTo) {
        const end = new Date(dateTo)
        end.setDate(end.getDate() + 1)
        filter.createdAt.$lt = end.toISOString()
      }
    }

    const invoices = await Invoice.find(filter).sort({ createdAt: -1 }).limit(500).lean()

    const patientIds = [...new Set(invoices.map(b => b.patientId).filter(Boolean))]
    const patients = await Patient.find({ _id: { $in: patientIds } }).lean()
    const patientMap = Object.fromEntries(patients.map(p => [p._id, p]))

    const rows = invoices.map(inv => {
      const patient = patientMap[inv.patientId] || {}
      const totalAmount = inv.grandTotal || 0
      const totalDiscount = inv.totalDiscount || 0
      const paidAmount = inv.paidAmount || 0
      return {
        _id: inv._id,
        date: inv.createdAt,
        patientName: inv.patientName || patient.name || '',
        patientAddress: [patient.ward, patient.district, patient.province].filter(Boolean).join(', ') || patient.address || '',
        patientDob: patient.dob || '',
        amount: totalAmount,
        discount: totalDiscount,
        paid: paidAmount,
        collected: paidAmount,
        paymentMethod: PAYMENT_LABELS[inv.paymentMethod] || inv.paymentMethod || '',
      }
    })

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /reports/promotion-detail
router.get('/promotion-detail', requireAuth, requirePermission('reports.view'), async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query
    const filter = {}
    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom).toISOString()
      if (dateTo) {
        const end = new Date(dateTo)
        end.setDate(end.getDate() + 1)
        filter.createdAt.$lt = end.toISOString()
      }
    }
    // Only invoices with discounts
    filter.totalDiscount = { $gt: 0 }

    const invoices = await Invoice.find(filter).sort({ createdAt: -1 }).limit(500).lean()

    const patientIds = [...new Set(invoices.map(b => b.patientId).filter(Boolean))]
    const Promotion = require('../models/Promotion')
    const [patients, promotions] = await Promise.all([
      Patient.find({ _id: { $in: patientIds } }).lean(),
      Promotion.find({}).lean(),
    ])
    const patientMap = Object.fromEntries(patients.map(p => [p._id, p]))
    // Build a lookup: try to match discount to a promotion
    const promoList = promotions.sort((a, b) => (b.currentUsage || 0) - (a.currentUsage || 0))

    const rows = invoices.map(inv => {
      const patient = patientMap[inv.patientId] || {}
      const totalAmount = inv.grandTotal || 0
      const discountAmount = inv.totalDiscount || 0
      // Try matching promotion by code in notes or by active promos
      let promo = null
      if (inv.promoCode) {
        promo = promoList.find(p => p.code === inv.promoCode)
      }
      if (!promo && inv.promotionId) {
        promo = promoList.find(p => p._id === inv.promotionId)
      }
      if (!promo) {
        // Best-effort: pick first active promo
        promo = promoList.find(p => p.status === 'active') || promoList[0]
      }
      return {
        _id: inv._id,
        promoCode: promo?.code || inv.promoCode || '-',
        promoName: promo?.name || inv.promotionName || '-',
        date: inv.createdAt,
        patientName: inv.patientName || patient.name || '',
        patientAddress: [patient.ward, patient.district, patient.province].filter(Boolean).join(', ') || patient.address || '',
        paymentMethod: PAYMENT_LABELS[inv.paymentMethod] || inv.paymentMethod || '',
        totalAmount,
        discountAmount,
        netAmount: totalAmount - discountAmount,
      }
    })

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /reports/clinic-revenue
router.get('/clinic-revenue', requireAuth, requirePermission('reports.view'), async (req, res) => {
  try {
    const { dateFrom, dateTo, tab } = req.query
    const filter = {}

    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom).toISOString()
      if (dateTo) {
        const end = new Date(dateTo)
        end.setDate(end.getDate() + 1)
        filter.createdAt.$lt = end.toISOString()
      }
    }

    // tab=collection: only mixed/transfer payments (thu hộ)
    // tab=revenue (default): all
    if (tab === 'collection') {
      filter.paymentMethod = { $in: ['transfer', 'mixed'] }
    }

    const invoices = await Invoice.find(filter).sort({ createdAt: -1 }).limit(1000).lean()

    const patientIds = [...new Set(invoices.map(b => b.patientId).filter(Boolean))]
    const [patients, doctors, services] = await Promise.all([
      Patient.find({ _id: { $in: patientIds } }).lean(),
      ReferralDoctor.find({}).lean(),
      Service.find({}).lean(),
    ])
    const patientMap = Object.fromEntries(patients.map(p => [p._id, p]))
    const doctorMap = Object.fromEntries(doctors.map(d => [d.code, d]))
    const serviceMap = Object.fromEntries(services.map(s => [s.code, s]))

    // One row per invoice line item
    const rows = []
    for (const inv of invoices) {
      const patient = patientMap[inv.patientId] || {}
      const doctor = inv.referringDoctorCode ? doctorMap[inv.referringDoctorCode] : null

      const base = {
        date: inv.createdAt,
        invoiceNumber: inv.invoiceNumber || inv._id,
        doctorCode: doctor?.code || inv.referringDoctorCode || '',
        doctorName: doctor?.name || '',
        patientCode: patient.patientId || inv.patientId || '',
        patientName: inv.patientName || patient.name || '',
        patientAddress: [patient.ward, patient.district, patient.province].filter(Boolean).join(', ') || patient.address || '',
        patientDob: patient.dob || '',
        paymentMethod: PAYMENT_LABELS[inv.paymentMethod] || inv.paymentMethod || '',
      }

      const items = inv.items || []
      if (items.length === 0) {
        rows.push({
          ...base,
          _id: inv._id,
          serviceTypeCode: '',
          serviceName: '',
          amount: inv.grandTotal || 0,
          discount: inv.totalDiscount || 0,
          netAmount: (inv.grandTotal || 0) - (inv.totalDiscount || 0),
        })
      } else {
        for (const item of items) {
          const svc = item.serviceCode ? serviceMap[item.serviceCode] : null
          const amt = (item.unitPrice || 0) * (item.quantity || 1)
          const disc = item.discountAmount || 0
          rows.push({
            ...base,
            _id: `${inv._id}-${item.serviceCode}`,
            serviceTypeCode: svc?.serviceTypeCode || '',
            serviceName: item.serviceName || svc?.name || '',
            amount: amt,
            discount: disc,
            netAmount: amt - disc,
          })
        }
      }
    }

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /reports/refund-exchange
router.get('/refund-exchange', requireAuth, requirePermission('reports.view'), async (req, res) => {
  try {
    const { dateFrom, dateTo, tab } = req.query
    const filter = {}

    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom).toISOString()
      if (dateTo) {
        const end = new Date(dateTo)
        end.setDate(end.getDate() + 1)
        filter.createdAt.$lt = end.toISOString()
      }
    }

    // refund: cancelled/refunded invoices; exchange: modified invoices
    if (tab === 'exchange') {
      // Invoices that were updated (have updatedAt != createdAt) — service changes
      filter.status = { $in: ['issued', 'paid', 'partially_paid'] }
      filter.updatedAt = { $exists: true }
    } else {
      // Default: refunded/cancelled
      filter.status = { $in: ['refunded', 'cancelled'] }
    }

    const invoices = await Invoice.find(filter).sort({ createdAt: -1 }).limit(500).lean()

    const patientIds = [...new Set(invoices.map(b => b.patientId).filter(Boolean))]
    const [patients, doctors, services] = await Promise.all([
      Patient.find({ _id: { $in: patientIds } }).lean(),
      ReferralDoctor.find({}).lean(),
      Service.find({}).lean(),
    ])
    const patientMap = Object.fromEntries(patients.map(p => [p._id, p]))
    const doctorMap = Object.fromEntries(doctors.map(d => [d.code, d]))
    const serviceMap = Object.fromEntries(services.map(s => [s.code, s]))

    const rows = []
    for (const inv of invoices) {
      const patient = patientMap[inv.patientId] || {}
      const doctor = inv.referringDoctorCode ? doctorMap[inv.referringDoctorCode] : null

      const base = {
        date: inv.cancelledAt || inv.updatedAt || inv.createdAt,
        invoiceNumber: inv.invoiceNumber || inv._id,
        doctorCode: doctor?.code || inv.referringDoctorCode || '',
        doctorName: doctor?.name || '',
        patientCode: patient.patientId || inv.patientId || '',
        patientName: inv.patientName || patient.name || '',
        patientAddress: [patient.ward, patient.district, patient.province].filter(Boolean).join(', ') || patient.address || '',
        patientDob: patient.dob || '',
        reason: inv.cancelReason || '',
        paymentMethod: PAYMENT_LABELS[inv.paymentMethod] || inv.paymentMethod || '',
      }

      const items = inv.items || []
      if (items.length === 0) {
        rows.push({
          ...base,
          _id: inv._id,
          serviceTypeCode: '',
          serviceName: '',
          amount: inv.grandTotal || 0,
          discount: inv.totalDiscount || 0,
          netAmount: (inv.grandTotal || 0) - (inv.totalDiscount || 0),
        })
      } else {
        for (const item of items) {
          const svc = item.serviceCode ? serviceMap[item.serviceCode] : null
          const amt = (item.unitPrice || 0) * (item.quantity || 1)
          const disc = item.discountAmount || 0
          rows.push({
            ...base,
            _id: `${inv._id}-${item.serviceCode}`,
            serviceTypeCode: svc?.serviceTypeCode || '',
            serviceName: item.serviceName || svc?.name || '',
            amount: amt,
            discount: disc,
            netAmount: amt - disc,
          })
        }
      }
    }

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /reports/e-invoice
router.get('/e-invoice', requireAuth, requirePermission('reports.view'), async (req, res) => {
  try {
    const { dateFrom, dateTo, tab } = req.query
    const filter = {}

    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom).toISOString()
      if (dateTo) {
        const end = new Date(dateTo)
        end.setDate(end.getDate() + 1)
        filter.createdAt.$lt = end.toISOString()
      }
    }

    // Get all paid/issued invoices for stats
    const allFilter = { ...filter, status: { $in: ['paid', 'issued', 'partially_paid'] } }
    const allInvoices = await Invoice.find(allFilter).lean()

    // Simulate e-invoice status: invoices with issuedAt are "issued", others "not_issued"
    const notIssued = allInvoices.filter(inv => !inv.issuedAt || inv.status === 'paid')
    const issued = allInvoices.filter(inv => inv.issuedAt && inv.status === 'issued')

    const stats = {
      notIssuedCount: notIssued.length,
      notIssuedTotal: notIssued.reduce((s, inv) => s + (inv.grandTotal || 0), 0),
      issuedCount: issued.length,
      issuedTotal: issued.reduce((s, inv) => s + (inv.grandTotal || 0), 0),
    }

    const targetInvoices = tab === 'issued' ? issued : notIssued
    const patientIds = [...new Set(targetInvoices.map(b => b.patientId).filter(Boolean))]
    const patients = await Patient.find({ _id: { $in: patientIds } }).lean()
    const patientMap = Object.fromEntries(patients.map(p => [p._id, p]))

    const rows = targetInvoices.map(inv => {
      const patient = patientMap[inv.patientId] || {}
      return {
        _id: inv._id,
        date: inv.createdAt,
        invoiceNumber: inv.invoiceNumber || inv._id,
        patientName: inv.patientName || patient.name || '',
        patientPhone: inv.phone || patient.phone || '',
        email: patient.email || '',
        patientAddress: [patient.ward, patient.district, patient.province].filter(Boolean).join(', ') || patient.address || '',
        patientCode: patient.patientId || inv.patientId || '',
        amount: inv.grandTotal || 0,
      }
    })

    res.json({ rows, stats })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ═══════════════════════════════════════════════════════════════════
//  OPERATIONAL RADIOLOGY REPORTS (RIS analytics)
//  Computes from the Study collection — counts/breakdowns by
//  machine, modality group, radiologist, time-of-day, etc.
// ═══════════════════════════════════════════════════════════════════

// Common: build a date filter on Encounter.studyDate (YYYY-MM-DD prefix string)
function buildStudyDateFilter(dateFrom, dateTo) {
  const filter = {}
  if (dateFrom || dateTo) {
    filter.studyDate = {}
    if (dateFrom) filter.studyDate.$gte = dateFrom
    if (dateTo) filter.studyDate.$lte = dateTo + '\uffff'
  }
  return filter
}

function applyExtraFilters(filter, q) {
  if (q.modality) filter.modality = q.modality
  if (q.site) filter.site = q.site
  if (q.radiologist) filter.radiologist = q.radiologist
  // Only count completed reads for productivity reports unless ?includeAll=1
  if (!q.includeAll) {
    filter.status = { $in: ['reported', 'verified'] }
  }
  return filter
}

// GET /reports/rad/cases-by-machine
// Cases grouped by site (machine room) — one row per machine
router.get('/rad/cases-by-machine', requireAuth, requirePermission('rad-reports.view'), async (req, res) => {
  try {
    const filter = applyExtraFilters(buildStudyDateFilter(req.query.dateFrom, req.query.dateTo), req.query)
    const studies = await Encounter.find(filter).lean()

    const map = {}
    for (const s of studies) {
      const key = s.site || '(không rõ)'
      if (!map[key]) map[key] = { site: key, modalities: {}, count: 0 }
      map[key].count++
      const m = s.modality || '?'
      map[key].modalities[m] = (map[key].modalities[m] || 0) + 1
    }
    const total = studies.length || 1
    const rows = Object.values(map)
      .sort((a, b) => b.count - a.count)
      .map(r => ({
        site: r.site,
        count: r.count,
        modalityBreakdown: Object.entries(r.modalities).map(([m, c]) => `${m}:${c}`).join(', '),
        percent: ((r.count / total) * 100).toFixed(1),
      }))
    res.json({ rows, total: studies.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /reports/rad/cases-by-machine-group
// Cases grouped by modality (CT/MRI/XR/US)
router.get('/rad/cases-by-machine-group', requireAuth, requirePermission('rad-reports.view'), async (req, res) => {
  try {
    const filter = applyExtraFilters(buildStudyDateFilter(req.query.dateFrom, req.query.dateTo), req.query)
    const studies = await Encounter.find(filter).lean()

    const map = {}
    for (const s of studies) {
      const key = s.modality || '(không rõ)'
      if (!map[key]) map[key] = { modality: key, sites: new Set(), radiologists: new Set(), count: 0 }
      map[key].count++
      if (s.site) map[key].sites.add(s.site)
      if (s.radiologist) map[key].radiologists.add(s.radiologist)
    }
    const total = studies.length || 1
    const rows = Object.values(map)
      .sort((a, b) => b.count - a.count)
      .map(r => ({
        modality: r.modality,
        count: r.count,
        siteCount: r.sites.size,
        radiologistCount: r.radiologists.size,
        percent: ((r.count / total) * 100).toFixed(1),
      }))
    res.json({ rows, total: studies.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /reports/rad/cases-by-radiologist
// Productivity: case count per reading doctor
router.get('/rad/cases-by-radiologist', requireAuth, requirePermission('rad-reports.view'), async (req, res) => {
  try {
    const filter = applyExtraFilters(buildStudyDateFilter(req.query.dateFrom, req.query.dateTo), req.query)
    const studies = await Encounter.find(filter).lean()

    const map = {}
    for (const s of studies) {
      const key = s.radiologist || '(chưa giao)'
      if (!map[key]) {
        map[key] = {
          radiologist: key,
          radiologistName: s.radiologistName || '',
          modalities: {},
          count: 0,
          turnaroundSum: 0,
          turnaroundCount: 0,
        }
      }
      map[key].count++
      const m = s.modality || '?'
      map[key].modalities[m] = (map[key].modalities[m] || 0) + 1
      // Turnaround = reportedAt - studyDate (ms)
      if (s.reportedAt && s.studyDate) {
        const t = new Date(s.reportedAt).getTime() - new Date(s.studyDate).getTime()
        if (t > 0 && t < 30 * 24 * 3600 * 1000) {
          map[key].turnaroundSum += t
          map[key].turnaroundCount++
        }
      }
    }
    const total = studies.length || 1
    const rows = Object.values(map)
      .sort((a, b) => b.count - a.count)
      .map(r => ({
        radiologist: r.radiologist,
        radiologistName: r.radiologistName,
        count: r.count,
        modalityBreakdown: Object.entries(r.modalities).map(([m, c]) => `${m}:${c}`).join(', '),
        avgTurnaroundHours: r.turnaroundCount
          ? (r.turnaroundSum / r.turnaroundCount / 3600000).toFixed(1)
          : '-',
        percent: ((r.count / total) * 100).toFixed(1),
      }))
    res.json({ rows, total: studies.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /reports/rad/cases-by-radiologist-modality
// Cross-tab: rows = radiologist, columns = modality
router.get('/rad/cases-by-radiologist-modality', requireAuth, requirePermission('rad-reports.view'), async (req, res) => {
  try {
    const filter = applyExtraFilters(buildStudyDateFilter(req.query.dateFrom, req.query.dateTo), req.query)
    const studies = await Encounter.find(filter).lean()

    const modalitySet = new Set()
    const map = {}
    for (const s of studies) {
      const key = s.radiologist || '(chưa giao)'
      if (!map[key]) map[key] = { radiologist: key, radiologistName: s.radiologistName || '', counts: {}, total: 0 }
      const m = s.modality || '?'
      modalitySet.add(m)
      map[key].counts[m] = (map[key].counts[m] || 0) + 1
      map[key].total++
    }
    const modalities = [...modalitySet].sort()
    const rows = Object.values(map)
      .sort((a, b) => b.total - a.total)
      .map(r => {
        const row = { radiologist: r.radiologist, radiologistName: r.radiologistName, total: r.total }
        modalities.forEach(m => { row['m_' + m] = r.counts[m] || 0 })
        return row
      })
    res.json({ rows, modalities, total: studies.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /reports/rad/cases-by-time
// Distribution by hour-of-day (uses reportedAt for completion, falls back to studyDate)
router.get('/rad/cases-by-time', requireAuth, requirePermission('rad-reports.view'), async (req, res) => {
  try {
    const filter = applyExtraFilters(buildStudyDateFilter(req.query.dateFrom, req.query.dateTo), req.query)
    const studies = await Encounter.find(filter).lean()

    const granularity = req.query.granularity || 'hour' // 'hour' | 'day' | 'weekday'
    const buckets = {}

    for (const s of studies) {
      const ts = s.reportedAt || s.studyDate
      if (!ts) continue
      const d = new Date(ts)
      if (isNaN(d)) continue
      let key
      if (granularity === 'day') {
        key = d.toISOString().slice(0, 10)
      } else if (granularity === 'weekday') {
        key = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()]
      } else {
        key = String(d.getHours()).padStart(2, '0') + ':00'
      }
      buckets[key] = (buckets[key] || 0) + 1
    }
    const rows = Object.entries(buckets)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, count]) => ({ bucket, count }))
    res.json({ rows, total: studies.length, granularity })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /reports/rad/services-detail
// One row per study with full clinical details — operational equivalent of revenue-detail
router.get('/rad/services-detail', requireAuth, requirePermission('rad-reports.view'), async (req, res) => {
  try {
    const filter = applyExtraFilters(buildStudyDateFilter(req.query.dateFrom, req.query.dateTo), req.query)
    const studies = await Encounter.find(filter).sort({ studyDate: -1 }).limit(1000).lean()

    const rows = studies.map(s => ({
      _id: s._id,
      studyUID: s.studyUID,
      patientId: s.patientId,
      patientName: s.patientName,
      gender: s.gender,
      dob: s.dob,
      modality: s.modality,
      bodyPart: s.bodyPart,
      site: s.site,
      clinicalInfo: s.clinicalInfo,
      priority: s.priority,
      status: s.status,
      scheduledDate: s.scheduledDate,
      studyDate: s.studyDate,
      reportedAt: s.reportedAt,
      verifiedAt: s.verifiedAt,
      technicianName: s.technicianName,
      radiologistName: s.radiologistName,
      imageCount: s.imageCount,
    }))
    res.json({ rows, total: rows.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /reports/rad/patient-list
// Patients who had studies read in the date range (deduplicated by patientId)
router.get('/rad/patient-list', requireAuth, requirePermission('rad-reports.view'), async (req, res) => {
  try {
    // Force completed-only for "patients with read results"
    const filter = buildStudyDateFilter(req.query.dateFrom, req.query.dateTo)
    if (req.query.modality) filter.modality = req.query.modality
    if (req.query.site) filter.site = req.query.site
    filter.status = { $in: ['reported', 'verified'] }

    const studies = await Encounter.find(filter).sort({ studyDate: -1 }).lean()
    const map = {}
    for (const s of studies) {
      const key = s.patientId || s._id
      if (!map[key]) {
        map[key] = {
          patientId: s.patientId,
          patientName: s.patientName,
          gender: s.gender,
          dob: s.dob,
          studies: [],
          modalities: new Set(),
          lastStudyDate: s.studyDate,
        }
      }
      map[key].studies.push({
        modality: s.modality,
        bodyPart: s.bodyPart,
        site: s.site,
        studyDate: s.studyDate,
        radiologistName: s.radiologistName,
        status: s.status,
      })
      map[key].modalities.add(s.modality)
      if (s.studyDate > map[key].lastStudyDate) map[key].lastStudyDate = s.studyDate
    }
    const rows = Object.values(map)
      .sort((a, b) => (b.lastStudyDate || '').localeCompare(a.lastStudyDate || ''))
      .map(p => ({
        patientId: p.patientId,
        patientName: p.patientName,
        gender: p.gender,
        dob: p.dob,
        studyCount: p.studies.length,
        modalities: [...p.modalities].join(', '),
        lastStudyDate: p.lastStudyDate,
        lastRadiologist: p.studies[0]?.radiologistName || '',
      }))
    res.json({ rows, total: rows.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Referral revenue report ───────────────────────────────────────────────
// Aggregates invoices by (referralType, referralId). Walk-in/direct-source rows
// come back under synthetic ids so they're visible too.
router.get('/referral-revenue', requireAuth, requirePermission('referral.view'), async (req, res) => {
  try {
    const { dateFrom, dateTo, branch, referralType } = req.query
    const filter = {}
    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom).toISOString()
      if (dateTo) {
        const end = new Date(dateTo); end.setDate(end.getDate() + 1)
        filter.createdAt.$lt = end.toISOString()
      }
    }
    if (branch) filter.site = { $regex: branch, $options: 'i' }
    if (referralType) filter.referralType = referralType

    const invoices = await Invoice.find(filter).lean()

    const TYPE_LABELS = { doctor: 'Bác sĩ giới thiệu', facility: 'Cơ sở giới thiệu', salesperson: 'Nhân viên kinh doanh', '': 'Trực tiếp' }
    const buckets = new Map()
    for (const inv of invoices) {
      const type = inv.referralType || ''
      // Group walk-ins by sourceName so "Tự đến" / "Online Marketing" each get a row.
      // Partner referrals group by referralId.
      const key = type ? `${type}::${inv.referralId || ''}` : `direct::${inv.sourceCode || 'UNKNOWN'}`
      if (!buckets.has(key)) {
        buckets.set(key, {
          referralType: type,
          referralTypeLabel: TYPE_LABELS[type] || type,
          referralId: inv.referralId || '',
          referralName: inv.referralName || inv.sourceName || 'Không xác định',
          sourceCode: inv.sourceCode || '',
          sourceName: inv.sourceName || '',
          effectiveSalespersonId: inv.effectiveSalespersonId || '',
          effectiveSalespersonName: inv.effectiveSalespersonName || '',
          invoiceCount: 0,
          serviceCount: 0,
          grandTotal: 0,
          paidAmount: 0,
          outstanding: 0,
        })
      }
      const row = buckets.get(key)
      row.invoiceCount += 1
      row.serviceCount += (inv.items || []).reduce((s, it) => s + (it.quantity || 1), 0)
      row.grandTotal += inv.grandTotal || 0
      row.paidAmount += inv.paidAmount || 0
      row.outstanding += Math.max(0, (inv.grandTotal || 0) - (inv.paidAmount || 0))
    }

    const rows = Array.from(buckets.values()).sort((a, b) => b.grandTotal - a.grandTotal)
    res.json({ rows, total: rows.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Salesperson (NVKD) KPI report ─────────────────────────────────────────
// Each NVKD's attributed revenue, split by attribution path: direct / via bác sĩ / via cơ sở.
router.get('/salesperson-kpi', requireAuth, requirePermission('kpi-sales.view'), async (req, res) => {
  try {
    const { dateFrom, dateTo, branch } = req.query
    const filter = {}
    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom).toISOString()
      if (dateTo) {
        const end = new Date(dateTo); end.setDate(end.getDate() + 1)
        filter.createdAt.$lt = end.toISOString()
      }
    }
    if (branch) filter.site = { $regex: branch, $options: 'i' }
    filter.effectiveSalespersonId = { $exists: true, $ne: '' }

    const invoices = await Invoice.find(filter).lean()
    const salesIds = [...new Set(invoices.map(i => i.effectiveSalespersonId).filter(Boolean))]
    const users = await User.find({ _id: { $in: salesIds } }).select('_id displayName department').lean()
    const userMap = Object.fromEntries(users.map(u => [u._id, u]))

    const buckets = new Map()
    for (const inv of invoices) {
      const sid = inv.effectiveSalespersonId
      if (!buckets.has(sid)) {
        const u = userMap[sid] || {}
        buckets.set(sid, {
          salespersonId: sid,
          salespersonName: u.displayName || inv.effectiveSalespersonName || sid,
          department: u.department || '',
          directCount: 0, viaDoctorCount: 0, viaFacilityCount: 0,
          invoiceCount: 0, grandTotal: 0, paidAmount: 0, outstanding: 0,
        })
      }
      const row = buckets.get(sid)
      if (inv.referralType === 'salesperson') row.directCount += 1
      else if (inv.referralType === 'doctor')  row.viaDoctorCount += 1
      else if (inv.referralType === 'facility') row.viaFacilityCount += 1
      row.invoiceCount += 1
      row.grandTotal += inv.grandTotal || 0
      row.paidAmount += inv.paidAmount || 0
      row.outstanding += Math.max(0, (inv.grandTotal || 0) - (inv.paidAmount || 0))
    }

    const rows = Array.from(buckets.values()).sort((a, b) => b.grandTotal - a.grandTotal)
    res.json({ rows, total: rows.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
