const express = require('express')
const crypto = require('crypto')
const router = express.Router()
const Study = require('../models/Study')
const Report = require('../models/Report')
const User = require('../models/User')
const StudyAnnotation = require('../models/StudyAnnotation')
const KeyImage = require('../models/KeyImage')
const Appointment = require('../models/Appointment')
const Invoice = require('../models/Invoice')
const Supply = require('../models/Supply')
const SupplyServiceMapping = require('../models/SupplyServiceMapping')
const InventoryLot = require('../models/InventoryLot')
const InventoryTransaction = require('../models/InventoryTransaction')
const { requireAuth, requirePermission } = require('../middleware/auth')

const ORTHANC_BASE = process.env.ORTHANC_URL || 'http://localhost:8042'
// Public URL the browser uses to open the OHIF viewer
const _rawOhif = process.env.OHIF_URL || 'http://localhost:3000'
const OHIF_PUBLIC = _rawOhif.startsWith('http') ? _rawOhif : `https://${_rawOhif}`

// Helper: generate a fake DICOM-style Study UID
function genStudyUID() {
  return `1.2.840.10008.5.1.4.1.1.2.${Date.now()}.${Math.floor(Math.random() * 100000)}`
}

// ─── Consumables helpers ──────────────────────────────────────────────────────

// Derive the services ordered for a study via its appointment → invoice chain.
async function getStudyServices(studyId) {
  const appt = await Appointment.findOne({ studyId }).lean()
  if (!appt) return []
  const invoice = await Invoice.findOne({
    appointmentId: appt._id,
    status: { $nin: ['cancelled', 'refunded'] },
  }).lean()
  if (!invoice) return []
  return (invoice.items || []).map(it => ({
    code: it.serviceCode,
    name: it.serviceName,
    qty: Number(it.quantity) || 1,
  })).filter(s => s.code)
}

// Aggregate consumables norm (định mức) for a study, scoped to its site.
async function computeStandardConsumables(study) {
  const services = await getStudyServices(study._id)
  if (!services.length) return []
  const codes = [...new Set(services.map(s => s.code))]
  const mappings = await SupplyServiceMapping.find({ serviceCode: { $in: codes } }).lean()
  if (!mappings.length) return []
  const supplyIds = [...new Set(mappings.map(m => m.supplyId))]
  const supplies = await Supply.find({ _id: { $in: supplyIds } }).lean()
  // Keep supplies at the study's site (or with no site scoping)
  const siteSupplies = new Set(
    supplies
      .filter(s => !study.site || !s.site || s.site === study.site)
      .map(s => s._id)
  )
  const byId = {}
  for (const svc of services) {
    const rows = mappings.filter(m => m.serviceCode === svc.code && siteSupplies.has(m.supplyId))
    for (const m of rows) {
      const qty = (Number(m.quantity) || 0) * (svc.qty || 1)
      if (!byId[m.supplyId]) {
        byId[m.supplyId] = {
          supplyId: m.supplyId,
          supplyCode: m.supplyCode,
          supplyName: m.supplyName,
          unit: m.unit,
          standardQty: 0,
        }
      }
      byId[m.supplyId].standardQty += qty
    }
  }
  return Object.values(byId)
}

// Create an auto_deduct InventoryTransaction + decrement stock (FIFO lots) from
// the branch warehouse at study.site. Soft-fails on insufficient stock: the
// transaction still records the actual qty used, but flags shortfall in
// reasonCode='variance' + per-item notes so nv_kho can see it on the landing.
// Returns the transaction _id, or null if nothing to deduct or no warehouse.
async function autoDeductConsumables(study, user) {
  if (study.consumablesDeductedAt) return null
  const items = (study.consumables || []).filter(c => Number(c.actualQty) > 0)
  if (!items.length) return null

  const Warehouse = require('../models/Warehouse')
  const wh = study.site ? await Warehouse.findOne({ site: study.site, status: 'active' }).lean() : null
  if (!wh) {
    // No warehouse configured for this site — skip the deduct but don't block.
    return null
  }

  const nowIso = new Date().toISOString()
  const txId = `TX-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`

  const mapped = []
  let anyVariance = false
  for (const it of items) {
    const qty = Number(it.actualQty) || 0
    let remaining = qty
    const lots = await InventoryLot.find({
      warehouseId: wh._id,
      supplyId: it.supplyId,
      status: 'available',
      currentQuantity: { $gt: 0 },
    }).sort({ expiryDate: 1, createdAt: 1 })
    let firstLotId = ''
    for (const lot of lots) {
      if (remaining <= 0) break
      const take = Math.min(lot.currentQuantity, remaining)
      lot.currentQuantity -= take
      if (lot.currentQuantity <= 0) lot.status = 'depleted'
      await lot.save()
      remaining -= take
      if (!firstLotId) firstLotId = lot._id
    }
    const shortfall = Math.max(0, remaining)
    if (shortfall > 0) anyVariance = true
    mapped.push({
      supplyId: it.supplyId,
      supplyCode: it.supplyCode,
      supplyName: it.supplyName,
      unit: it.unit,
      lotId: firstLotId,
      quantity: qty,
      notes: shortfall > 0 ? `Thiếu ${shortfall} ${it.unit || ''} so với yêu cầu (soft-fail)` : (it.notes || ''),
    })

    const supply = await Supply.findById(it.supplyId)
    if (supply) {
      supply.currentStock = Math.max(0, (supply.currentStock || 0) - (qty - shortfall))
      supply.updatedAt = nowIso
      await supply.save()
    }
  }

  const tx = new InventoryTransaction({
    _id: txId,
    transactionNumber: `AD-${Date.now().toString().slice(-8)}`,
    type: 'auto_deduct',
    warehouseId: wh._id,
    warehouseName: wh.name,
    warehouseCode: wh.code,
    site: wh.site || study.site || '',
    accountingPeriod: nowIso.slice(0, 7),
    items: mapped,
    reasonCode: anyVariance ? 'variance' : '',
    reason: anyVariance
      ? `Tự động trừ kho (có sai khác): ca chụp ${study._id}`
      : `Tự động trừ kho: ca chụp ${study._id}`,
    relatedServiceOrderId: study._id,
    relatedStudyId: study._id,
    status: 'confirmed',
    confirmedBy: user.username,
    confirmedAt: nowIso,
    createdBy: user.username,
    createdAt: nowIso,
    updatedAt: nowIso,
  })
  await tx.save()
  return txId
}

// Helper: build a base Mongoose query filter based on user role
function buildSiteFilter(user) {
  if (user.role === 'bacsi') {
    // Pool (unclaimed pending_read) + own picked cases at any status
    return {
      $or: [
        { status: 'pending_read', radiologist: { $in: [null, ''] } },
        { radiologist: user.username },
      ],
    }
  }
  if (user.role === 'nhanvien' || user.role === 'truongphong') {
    return { site: user.department }
  }
  // giamdoc, admin: all sites
  return {}
}

// GET /studies
router.get('/studies', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'guest') {
      return res.status(403).json({ error: 'Không có quyền truy cập' })
    }

    const filter = buildSiteFilter(req.user)

    // Optional query param filters
    if (req.query.site && (req.user.role === 'admin' || req.user.role === 'giamdoc')) {
      filter.site = req.query.site
    }
    if (req.query.modality) {
      filter.modality = req.query.modality
    }
    if (req.query.status) {
      filter.status = req.query.status
    }
    if (req.query.date) {
      // Filter by studyDate prefix, e.g. "2026-03"
      filter.studyDate = { $regex: `^${req.query.date}` }
    }

    const studies = await Study.find(filter).sort({ scheduledDate: -1 })
    res.json(studies)
  } catch (err) {
    console.error('GET /studies error:', err)
    res.status(500).json({ error: 'Lỗi server' })
  }
})

// GET /stats
router.get('/stats', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'guest') {
      return res.status(403).json({ error: 'Không có quyền truy cập' })
    }

    const baseFilter = buildSiteFilter(req.user)
    const studies = await Study.find(baseFilter)

    const today = new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"

    const byModality = { CT: 0, MRI: 0, XR: 0, US: 0 }
    const byStatus = { scheduled: 0, in_progress: 0, pending_read: 0, reported: 0, verified: 0 }
    const bySite = {}
    let todayTotal = 0
    let urgentPending = 0

    for (const s of studies) {
      // byModality
      if (s.modality && byModality[s.modality] !== undefined) {
        byModality[s.modality]++
      }
      // byStatus
      if (s.status && byStatus[s.status] !== undefined) {
        byStatus[s.status]++
      }
      // bySite
      if (s.site) {
        bySite[s.site] = (bySite[s.site] || 0) + 1
      }
      // todayTotal: studies whose studyDate matches today
      if (s.studyDate && s.studyDate.startsWith(today)) {
        todayTotal++
      }
      // urgentPending: urgent/stat studies that are pending_read
      if (
        s.status === 'pending_read' &&
        (s.priority === 'urgent' || s.priority === 'stat')
      ) {
        urgentPending++
      }
    }

    res.json({
      total: studies.length,
      byModality,
      byStatus,
      bySite,
      pendingRead: byStatus.pending_read,
      todayTotal,
      urgentPending,
    })
  } catch (err) {
    console.error('GET /stats error:', err)
    res.status(500).json({ error: 'Lỗi server' })
  }
})

// POST /studies
router.post('/studies', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'truongphong' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Không có quyền tạo ca chụp' })
    }

    const {
      patientName,
      patientId,
      dob,
      gender,
      modality,
      bodyPart,
      clinicalInfo,
      site,
      scheduledDate,
      priority,
    } = req.body

    const now = new Date().toISOString()

    const uid = genStudyUID()
    const study = new Study({
      _id: uid,
      studyUID: uid,
      patientName,
      patientId,
      dob,
      gender,
      modality,
      bodyPart,
      clinicalInfo,
      site,
      scheduledDate,
      priority: priority || 'routine',
      status: 'scheduled',
      reportText: '',
      createdAt: now,
      updatedAt: now,
    })

    await study.save()
    res.status(201).json(study)
  } catch (err) {
    console.error('POST /studies error:', err)
    res.status(500).json({ error: 'Lỗi server' })
  }
})

// PUT /studies/:id
router.put('/studies/:id', requireAuth, async (req, res) => {
  try {
    const study = await Study.findById(req.params.id)
    if (!study) {
      return res.status(404).json({ error: 'Không tìm thấy ca chụp' })
    }

    const role = req.user.role
    const body = req.body
    const now = new Date().toISOString()
    const updates = { updatedAt: now }

    if (role === 'nhanvien') {
      // Can set status to in_progress or pending_read, studyDate, technician/technicianName
      if (body.status !== undefined) {
        if (body.status !== 'in_progress' && body.status !== 'pending_read') {
          return res.status(403).json({ error: 'Nhanvien chỉ được cập nhật trạng thái in_progress hoặc pending_read' })
        }
        updates.status = body.status
      }
      if (body.studyDate !== undefined) updates.studyDate = body.studyDate
      if (body.technician !== undefined) updates.technician = body.technician
      if (body.technicianName !== undefined) updates.technicianName = body.technicianName

    } else if (role === 'truongphong') {
      // Can add reportText, set status to 'reported', set radiologist/radiologistName, reportedAt
      if (body.status !== undefined) {
        if (body.status !== 'reported') {
          return res.status(403).json({ error: 'Truongphong chỉ được cập nhật trạng thái reported' })
        }
        updates.status = body.status
      }
      if (body.reportText !== undefined) updates.reportText = body.reportText
      if (body.radiologist !== undefined) updates.radiologist = body.radiologist
      if (body.radiologistName !== undefined) updates.radiologistName = body.radiologistName
      if (body.reportedAt !== undefined) updates.reportedAt = body.reportedAt

    } else if (role === 'admin' || role === 'giamdoc') {
      // Can set any field
      const allowedFields = [
        'status', 'verifiedAt', 'patientName', 'patientId', 'dob', 'gender',
        'modality', 'bodyPart', 'clinicalInfo', 'site', 'scheduledDate', 'studyDate',
        'priority', 'technician', 'technicianName', 'radiologist', 'radiologistName',
        'reportText', 'reportedAt', 'imageStatus', 'imageCount', 'studyUID',
      ]
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updates[field] = body[field]
        }
      }
    } else if (role === 'bacsi') {
      // Bacsi can only update studies they've picked
      if (study.radiologist !== req.user.username) {
        return res.status(403).json({ error: 'Ca chụp không phải của bạn' })
      }
      if (body.status !== undefined) {
        if (!['reading', 'reported'].includes(body.status)) {
          return res.status(403).json({ error: 'Bác sĩ chỉ được cập nhật trạng thái reading hoặc reported' })
        }
        updates.status = body.status
      }
    } else {
      return res.status(403).json({ error: 'Không có quyền cập nhật ca chụp' })
    }

    const updated = await Study.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    )

    // When the scan is marked pending_read, deduct consumables from stock (once).
    // Failure to deduct must not block the status transition — log and continue.
    if (updated.status === 'pending_read' && !updated.consumablesDeductedAt) {
      try {
        const txId = await autoDeductConsumables(updated, req.user)
        if (txId) {
          updated.consumablesDeductedAt = new Date().toISOString()
          updated.consumablesTransactionId = txId
          updated.updatedAt = updated.consumablesDeductedAt
          await updated.save()
        }
      } catch (e) {
        console.error('auto-deduct consumables failed:', e)
      }
    }

    res.json(updated)
  } catch (err) {
    console.error('PUT /studies/:id error:', err)
    res.status(500).json({ error: 'Lỗi server' })
  }
})

// GET /studies/:id/consumables-standard — return định mức aggregated from SupplyServiceMapping
router.get('/studies/:id/consumables-standard', requireAuth, async (req, res) => {
  try {
    const study = await Study.findById(req.params.id).lean()
    if (!study) return res.status(404).json({ error: 'Không tìm thấy ca chụp' })
    const standard = await computeStandardConsumables(study)
    res.json(standard)
  } catch (err) {
    console.error('GET /studies/:id/consumables-standard error:', err)
    res.status(500).json({ error: 'Lỗi server' })
  }
})

// PUT /studies/:id/consumables — KTV/admin save actual consumables (blocked after deduction)
router.put('/studies/:id/consumables', requireAuth, requirePermission('consumables.record'), async (req, res) => {
  try {
    const role = req.user.role
    if (!['nhanvien', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Chỉ KTV hoặc admin được cập nhật vật tư' })
    }
    const study = await Study.findById(req.params.id)
    if (!study) return res.status(404).json({ error: 'Không tìm thấy ca chụp' })
    if (study.consumablesDeductedAt) {
      return res.status(400).json({ error: 'Đã xuất kho — không thể chỉnh sửa' })
    }
    const incoming = Array.isArray(req.body.consumables) ? req.body.consumables : []
    const cleaned = incoming
      .map(it => ({
        supplyId: String(it.supplyId || ''),
        supplyCode: String(it.supplyCode || ''),
        supplyName: String(it.supplyName || ''),
        unit: String(it.unit || ''),
        standardQty: Number(it.standardQty) || 0,
        actualQty: Number(it.actualQty) || 0,
        notes: String(it.notes || ''),
      }))
      .filter(it => it.supplyId)
    study.consumables = cleaned
    study.updatedAt = new Date().toISOString()
    await study.save()
    res.json(study)
  } catch (err) {
    console.error('PUT /studies/:id/consumables error:', err)
    res.status(500).json({ error: 'Lỗi server' })
  }
})

// GET /radiologists — list all bacsi users for assignment dropdown
router.get('/radiologists', requireAuth, async (req, res) => {
  try {
    const users = await User.find({ role: 'bacsi' }).select('_id displayName department')
    res.json(users.map(u => ({ username: u._id, displayName: u.displayName || u._id, department: u.department })))
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server' })
  }
})

// POST /studies/:id/pick — bác sĩ tự nhận ca từ pool
// Atomic claim: only succeeds if study is pending_read AND unclaimed.
router.post('/studies/:id/pick', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'bacsi' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ bác sĩ mới được nhận ca' })
    }
    const now = new Date().toISOString()
    const updated = await Study.findOneAndUpdate(
      {
        _id: req.params.id,
        status: 'pending_read',
        radiologist: { $in: [null, ''] },
      },
      {
        $set: {
          radiologist: req.user.username,
          radiologistName: req.user.displayName || req.user.username,
          assignedAt: now,
          status: 'reading',
          updatedAt: now,
        },
      },
      { new: true }
    )
    if (updated) return res.json(updated)
    // Diagnose why the atomic claim failed
    const study = await Study.findById(req.params.id).lean()
    if (!study) return res.status(404).json({ error: 'Không tìm thấy ca chụp' })
    if (study.status !== 'pending_read') {
      return res.status(409).json({ error: 'Ca chụp không ở trạng thái chờ đọc', study })
    }
    return res.status(409).json({ error: 'Ca chụp đã được bác sĩ khác nhận', study })
  } catch (err) {
    console.error('POST /studies/:id/pick error:', err)
    res.status(500).json({ error: 'Lỗi server' })
  }
})

// DELETE /studies/:id/pick — release a claim back to the pool.
// Only the current claimer or admin can release. Only works if no final
// report has been saved yet (report.status !== 'final').
router.delete('/studies/:id/pick', requireAuth, async (req, res) => {
  try {
    const study = await Study.findById(req.params.id)
    if (!study) return res.status(404).json({ error: 'Không tìm thấy ca chụp' })
    const mine = study.radiologist && study.radiologist === req.user.username
    const isAdmin = req.user.role === 'admin'
    if (!mine && !isAdmin) {
      return res.status(403).json({ error: 'Chỉ người đang đọc ca hoặc admin mới có thể trả lại ca' })
    }
    // Refuse to release if the report has been finalised — the case is already done.
    const report = await Report.findOne({ studyId: study._id }).lean()
    if (report?.status === 'final') {
      return res.status(400).json({ error: 'Ca đã có kết quả cuối cùng — không thể trả lại' })
    }
    const now = new Date().toISOString()
    study.radiologist = ''
    study.radiologistName = ''
    study.assignedAt = ''
    // Only flip status back if it was 'reading' — preserve pending_read if somehow already there
    if (study.status === 'reading') study.status = 'pending_read'
    study.updatedAt = now
    await study.save()
    res.json(study)
  } catch (err) {
    console.error('DELETE /studies/:id/pick error:', err)
    res.status(500).json({ error: 'Lỗi server' })
  }
})

// POST /studies/:id/assign — admin override (reassign ca cho bác sĩ khác)
router.post('/studies/:id/assign', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ admin mới được phân công lại' })
    }
    const { radiologistId, radiologistName } = req.body
    if (!radiologistId) return res.status(400).json({ error: 'radiologistId required' })
    const now = new Date().toISOString()
    const updated = await Study.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          radiologist: radiologistId,
          radiologistName: radiologistName || radiologistId,
          assignedAt: now,
          updatedAt: now,
        },
      },
      { new: true }
    )
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy ca chụp' })
    res.json(updated)
  } catch (err) {
    console.error('POST /studies/:id/assign error:', err)
    res.status(500).json({ error: 'Lỗi server' })
  }
})

// GET /reports/:studyId — get report for a study
router.get('/reports/:studyId', requireAuth, async (req, res) => {
  try {
    const report = await Report.findOne({ studyId: req.params.studyId })
    if (!report) return res.status(404).json({ error: 'Chưa có kết quả' })
    res.json(report)
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server' })
  }
})

// POST /reports — create or update report for a study
router.post('/reports', requireAuth, async (req, res) => {
  try {
    const role = req.user.role
    if (role !== 'bacsi' && role !== 'admin' && role !== 'truongphong') {
      return res.status(403).json({ error: 'Không có quyền viết kết quả' })
    }
    const { studyId, studyUID, technique, clinicalInfo, findings, impression, recommendation, status, criticalFinding, criticalNote, templateUsedId } = req.body

    // Soft-lock enforcement: only the claiming radiologist can write. Admin /
    // truongphong can override for supervisor corrections. Prevents two bacsi
    // from clobbering each other's drafts.
    const studyForLock = await Study.findById(studyId).lean()
    if (!studyForLock) return res.status(404).json({ error: 'Không tìm thấy ca chụp' })
    const isOwner = studyForLock.radiologist && studyForLock.radiologist === req.user.username
    const canOverride = role === 'admin' || role === 'truongphong'
    if (!isOwner && !canOverride) {
      if (studyForLock.radiologist) {
        return res.status(409).json({ error: `Ca đang được đọc bởi BS ${studyForLock.radiologistName || studyForLock.radiologist}. Bạn không thể lưu kết quả.` })
      }
      return res.status(409).json({ error: 'Bạn chưa nhận ca này. Bấm "Nhận ca" trước khi lưu kết quả.' })
    }

    const now = new Date().toISOString()

    let report = await Report.findOne({ studyId })
    const wasCritical = report && report.criticalFinding
    if (report) {
      report.technique = technique ?? report.technique
      report.clinicalInfo = clinicalInfo ?? report.clinicalInfo
      report.findings = findings ?? report.findings
      report.impression = impression ?? report.impression
      report.recommendation = recommendation ?? report.recommendation
      if (criticalFinding !== undefined) report.criticalFinding = !!criticalFinding
      if (criticalNote !== undefined) report.criticalNote = criticalNote
      if (templateUsedId !== undefined) report.templateUsedId = templateUsedId
      report.updatedAt = now
      if (status) report.status = status
      if (status === 'final') report.finalizedAt = now
      await report.save()
    } else {
      report = await Report.create({
        studyId, studyUID,
        radiologistId: req.user.username,
        radiologistName: req.user.displayName || req.user.username,
        technique: technique || '', clinicalInfo: clinicalInfo || '',
        findings: findings || '', impression: impression || '',
        recommendation: recommendation || '',
        criticalFinding: !!criticalFinding,
        criticalNote: criticalNote || '',
        templateUsedId: templateUsedId || '',
        status: status || 'draft',
        createdAt: now, updatedAt: now,
        finalizedAt: status === 'final' ? now : null,
      })
    }

    // Critical-finding notification: fire when newly flagged or first set on creation
    if (report.criticalFinding && !wasCritical) {
      try {
        const Notification = require('../models/Notification')
        const studyForNotif = await Study.findById(studyId).lean()
        await Notification.create({
          ts: now,
          type: 'critical_finding',
          severity: 'critical',
          title: `⚠ Phát hiện nghiêm trọng — ${studyForNotif?.patientName || studyId}`,
          message: criticalNote || `${studyForNotif?.modality || ''} ${studyForNotif?.bodyPart || ''} — BS: ${req.user.displayName || req.user.username}`,
          toRoles: ['admin', 'giamdoc', 'truongphong'],
          toSites: studyForNotif?.site ? [studyForNotif.site] : [],
          resource: 'report',
          resourceId: String(report._id),
          createdBy: req.user.username,
          createdAt: now,
        })
      } catch (e) { console.warn('[critical notify]', e.message) }
    }

    // Sync study status with report status
    const studyStatus = status === 'final' ? 'reported' : 'reading'
    await Study.findByIdAndUpdate(studyId, {
      $set: {
        status: studyStatus,
        reportId: String(report._id),
        updatedAt: now,
        ...(status === 'final' ? { reportedAt: now } : {}),
      },
    })

    res.json(report)
  } catch (err) {
    console.error('POST /reports error:', err)
    res.status(500).json({ error: 'Lỗi server' })
  }
})

// GET /orthanc/studies — proxy list of studies from Orthanc
router.get('/orthanc/studies', requireAuth, async (req, res) => {
  try {
    const response = await fetch(`${ORTHANC_BASE}/studies?expand`)
    if (!response.ok) return res.status(response.status).json({ error: 'Orthanc error' })
    const data = await response.json()
    res.json(data)
  } catch (err) {
    res.status(503).json({ error: 'Orthanc không kết nối được', detail: err.message })
  }
})

// GET /orthanc/viewer-url/:studyUID — resolve StudyInstanceUID → OHIF viewer URL
// Uses /tools/find because GET /studies?StudyInstanceUID= is ignored by Orthanc
// and returns every study; the find API is the only reliable per-UID filter.
router.get('/orthanc/viewer-url/:studyUID', requireAuth, async (req, res) => {
  try {
    const uid = req.params.studyUID
    const response = await fetch(`${ORTHANC_BASE}/tools/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Level: 'Study', Query: { StudyInstanceUID: uid } }),
    })
    if (!response.ok) return res.status(502).json({ error: 'Orthanc error' })
    const ids = await response.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.json({ url: `${OHIF_PUBLIC}/`, found: false })
    }
    const viewerUrl = `${OHIF_PUBLIC}/viewer?StudyInstanceUIDs=${encodeURIComponent(uid)}`
    res.json({ url: viewerUrl, orthancId: ids[0], found: true })
  } catch (err) {
    res.json({ url: `${OHIF_PUBLIC}/`, found: false, error: err.message })
  }
})

// GET /orthanc/status — check if Orthanc is reachable
router.get('/orthanc/status', requireAuth, async (req, res) => {
  try {
    const response = await fetch(`${ORTHANC_BASE}/system`)
    if (!response.ok) return res.status(response.status).json({ online: false })
    const data = await response.json()
    res.json({ online: true, version: data.Version, dicomAet: data.DicomAet })
  } catch (err) {
    res.json({ online: false, error: err.message })
  }
})

// ═══════════════════════════════════════════════════════
// MEASUREMENT PERSISTENCE (annotations)
// ═══════════════════════════════════════════════════════

// GET /annotations/:studyId — load saved measurements
router.get('/annotations/:studyId', requireAuth, async (req, res) => {
  try {
    const ann = await StudyAnnotation.findOne({ studyId: req.params.studyId }).lean()
    if (!ann) return res.json({ measurements: null })
    res.json(ann)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /annotations — save measurements for a study
router.post('/annotations', requireAuth, async (req, res) => {
  try {
    const { studyId, studyUID, measurements, measurementCount } = req.body
    if (!studyId) return res.status(400).json({ error: 'studyId required' })

    const now = new Date().toISOString()
    const ann = await StudyAnnotation.findOneAndUpdate(
      { studyId },
      {
        $setOnInsert: { _id: crypto.randomUUID(), studyId, studyUID: studyUID || '', createdAt: now },
        $set: {
          measurements: typeof measurements === 'string' ? measurements : JSON.stringify(measurements),
          measurementCount: measurementCount || 0,
          savedBy: req.user.username,
          savedByName: req.user.displayName,
          updatedAt: now,
        },
      },
      { upsert: true, new: true }
    )
    res.json({ ok: true, annotation: ann })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════
// KEY IMAGE FLAGGING
// ═══════════════════════════════════════════════════════

// GET /key-images/:studyId — list key images for a study
router.get('/key-images/:studyId', requireAuth, async (req, res) => {
  try {
    const images = await KeyImage.find({ studyId: req.params.studyId }).sort({ createdAt: 1 }).lean()
    res.json(images)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /key-images — flag a key image
router.post('/key-images', requireAuth, async (req, res) => {
  try {
    const { studyId, studyUID, seriesUID, instanceUID, frameNumber, description } = req.body
    if (!studyId) return res.status(400).json({ error: 'studyId required' })

    const ki = new KeyImage({
      _id: crypto.randomUUID(),
      studyId, studyUID: studyUID || '',
      seriesUID: seriesUID || '', instanceUID: instanceUID || '',
      frameNumber: frameNumber || 0,
      description: description || '',
      flaggedBy: req.user.username,
      flaggedByName: req.user.displayName,
      createdAt: new Date().toISOString(),
    })
    await ki.save()
    res.status(201).json({ ok: true, keyImage: ki.toObject() })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /key-images/:id — unflag a key image
router.delete('/key-images/:id', requireAuth, async (req, res) => {
  try {
    await KeyImage.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════
// PRIOR STUDY COMPARISON
// ═══════════════════════════════════════════════════════

// GET /priors/:patientId — find prior studies for comparison
router.get('/priors/:patientId', requireAuth, async (req, res) => {
  try {
    const { modality, excludeStudyId } = req.query
    const filter = { patientId: req.params.patientId }
    if (modality) filter.modality = modality
    if (excludeStudyId) filter._id = { $ne: excludeStudyId }
    // Only studies that have been reported/verified and have images
    filter.status = { $in: ['reported', 'verified'] }

    const priors = await Study.find(filter)
      .sort({ studyDate: -1, createdAt: -1 })
      .limit(10)
      .lean()

    res.json(priors)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /compare-url — generate OHIF URL for multi-study comparison
router.get('/compare-url', requireAuth, async (req, res) => {
  try {
    const { studyUIDs } = req.query // comma-separated UIDs
    if (!studyUIDs) return res.status(400).json({ error: 'studyUIDs required' })

    const uids = studyUIDs.split(',').map(u => u.trim()).filter(Boolean)
    // OHIF supports multiple StudyInstanceUIDs as comma-separated
    const viewerUrl = `${OHIF_PUBLIC}/viewer?StudyInstanceUIDs=${uids.map(u => encodeURIComponent(u)).join(',')}`
    res.json({ url: viewerUrl, count: uids.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════
// DICOM UPLOAD PROXY
// ═══════════════════════════════════════════════════════

// POST /orthanc/upload — proxy DICOM file upload to Orthanc
router.post('/orthanc/upload', requireAuth, async (req, res) => {
  try {
    // Forward the raw body to Orthanc's /instances endpoint
    const chunks = []
    for await (const chunk of req) { chunks.push(chunk) }
    const body = Buffer.concat(chunks)

    const response = await fetch(`${ORTHANC_BASE}/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/dicom' },
      body,
    })

    if (!response.ok) {
      const text = await response.text()
      return res.status(response.status).json({ error: 'Orthanc upload failed', detail: text })
    }

    const data = await response.json()
    res.json({ ok: true, ...data })
  } catch (err) {
    res.status(503).json({ error: 'Không thể upload lên Orthanc', detail: err.message })
  }
})

// POST /orthanc/upload-zip — proxy ZIP file upload to Orthanc
router.post('/orthanc/upload-zip', requireAuth, async (req, res) => {
  try {
    const chunks = []
    for await (const chunk of req) { chunks.push(chunk) }
    const body = Buffer.concat(chunks)

    // Orthanc accepts ZIP uploads at /instances too
    const response = await fetch(`${ORTHANC_BASE}/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body,
    })

    if (!response.ok) {
      const text = await response.text()
      return res.status(response.status).json({ error: 'Orthanc upload failed', detail: text })
    }

    const data = await response.json()
    res.json({ ok: true, ...data })
  } catch (err) {
    res.status(503).json({ error: 'Không thể upload lên Orthanc', detail: err.message })
  }
})

module.exports = router
