const express = require('express')
const router = express.Router()
const Encounter = require('../models/Encounter')
const Patient = require('../models/Patient')
const Package = require('../models/Package')
const Service = require('../models/Service')
const Entitlement = require('../models/Entitlement')
const Warehouse = require('../models/Warehouse')
const Supply = require('../models/Supply')
const InventoryTransaction = require('../models/InventoryTransaction')
const { requireAuth } = require('../middleware/auth')
const { fifoDeduct, stockCheck } = require('../lib/fifoDeduct')
const SERVICE_OUTPUT_FIELDS = require('../config/serviceOutputFields')

const now = () => new Date().toISOString()
const todayISO = () => new Date().toISOString().slice(0, 10)
const sumBill = (items) => (items || []).reduce((s, i) => s + (i.totalPrice || 0), 0)

// POST /encounters — create new clinical encounter (Lễ tân workflow).
// Minimal: just patientId + site. Package / services / bill items added via
// subsequent endpoints (assign-package, services, bill-items).
router.post('/', requireAuth, async (req, res) => {
  try {
    const { patientId, patientName, site, dob, gender } = req.body
    if (!patientId || !patientName) return res.status(400).json({ error: 'patientId + patientName required' })
    const id = `enc-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    const enc = await new Encounter({
      _id: id,
      patientId,
      patientName,
      site: site || '',
      dob: dob || '',
      gender: ['M', 'F'].includes(gender) ? gender : 'M',
      scheduledDate: new Date().toISOString().slice(0, 10),
      studyDate: new Date().toISOString().slice(0, 10),
      status: 'scheduled',
      assignedServices: [],
      billItems: [],
      billTotal: 0,
      createdAt: now(),
      updatedAt: now(),
    }).save()
    // Denormalize lastEncounterAt on the patient (best-effort)
    await Patient.updateOne({ patientId }, { $set: { lastEncounterAt: enc.createdAt, updatedAt: now() } }).catch(() => {})
    res.status(201).json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /encounters/today — encounters created today (kept for back-compat).
router.get('/today', requireAuth, async (req, res) => {
  try {
    const day = todayISO()
    const list = await Encounter.find({
      $or: [
        { scheduledDate: { $regex: `^${day}` } },
        { studyDate: { $regex: `^${day}` } },
        { createdAt: { $regex: `^${day}` } },
      ],
    }).sort({ createdAt: -1 }).lean()
    res.json(list)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /encounters?from=YYYY-MM-DD&to=YYYY-MM-DD&site=...&patientId=...&excludeId=...&status=...
// Date range filter on createdAt (inclusive). site = exact match (or omit).
// patientId = patient's history (overrides date range when set; date filters
//   ignored so full lifetime history shows up). excludeId = drop one id from
//   the list (used by drawer's "Lịch sử khám" panel to hide the current one).
// status = comma-separated list of encounter statuses (Khám list groups them
//   into "Đang khám" / "Hoàn thành" / "Đã hủy" / "Tất cả"). Omit for all.
// Default range: today only.
router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.patientId) {
      filter.patientId = req.query.patientId
    } else {
      const today = todayISO()
      const from = req.query.from || today
      const to = req.query.to || today
      filter.createdAt = { $gte: `${from}T00:00:00.000Z`, $lte: `${to}T23:59:59.999Z` }
    }
    if (req.query.site) filter.site = req.query.site
    if (req.query.excludeId) filter._id = { $ne: req.query.excludeId }
    if (req.query.status) {
      const statuses = req.query.status.split(',').map(s => s.trim()).filter(Boolean)
      if (statuses.length === 1) filter.status = statuses[0]
      else if (statuses.length > 1) filter.status = { $in: statuses }
    }
    const list = await Encounter.find(filter).sort({ createdAt: -1 }).limit(100).lean()
    res.json(list)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /encounters/:id — single encounter
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const enc = await Encounter.findById(req.params.id).lean()
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    res.json(enc)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /encounters/:id/service-fields/:serviceCode — output field schema for a service
router.get('/:id/service-fields/:serviceCode', requireAuth, async (req, res) => {
  const fields = SERVICE_OUTPUT_FIELDS[req.params.serviceCode] || []
  res.json({ serviceCode: req.params.serviceCode, fields })
})

// POST /encounters/:id/assign-package — APPEND a package to the encounter.
// Multi-package: each call adds to packages[], bundles services (dedupes
// against any already present, tracks lineage via addedByPackage), and adds
// one bill line for the package. Use DELETE /packages/:code to remove.
router.post('/:id/assign-package', requireAuth, async (req, res) => {
  try {
    const { packageCode, tierCode } = req.body
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    const pkg = await Package.findOne({ code: packageCode }).lean()
    if (!pkg) return res.status(400).json({ error: `Không có gói ${packageCode}` })

    if ((enc.packages || []).some(p => p.code === packageCode)) {
      return res.status(400).json({ error: `Gói ${packageCode} đã được gán cho lượt khám này` })
    }

    const tier = (pkg.pricingTiers || []).find(t => t.code === tierCode) || null
    const allServiceCodes = [...new Set([...(pkg.bundledServices || []), ...(tier?.extraServices || [])])]
    const services = await Service.find({ code: { $in: allServiceCodes } }).lean()
    const serviceMap = Object.fromEntries(services.map(s => [s.code, s]))

    // Append package metadata
    enc.packages.push({
      code: pkg.code,
      name: pkg.name,
      tier: tierCode || '',
      addedAt: now(),
      addedBy: req.user.username,
    })

    // Append bundled services that aren't already on the encounter
    const existingCodes = new Set((enc.assignedServices || []).map(s => s.serviceCode))
    for (const code of allServiceCodes) {
      if (existingCodes.has(code)) continue
      enc.assignedServices.push({
        serviceCode: code,
        serviceName: serviceMap[code]?.name || code,
        status: 'pending',
        output: {},
        addedByPackage: pkg.code,
      })
    }

    // Resolve package price (tier > pricingRules > basePrice)
    let pkgPrice = pkg.basePrice || 0
    if (tier) pkgPrice = tier.totalPrice || pkgPrice
    if (pkg.pricingRules?.length) {
      const ent = await Entitlement.findOne({
        patientId: enc.patientId,
        sourcePackageCode: { $in: (pkg.pricingRules.find(r => r.condition === 'has-active-entitlement')?.sourcePackages || []) },
        status: 'active',
        expiresAt: { $gt: now() },
      }).lean()
      if (ent) {
        const rule = pkg.pricingRules.find(r => r.condition === 'has-active-entitlement')
        if (rule) pkgPrice = rule.price
      } else {
        const expired = await Entitlement.findOne({
          patientId: enc.patientId,
          sourcePackageCode: { $in: (pkg.pricingRules.find(r => r.condition === 'has-expired-entitlement')?.sourcePackages || []) },
        }).lean()
        if (expired) {
          const rule = pkg.pricingRules.find(r => r.condition === 'has-expired-entitlement')
          if (rule) pkgPrice = rule.price
        } else {
          const rule = pkg.pricingRules.find(r => r.condition === 'no-history')
          if (rule) pkgPrice = rule.price
        }
      }
    }

    enc.billItems.push({
      kind: 'package',
      code: pkg.code,
      name: pkg.name + (tier ? ` — ${tier.name}` : ''),
      qty: 1,
      unitPrice: pkgPrice,
      totalPrice: pkgPrice,
      addedBy: req.user.username,
      addedAt: now(),
    })
    enc.billTotal = sumBill(enc.billItems)
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /encounters/:id/packages/:code — remove a package: drop from packages[],
// drop its bill line, drop its bundled assignedServices (but keep services
// the user added manually or that came from a different package).
router.delete('/:id/packages/:code', requireAuth, async (req, res) => {
  try {
    const code = req.params.code
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    if (!(enc.packages || []).some(p => p.code === code)) {
      return res.status(404).json({ error: `Gói ${code} không có trong lượt khám này` })
    }
    enc.packages = (enc.packages || []).filter(p => p.code !== code)
    enc.assignedServices = (enc.assignedServices || []).filter(s => s.addedByPackage !== code)
    enc.billItems = (enc.billItems || []).filter(b => !(b.kind === 'package' && b.code === code))
    enc.billTotal = sumBill(enc.billItems)
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /encounters/:id/services/:serviceCode — remove a service from the
// encounter and the matching service line on the bill. Doesn't touch
// package bill lines (use DELETE /packages/:code to remove a whole package).
router.delete('/:id/services/:serviceCode', requireAuth, async (req, res) => {
  try {
    const code = req.params.serviceCode
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    enc.assignedServices = (enc.assignedServices || []).filter(s => s.serviceCode !== code)
    enc.billItems = (enc.billItems || []).filter(b => !(b.kind === 'service' && b.code === code))
    enc.billTotal = sumBill(enc.billItems)
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /encounters/:id/cancel — soft-delete: marks the encounter cancelled,
// records who/when/why. Cancelled encounters keep their bill items + history
// for audit but drop out of the "Đang khám" queue.
router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    if (enc.status === 'paid') return res.status(400).json({ error: 'Không thể hủy lượt khám đã thanh toán' })
    if (enc.status === 'cancelled') return res.status(400).json({ error: 'Lượt khám đã bị hủy trước đó' })
    enc.status = 'cancelled'
    enc.cancelledAt = now()
    enc.cancelledBy = req.user.username
    enc.cancelReason = req.body.reason || ''
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /encounters/:id/discount — set the bill-level discount.
// Body: { discountAmount?: number, discountPercent?: 0..100, discountReason?: string }
// Mutually exclusive — if discountPercent > 0 we zero discountAmount, and vice
// versa. Computing the effective discount (when needed for grand total /
// paidAmount) lives in server lib + mirrored client-side.
router.put('/:id/discount', requireAuth, async (req, res) => {
  try {
    const { discountAmount, discountPercent, discountReason } = req.body
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    const amt = Math.max(0, Number(discountAmount) || 0)
    const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0))
    if (pct > 0) {
      enc.discountPercent = pct
      enc.discountAmount = 0
    } else {
      enc.discountAmount = amt
      enc.discountPercent = 0
    }
    if (discountReason !== undefined) enc.discountReason = discountReason
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Helper to compute the effective discount in VND for an encounter doc.
// Mirrored on the client (Kham.jsx + ThuNgan.jsx).
function effectiveDiscount(enc) {
  const pct = enc.discountPercent || 0
  if (pct > 0) return Math.round((enc.billTotal || 0) * pct / 100)
  return enc.discountAmount || 0
}

// PUT /encounters/:id/services/:serviceCode — update one service (status / output / assignedTo)
router.put('/:id/services/:serviceCode', requireAuth, async (req, res) => {
  try {
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    const svc = (enc.assignedServices || []).find(s => s.serviceCode === req.params.serviceCode)
    if (!svc) return res.status(404).json({ error: `Service ${req.params.serviceCode} chưa được gán cho lượt khám này` })

    const { status, output, assignedTo, assignedToName } = req.body
    if (output !== undefined) svc.output = output
    if (assignedTo !== undefined) { svc.assignedTo = assignedTo; svc.assignedToName = assignedToName || assignedTo }
    if (status) {
      svc.status = status
      if (status === 'in_progress' && !svc.startedAt) svc.startedAt = now()
      if (status === 'done' && !svc.completedAt) svc.completedAt = now()
    }

    enc.markModified('assignedServices')
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /encounters/:id/services — assign an additional service (à la carte add-on)
router.post('/:id/services', requireAuth, async (req, res) => {
  try {
    const { serviceCode } = req.body
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    if ((enc.assignedServices || []).some(s => s.serviceCode === serviceCode)) {
      return res.status(400).json({ error: 'Service đã được gán' })
    }
    const svcDoc = await Service.findOne({ code: serviceCode }).lean()
    if (!svcDoc) return res.status(400).json({ error: `Không có service ${serviceCode}` })

    enc.assignedServices.push({
      serviceCode,
      serviceName: svcDoc.name,
      status: 'pending',
      output: {},
    })

    enc.billItems.push({
      kind: 'service',
      code: serviceCode,
      name: svcDoc.name,
      qty: 1,
      unitPrice: svcDoc.basePrice || 0,
      totalPrice: svcDoc.basePrice || 0,
      addedBy: req.user.username,
      addedAt: now(),
    })

    enc.billTotal = sumBill(enc.billItems)
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /encounters/:id/bill-items — add a kinh / thuoc / service line item to bill
router.post('/:id/bill-items', requireAuth, async (req, res) => {
  try {
    const { kind, code, name, qty = 1, unitPrice = 0, note = '' } = req.body
    if (!kind || !name) return res.status(400).json({ error: 'kind + name là bắt buộc' })

    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })

    enc.billItems.push({
      kind, code, name,
      qty: +qty || 1,
      unitPrice: +unitPrice || 0,
      totalPrice: (+qty || 1) * (+unitPrice || 0),
      addedBy: req.user.username,
      addedAt: now(),
      note,
    })

    enc.billTotal = sumBill(enc.billItems)
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /encounters/:id/checkout-preview — dry-run stock check for thuoc/kinh items
// before Thu Ngân commits the checkout. Returns per-item availability + which
// lots would be consumed (FIFO by expiry).
router.get('/:id/checkout-preview', requireAuth, async (req, res) => {
  try {
    const enc = await Encounter.findById(req.params.id).lean()
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    const wh = await Warehouse.findOne({ site: enc.site, status: 'active' }).lean()
    if (!wh) return res.json({ warehouse: null, items: [], hasStockIssues: false, warning: `Không có kho cho cơ sở "${enc.site}"` })

    const stockItems = (enc.billItems || []).filter(b => b.kind === 'thuoc' || b.kind === 'kinh')
    const items = []
    for (const b of stockItems) {
      if (!b.code) {
        items.push({ ...b.toObject?.() || b, satisfied: true, plan: [], note: 'Mục freeform — không trừ kho' })
        continue
      }
      const supplyExists = await Supply.exists({ _id: b.code })
      if (!supplyExists) {
        items.push({ kind: b.kind, code: b.code, name: b.name, qty: b.qty, satisfied: false, shortfall: b.qty, note: 'Không có trong Inventory' })
        continue
      }
      const r = await stockCheck({ warehouseId: wh._id, supplyId: b.code, quantity: b.qty })
      items.push({
        kind: b.kind, code: b.code, name: b.name, qty: b.qty,
        satisfied: r.satisfied, shortfall: r.shortfall, plan: r.plan, totalAvailable: r.totalAvailable,
      })
    }
    res.json({
      warehouse: { _id: wh._id, name: wh.name },
      items,
      hasStockIssues: items.some(i => i.satisfied === false),
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /encounters/:id/checkout — Thu Ngân confirms bill.
// Auto-deducts inventory (FIFO) for thuoc/kinh bill items, creates one
// auto_deduct transaction, then marks encounter paid. Stock shortfall
// blocks checkout entirely (rollback any partial deductions).
router.post('/:id/checkout', requireAuth, async (req, res) => {
  try {
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    if (enc.status === 'paid') return res.status(400).json({ error: 'Lượt khám đã được thanh toán' })

    const stockItems = (enc.billItems || []).filter(b => (b.kind === 'thuoc' || b.kind === 'kinh') && b.code)
    let txId = null

    if (stockItems.length > 0) {
      const wh = await Warehouse.findOne({ site: enc.site, status: 'active' }).lean()
      if (!wh) return res.status(400).json({ error: `Không có kho cho cơ sở "${enc.site}". Tạo Warehouse trước khi thanh toán.` })

      // Pre-flight stock check (no mutations) so we fail before deducting anything.
      const preChecks = []
      for (const b of stockItems) {
        const exists = await Supply.exists({ _id: b.code })
        if (!exists) return res.status(400).json({ error: `"${b.name}" không có trong Inventory — tạo Supply trước.` })
        const r = await stockCheck({ warehouseId: wh._id, supplyId: b.code, quantity: b.qty })
        if (!r.satisfied) {
          return res.status(400).json({ error: `Không đủ tồn kho cho "${b.name}" tại ${wh.name} — cần ${b.qty}, còn ${r.totalAvailable}. Nhập kho thêm hoặc bỏ mục khỏi bill.` })
        }
        preChecks.push({ b, plan: r.plan })
      }

      // Commit FIFO deduction for each item.
      const txItems = []
      for (const { b } of preChecks) {
        const result = await fifoDeduct({ warehouseId: wh._id, supplyId: b.code, quantity: b.qty })
        const supply = await Supply.findById(b.code).lean()
        for (const c of result.consumed) {
          txItems.push({
            supplyId: b.code,
            supplyName: b.name,
            supplyCode: b.code,
            unit: supply?.unit || 'cái',
            packagingSpec: supply?.packagingSpec || '',
            lotId: c.lotId,
            lotNumber: c.lotNumber,
            expiryDate: c.expiryDate || '',
            quantity: c.quantity,
            unitPrice: b.unitPrice,
            amount: c.quantity * b.unitPrice,
          })
        }
      }

      txId = `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`
      await new InventoryTransaction({
        _id: txId,
        transactionNumber: txId,
        type: 'auto_deduct',
        warehouseId: wh._id,
        warehouseName: wh.name,
        warehouseCode: wh.code,
        site: wh.site,
        items: txItems,
        totalAmount: txItems.reduce((s, i) => s + (i.amount || 0), 0),
        relatedVisitId: enc._id,
        notes: `Thu ngân ${req.user.displayName || req.user.username} — ${enc.patientName}`,
        status: 'confirmed',
        confirmedBy: req.user.username,
        confirmedAt: now(),
        createdBy: req.user.username,
        createdAt: now(),
        updatedAt: now(),
      }).save()
    }

    enc.status = 'paid'
    enc.paidAt = now()
    enc.paidBy = req.user.username
    enc.paidByName = req.user.displayName || req.user.username
    // Grand total = bill subtotal minus bill-level discount (amount or percent)
    enc.paidAmount = Math.max(0, (enc.billTotal || 0) - effectiveDiscount(enc))
    if (txId) enc.consumablesTransactionId = txId
    enc.consumablesDeductedAt = now()
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /encounters/:id/bill-items/:idx — remove an item by array index
router.delete('/:id/bill-items/:idx', requireAuth, async (req, res) => {
  try {
    const idx = parseInt(req.params.idx, 10)
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    if (Number.isNaN(idx) || idx < 0 || idx >= enc.billItems.length) {
      return res.status(400).json({ error: 'idx không hợp lệ' })
    }
    enc.billItems.splice(idx, 1)
    enc.billTotal = sumBill(enc.billItems)
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
