// Consolidated routes for batch additions:
//   - Report templates (RIS productivity)
//   - Audit log viewer
//   - Notifications (incl. critical findings)
//   - Today dashboard (live operational metrics)
//   - Global search (cross-collection)
//   - DICOM Modality Worklist (MWL) preview/sync
const express = require('express')
const router = express.Router()
const { requireAuth, requirePermission } = require('../middleware/auth')

const Encounter = require('../models/Encounter')
const Report = require('../models/Report')
const ReportTemplate = require('../models/ReportTemplate')
const AuditLog = require('../models/AuditLog')
const Notification = require('../models/Notification')
const Patient = require('../models/Patient')
const Service = require('../models/Service')
const ReferralDoctor = require('../models/ReferralDoctor')
const User = require('../models/User')
const Invoice = require('../models/Invoice')

// ═══════════════════════════════════════════════════════════════════
//  REPORT TEMPLATES
// ═══════════════════════════════════════════════════════════════════

// GET /api/templates?modality=&bodyPart=
router.get('/templates', requireAuth, async (req, res) => {
  try {
    const filter = {
      $or: [
        { ownerId: req.user.username },
        { ownerId: '' },
        { ownerId: null },
        { isShared: true },
      ],
    }
    if (req.query.modality) filter.$and = [{ $or: [{ modality: req.query.modality }, { modality: '' }, { modality: null }] }]
    if (req.query.bodyPart) {
      filter.$and = (filter.$and || []).concat([{ $or: [{ bodyPart: { $regex: req.query.bodyPart, $options: 'i' } }, { bodyPart: '' }, { bodyPart: null }] }])
    }
    const templates = await ReportTemplate.find(filter).sort({ useCount: -1, name: 1 }).lean()
    res.json(templates)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/templates', requireAuth, async (req, res) => {
  try {
    const now = new Date().toISOString()
    const t = new ReportTemplate({
      ...req.body,
      ownerId: req.body.isShared ? '' : req.user.username,
      createdAt: now,
      updatedAt: now,
    })
    await t.save()
    res.json(t)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/templates/:id', requireAuth, async (req, res) => {
  try {
    const existing = await ReportTemplate.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy mẫu' })
    if (existing.ownerId && existing.ownerId !== req.user.username && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Không có quyền chỉnh sửa mẫu của người khác' })
    }
    Object.assign(existing, req.body, { updatedAt: new Date().toISOString() })
    await existing.save()
    res.json(existing)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/templates/:id', requireAuth, async (req, res) => {
  try {
    const existing = await ReportTemplate.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy mẫu' })
    if (existing.ownerId && existing.ownerId !== req.user.username && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Không có quyền xóa mẫu của người khác' })
    }
    await ReportTemplate.deleteOne({ _id: req.params.id })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/templates/:id/use', requireAuth, async (req, res) => {
  try {
    await ReportTemplate.updateOne(
      { _id: req.params.id },
      { $inc: { useCount: 1 }, $set: { lastUsedAt: new Date().toISOString() } }
    )
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════════════
//  AUDIT LOG VIEWER
// ═══════════════════════════════════════════════════════════════════
router.get('/audit-log', requireAuth, requirePermission('audit.view'), async (req, res) => {
  try {
    const filter = {}
    if (req.query.username) filter.username = req.query.username
    if (req.query.resource) filter.resource = req.query.resource
    if (req.query.resourceId) filter.resourceId = req.query.resourceId
    if (req.query.method) filter.method = req.query.method
    if (req.query.path) filter.path = { $regex: req.query.path }
    if (req.query.dateFrom || req.query.dateTo) {
      filter.ts = {}
      if (req.query.dateFrom) filter.ts.$gte = req.query.dateFrom
      if (req.query.dateTo) filter.ts.$lte = req.query.dateTo + 'T23:59:59.999Z'
    }
    const limit = Math.min(+(req.query.limit || 500), 1000)
    const logs = await AuditLog.find(filter).sort({ ts: -1 }).limit(limit).lean()
    res.json(logs)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════════════
//  NOTIFICATIONS (incl. critical findings inbox)
// ═══════════════════════════════════════════════════════════════════
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const u = req.user
    // Show notifications matching me, my role, my site — or untargeted (broadcast)
    const filter = {
      $or: [
        { toUsers: u.username },
        { toRoles: u.role },
        { toSites: u.department },
        { toUsers: { $size: 0 }, toRoles: { $size: 0 }, toSites: { $size: 0 } }, // broadcast
      ],
    }
    if (req.query.unreadOnly === '1') filter.readBy = { $ne: u.username }
    if (req.query.severity) filter.severity = req.query.severity
    const items = await Notification.find(filter).sort({ ts: -1 }).limit(100).lean()
    const unread = items.filter(n => !(n.readBy || []).includes(u.username)).length
    res.json({ items, unread })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await Notification.updateOne({ _id: req.params.id }, { $addToSet: { readBy: req.user.username } })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/notifications/:id/ack', requireAuth, async (req, res) => {
  try {
    await Notification.updateOne(
      { _id: req.params.id },
      { $addToSet: { ackedBy: req.user.username, readBy: req.user.username } }
    )
    // If this is a critical_finding notification, also mark the report as acked
    const n = await Notification.findById(req.params.id).lean()
    if (n && n.type === 'critical_finding' && n.resource === 'report' && n.resourceId) {
      await Report.updateOne(
        { _id: n.resourceId },
        { $set: { criticalAckedBy: req.user.username, criticalAckedAt: new Date().toISOString() } }
      )
    }
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════════════
//  TODAY DASHBOARD — live operational snapshot
// ═══════════════════════════════════════════════════════════════════
router.get('/dashboard/today', requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const startOfToday = today + 'T00:00:00.000Z'
    const startOfYesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })()
    const startOfWeekAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })()

    // Filter by site for staff/manager roles
    const studyFilter = {}
    if (req.user.role === 'nhanvien' || req.user.role === 'truongphong') studyFilter.site = req.user.department
    if (req.user.role === 'bacsi') studyFilter.radiologist = req.user.username

    const [
      todayStudies,
      yesterdayStudies,
      weekStudies,
      pendingStudies,
      criticalReports,
      todayInvoices,
      lowStockCount,
    ] = await Promise.all([
      Encounter.find({ ...studyFilter, studyDate: { $gte: today } }).lean(),
      Encounter.find({ ...studyFilter, studyDate: { $gte: startOfYesterday, $lt: today } }).lean(),
      Encounter.find({ ...studyFilter, studyDate: { $gte: startOfWeekAgo } }).lean(),
      Encounter.find({ ...studyFilter, status: { $in: ['scheduled', 'in_progress', 'pending_read', 'reading'] } }).lean(),
      Report.find({ criticalFinding: true, criticalAckedBy: { $in: ['', null] } }).limit(20).lean(),
      Invoice.find({ createdAt: { $gte: startOfToday } }).lean().catch(() => []),
      // Inventory low-stock check: skip if model isn't loaded
      (async () => {
        try {
          const Supply = require('../models/Supply')
          const supplies = await Supply.find({ minStock: { $gt: 0 } }).lean()
          // crude: count supplies whose name appears in low-stock list (we don't have aggregated qty here)
          return supplies.filter(s => (s.currentStock || 0) < (s.minStock || 0)).length
        } catch (e) { return 0 }
      })(),
    ])

    // Per-site throughput
    const bySite = {}
    todayStudies.forEach(s => {
      const k = s.site || '?'
      if (!bySite[k]) bySite[k] = { site: k, total: 0, completed: 0, pending: 0 }
      bySite[k].total++
      if (s.status === 'reported' || s.status === 'verified') bySite[k].completed++
      else bySite[k].pending++
    })

    // By modality today
    const byModality = {}
    todayStudies.forEach(s => {
      const k = s.modality || '?'
      byModality[k] = (byModality[k] || 0) + 1
    })

    // Hourly trend (today vs yesterday for comparison)
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: String(h).padStart(2, '0') + ':00', today: 0, yesterday: 0 }))
    todayStudies.forEach(s => {
      const ts = s.reportedAt || s.studyDate
      if (!ts) return
      const h = new Date(ts).getHours()
      if (!isNaN(h)) hourly[h].today++
    })
    yesterdayStudies.forEach(s => {
      const ts = s.reportedAt || s.studyDate
      if (!ts) return
      const h = new Date(ts).getHours()
      if (!isNaN(h)) hourly[h].yesterday++
    })

    // Active radiologists today
    const radiologistMap = {}
    todayStudies.forEach(s => {
      if (!s.radiologist) return
      const k = s.radiologist
      if (!radiologistMap[k]) radiologistMap[k] = { username: k, name: s.radiologistName || k, count: 0 }
      radiologistMap[k].count++
    })

    res.json({
      ts: new Date().toISOString(),
      summary: {
        todayCount: todayStudies.length,
        yesterdayCount: yesterdayStudies.length,
        weekCount: weekStudies.length,
        pendingCount: pendingStudies.length,
        criticalCount: criticalReports.length,
        revenueToday: todayInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0),
        invoiceCountToday: todayInvoices.length,
        lowStockCount,
      },
      bySite: Object.values(bySite).sort((a, b) => b.total - a.total),
      byModality: Object.entries(byModality).map(([modality, count]) => ({ modality, count })),
      hourly,
      activeRadiologists: Object.values(radiologistMap).sort((a, b) => b.count - a.count),
      criticalFindings: criticalReports.map(r => ({
        _id: r._id,
        studyId: r.studyId,
        criticalNote: r.criticalNote,
        radiologistName: r.radiologistName,
        finalizedAt: r.finalizedAt,
      })),
    })
  } catch (err) {
    console.error('[dashboard/today]', err)
    res.status(500).json({ error: err.message })
  }
})

// ═══════════════════════════════════════════════════════════════════
//  DASHBOARD EXTRAS — supplemental metrics for the new Dashboard pages
//  (Lâm Sàng / Vận Hành / Tài Chính). Reuses /dashboard/today for the
//  bulk of KPIs — this endpoint fills in the 7-day and finance gaps.
// ═══════════════════════════════════════════════════════════════════
router.get('/dashboard/extras', requireAuth, async (req, res) => {
  try {
    const now = new Date()
    const iso = d => d.toISOString().slice(0, 10)
    const todayStr = iso(now)
    const startOfWeekAgo = (() => { const d = new Date(now); d.setDate(d.getDate() - 6); return iso(d) })()
    const in30Days = (() => { const d = new Date(now); d.setDate(d.getDate() + 30); return iso(d) })()

    const studyFilter = {}
    if (req.user.role === 'nhanvien' || req.user.role === 'truongphong') studyFilter.site = req.user.department
    if (req.user.role === 'bacsi') studyFilter.radiologist = req.user.username

    const [weekStudies, todayStudies, criticalReports7d, unpaidInvoices, expiringLots] = await Promise.all([
      Encounter.find({ ...studyFilter, studyDate: { $gte: startOfWeekAgo } }).lean(),
      Encounter.find({ ...studyFilter, studyDate: { $gte: todayStr } }).lean(),
      Report.find({ criticalFinding: true, finalizedAt: { $gte: startOfWeekAgo } }).sort({ finalizedAt: -1 }).limit(20).lean(),
      Invoice.find({ status: { $in: ['issued', 'partially_paid'] } }).lean().catch(() => []),
      (async () => {
        try {
          const InventoryLot = require('../models/InventoryLot')
          return await InventoryLot.find({
            status: 'available',
            expiryDate: { $gte: todayStr, $lte: in30Days },
          }).lean()
        } catch (e) { return [] }
      })(),
    ])

    // Cases per day — last 7 days (fills missing days with 0)
    const dayBuckets = {}
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); dayBuckets[iso(d)] = 0 }
    weekStudies.forEach(s => {
      const k = (s.studyDate || '').slice(0, 10)
      if (k in dayBuckets) dayBuckets[k]++
    })
    const casesLast7Days = Object.entries(dayBuckets).map(([date, count]) => ({ date, count }))

    // Average TAT (studyDate → reportedAt) for cases reported today
    const reportedToday = todayStudies.filter(s => s.reportedAt && s.studyDate)
    let avgTATMinutes = 0
    if (reportedToday.length > 0) {
      const totalMin = reportedToday.reduce((sum, s) => {
        const a = new Date(s.studyDate).getTime()
        const b = new Date(s.reportedAt).getTime()
        return sum + Math.max(0, (b - a) / 60000)
      }, 0)
      avgTATMinutes = Math.round(totalMin / reportedToday.length)
    }

    const unpaidAmount = unpaidInvoices.reduce((s, i) => s + Math.max(0, (i.grandTotal || 0) - (i.paidAmount || 0)), 0)

    res.json({
      ts: now.toISOString(),
      casesLast7Days,
      avgTATMinutes,
      reportedTodayCount: reportedToday.length,
      criticalFindings7d: criticalReports7d.map(r => ({
        _id: r._id,
        studyId: r.studyId,
        criticalNote: r.criticalNote,
        radiologistName: r.radiologistName,
        finalizedAt: r.finalizedAt,
        ackedBy: r.criticalAckedBy || null,
      })),
      unpaidInvoices: { count: unpaidInvoices.length, amount: unpaidAmount },
      expiringLots: {
        count: expiringLots.length,
        days: 30,
        items: expiringLots.slice(0, 10).map(l => ({
          _id: l._id,
          supplyId: l.supplyId,
          currentQuantity: l.currentQuantity,
          expiryDate: l.expiryDate,
          site: l.site,
        })),
      },
    })
  } catch (err) {
    console.error('[dashboard/extras]', err)
    res.status(500).json({ error: err.message })
  }
})

// ═══════════════════════════════════════════════════════════════════
//  GLOBAL SEARCH — across patients, studies, services, employees
// ═══════════════════════════════════════════════════════════════════
router.get('/search', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim()
    if (!q || q.length < 2) return res.json({ patients: [], studies: [], services: [], employees: [], referralDoctors: [] })
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

    const [patients, studies, services, employees, referralDoctors] = await Promise.all([
      Patient.find({ $or: [{ name: re }, { phone: re }, { patientId: re }, { _id: re }, { guardianName: re }, { guardianPhone: re }] }).limit(8).lean(),
      Encounter.find({ $or: [{ patientName: re }, { patientId: re }, { studyUID: re }, { _id: re }] }).limit(8).lean(),
      Service.find({ $or: [{ name: re }, { code: re }] }).limit(6).lean(),
      User.find({ $or: [{ displayName: re }, { _id: re }, { phone: re }] }).select('-password').limit(6).lean(),
      ReferralDoctor.find({ $or: [{ name: re }, { code: re }, { phone: re }, { workplace: re }] }).limit(6).lean(),
    ])
    res.json({
      patients:        patients.map(p => ({ id: p._id, label: p.name, sub: `${p.patientId || ''} · ${p.phone || ''}`, link: '/catalogs/patients' })),
      studies:         studies.map(s => ({ id: s._id, label: `${s.patientName} (${s.modality || ''})`, sub: `${s.studyDate || ''} · ${s.bodyPart || ''}`, link: '/ris' })),
      services:        services.map(s => ({ id: s._id, label: s.name, sub: s.code, link: '/catalogs/services' })),
      employees:       employees.map(e => ({ id: e._id, label: e.displayName || e._id, sub: `${e._id} · ${e.phone || ''}`, link: '/hr/employees' })),
      referralDoctors: referralDoctors.map(d => ({ id: d._id, label: d.name, sub: `${d.code || ''} · ${d.workplace || ''}`, link: '/catalogs/referral-doctors' })),
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════════════
//  MODALITY WORKLIST (MWL) preview + manual sync trigger
//  This route exposes the data Orthanc's worklist plugin would serve.
//  Full DICOM C-FIND requires the Orthanc worklist plugin to read .wl
//  files from a shared volume — see maec-app/pacs/orthanc.json.
// ═══════════════════════════════════════════════════════════════════
router.get('/mwl', requireAuth, async (req, res) => {
  try {
    const filter = { status: { $in: ['scheduled', 'in_progress'] } }
    if (req.user.role === 'nhanvien' || req.user.role === 'truongphong') filter.site = req.user.department
    if (req.query.modality) filter.modality = req.query.modality
    if (req.query.site) filter.site = req.query.site

    const studies = await Encounter.find(filter).sort({ scheduledDate: 1 }).limit(200).lean()
    const items = studies.map(s => ({
      // DICOM tag mapping (informational — these names are what scanners expect)
      AccessionNumber:                       s._id || '',
      PatientID:                             s.patientId || '',
      PatientName:                           (s.patientName || '').replace(/\s+/g, '^'),
      PatientBirthDate:                      (s.dob || '').replace(/-/g, ''),
      PatientSex:                            s.gender || '',
      StudyInstanceUID:                      s.studyUID || '',
      RequestedProcedureID:                  s._id,
      RequestedProcedureDescription:         s.bodyPart || '',
      ScheduledStationAETitle:               s.site ? `MAEC_${(s.site || '').toUpperCase().replace(/\s+/g, '_').slice(0, 12)}` : 'MAEC',
      ScheduledProcedureStepStartDate:       (s.scheduledDate || '').slice(0, 10).replace(/-/g, ''),
      ScheduledProcedureStepStartTime:       (s.scheduledDate || '').slice(11, 19).replace(/:/g, ''),
      Modality:                              s.modality || '',
      ScheduledPerformingPhysicianName:      s.technicianName || '',
      // Internal MAEC fields
      _internal: {
        studyDbId: s._id,
        priority: s.priority,
        clinicalInfo: s.clinicalInfo,
        site: s.site,
      },
    }))
    res.json({
      count: items.length,
      generatedAt: new Date().toISOString(),
      items,
      note: 'Orthanc worklist plugin path: /var/lib/orthanc/worklists/. Files must be DICOM Worklist (.wl) format. POST /api/mwl/sync to write items.',
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/mwl/sync — admin only, marks worklist items as "pushed"
// Real sync requires writing .wl files; this endpoint stamps Encounter.mwlSyncedAt
router.post('/mwl/sync', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'truongphong') {
      return res.status(403).json({ error: 'Chỉ admin/trưởng phòng được đẩy worklist' })
    }
    const ids = Array.isArray(req.body.studyIds) ? req.body.studyIds : null
    const filter = { status: { $in: ['scheduled', 'in_progress'] } }
    if (ids) filter._id = { $in: ids }
    const result = await Encounter.updateMany(filter, { $set: { mwlSyncedAt: new Date().toISOString() } })
    res.json({ ok: true, syncedCount: result.modifiedCount || result.nModified || 0 })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════════════
//  REPORT SIGNERS — radiologist + technician with snapshot signatures
// ═══════════════════════════════════════════════════════════════════

// GET /api/signers?role=bacsi  — list potential signers with their signature URLs
router.get('/signers', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.role) filter.role = req.query.role
    const users = await User.find(filter).select('_id displayName role department signatureUrl').lean()
    res.json(users.map(u => ({
      username:     u._id,
      displayName:  u.displayName || u._id,
      role:         u.role,
      department:   u.department,
      signatureUrl: u.signatureUrl || '',
      hasSignature: !!u.signatureUrl,
    })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/reports/:reportId/sign — sign as radiologist or technician
// body: { kind: 'radiologist' | 'technician', signerId?: string }
router.post('/reports/:reportId/sign', requireAuth, async (req, res) => {
  try {
    const Report = require('../models/Report')
    const report = await Report.findById(req.params.reportId)
    if (!report) return res.status(404).json({ error: 'Không tìm thấy kết quả' })
    const kind = req.body.kind
    const signerId = req.body.signerId || req.user.username
    const signer = await User.findById(signerId).lean()
    if (!signer) return res.status(404).json({ error: 'Không tìm thấy người ký' })
    const now = new Date().toISOString()
    if (kind === 'radiologist') {
      report.radiologistId = signer._id
      report.radiologistName = signer.displayName || signer._id
      report.radiologistSignatureUrl = signer.signatureUrl || ''
      report.finalizedAt = now
      report.status = 'final'
    } else if (kind === 'technician') {
      report.technicianSignerId = signer._id
      report.technicianSignerName = signer.displayName || signer._id
      report.technicianSignatureUrl = signer.signatureUrl || ''
      report.technicianSignedAt = now
    } else {
      return res.status(400).json({ error: 'kind phải là radiologist hoặc technician' })
    }
    report.updatedAt = now
    await report.save()
    res.json(report)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/users/:username/signature — upload/replace signature image (data URL)
router.post('/users/:username/signature', requireAuth, async (req, res) => {
  try {
    if (req.user.username !== req.params.username && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ chính chủ hoặc admin được cập nhật chữ ký' })
    }
    const { signatureUrl } = req.body
    if (!signatureUrl || !signatureUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'signatureUrl phải là data URL ảnh' })
    }
    if (signatureUrl.length > 200_000) {
      return res.status(400).json({ error: 'Chữ ký quá lớn (>200KB sau base64)' })
    }
    const u = await User.findByIdAndUpdate(req.params.username, { $set: { signatureUrl } }, { new: true })
    if (!u) return res.status(404).json({ error: 'Không tìm thấy người dùng' })
    res.json({ ok: true, signatureUrl: u.signatureUrl })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════════════
//  EXAMINATION HISTORY (rail) — all studies of a patient with reports
// ═══════════════════════════════════════════════════════════════════
router.get('/exam-history/:patientId', requireAuth, async (req, res) => {
  try {
    const Report = require('../models/Report')
    const studies = await Encounter.find({ patientId: req.params.patientId })
      .sort({ studyDate: -1 })
      .lean()
    const studyIds = studies.map(s => s._id)
    const reports = await Report.find({ studyId: { $in: studyIds } }).lean()
    const byStudy = Object.fromEntries(reports.map(r => [r.studyId, r]))
    const items = studies.map(s => ({
      _id: s._id,
      studyUID: s.studyUID,
      studyDate: s.studyDate,
      modality: s.modality,
      bodyPart: s.bodyPart,
      site: s.site,
      status: s.status,
      hasReport: !!byStudy[s._id],
      reportStatus: byStudy[s._id]?.status,
      reportImpression: (byStudy[s._id]?.impression || '').slice(0, 120),
      radiologistName: s.radiologistName,
    }))
    res.json(items)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
