const express = require('express')
const router = express.Router()
const Encounter = require('../models/Encounter')
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
    res.status(201).json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /encounters/today — encounters scheduled or in progress today
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

// POST /encounters/:id/assign-package — assign a package, populate services + bill line
router.post('/:id/assign-package', requireAuth, async (req, res) => {
  try {
    const { packageCode, tierCode } = req.body
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    const pkg = await Package.findOne({ code: packageCode }).lean()
    if (!pkg) return res.status(400).json({ error: `Không có gói ${packageCode}` })

    const tier = (pkg.pricingTiers || []).find(t => t.code === tierCode) || null
    const services = await Service.find({ code: { $in: [...(pkg.bundledServices || []), ...(tier?.extraServices || [])] } }).lean()
    const serviceMap = Object.fromEntries(services.map(s => [s.code, s]))

    const allServiceCodes = [...new Set([...(pkg.bundledServices || []), ...(tier?.extraServices || [])])]
    const newAssigned = allServiceCodes.map(code => ({
      serviceCode: code,
      serviceName: serviceMap[code]?.name || code,
      status: 'pending',
      output: {},
    }))

    enc.packageCode = pkg.code
    enc.packageName = pkg.name
    enc.packageTier = tierCode || ''
    enc.assignedServices = newAssigned

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

    enc.billItems = (enc.billItems || []).filter(b => b.kind !== 'package')
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
    enc.paidAmount = enc.billTotal
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
