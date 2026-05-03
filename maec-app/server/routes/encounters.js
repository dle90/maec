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
const InventoryLot = require('../models/InventoryLot')
const { requireAuth } = require('../middleware/auth')
const { fifoDeduct, stockCheck } = require('../lib/fifoDeduct')
const SERVICE_OUTPUT_FIELDS = require('../config/serviceOutputFields')
const { localDate, localDayStartUtcZ, localDayEndUtcZ } = require('../lib/dates')

const now = () => new Date().toISOString()
const todayISO = () => localDate()  // HCM-local YYYY-MM-DD; was UTC slice
const sumBill = (items) => (items || []).reduce((s, i) => s + (i.totalPrice || 0), 0)

// POST /encounters — create new clinical encounter (Lễ tân workflow).
// Minimal: just patientId + site. Package / services / bill items added via
// subsequent endpoints (assign-package, services, bill-items).
//
// Idempotency: if this patient already has an open encounter (anything not
// yet paid / completed / cancelled), return that one instead of creating a
// duplicate. Mirrors /registration/check-in's behavior so receptionists who
// double-click "+ Tạo lượt khám" don't end up with two parallel encounters
// per visit.
router.post('/', requireAuth, async (req, res) => {
  try {
    const { patientId, patientName, site, dob, gender } = req.body
    if (!patientId || !patientName) return res.status(400).json({ error: 'patientId + patientName required' })

    const existing = await Encounter.findOne({
      patientId,
      status: { $nin: ['paid', 'completed', 'cancelled'] },
    }).lean()
    if (existing) {
      // Sync site if caller specified a different one (matches /check-in pattern)
      if (site && existing.site !== site) {
        await Encounter.updateOne({ _id: existing._id }, { $set: { site, updatedAt: now() } })
      }
      return res.status(200).json({ ...existing, _existing: true })
    }

    const id = `enc-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    const enc = await new Encounter({
      _id: id,
      patientId,
      patientName,
      site: site || '',
      dob: dob || '',
      gender: ['M', 'F'].includes(gender) ? gender : 'M',
      scheduledDate: todayISO(),
      studyDate: todayISO(),
      status: 'scheduled',
      assignedServices: [],
      billItems: [],
      billTotal: 0,
      createdAt: now(),
      updatedAt: now(),
    }).save()
    // Denormalize lastEncounterAt on the patient (best-effort).
    // Patient _id == patientId at create time, but the safer lookup is on _id
    // since some callers pass the legacy patientId field (BN-YYYYMMDD-XXXX)
    // which equals _id for seed/registered patients.
    await Patient.updateOne({ _id: patientId }, { $set: { lastEncounterAt: enc.createdAt, updatedAt: now() } }).catch(() => {})
    res.status(201).json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /encounters/today — encounters whose local-day createdAt is today
// (HCM time). scheduledDate / studyDate are stored as YYYY-MM-DD strings
// already in local form so prefix-match still works for them; createdAt is
// a UTC ISO so we use the local-day UTC window.
router.get('/today', requireAuth, async (req, res) => {
  try {
    const day = todayISO()
    const list = await Encounter.find({
      $or: [
        { scheduledDate: { $regex: `^${day}` } },
        { studyDate: { $regex: `^${day}` } },
        { createdAt: { $gte: localDayStartUtcZ(day), $lte: localDayEndUtcZ(day) } },
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
      // from/to are local YYYY-MM-DD; convert to the matching UTC window
      // so cashier-day boundaries align with wall clock, not server clock.
      filter.createdAt = { $gte: localDayStartUtcZ(from), $lte: localDayEndUtcZ(to) }
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
        addedAt: now(),
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

// Q7 — PUT /encounters/:id/site — change the encounter's site (Trung Kính ↔
// Kim Giang). Locked once paid/cancelled. Useful when receptionist tiếp đón
// a BN under the wrong site by mistake; without this, bill stock-deduct
// would route to the wrong warehouse at checkout.
router.put('/:id/site', requireAuth, async (req, res) => {
  try {
    const site = String(req.body.site || '').trim()
    if (!site) return res.status(400).json({ error: 'Thiếu cơ sở mới' })
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    if (enc.status === 'paid' || enc.status === 'cancelled' || enc.status === 'completed') {
      return res.status(400).json({ error: 'Lượt khám đã đóng — không đổi cơ sở được' })
    }
    enc.site = site
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /encounters/:id/clinical-notes — partial update for the 5 clinical-text
// fields (clinicalInfo / presentIllness / pastHistory / diagnosis /
// conclusion). Each Khám textarea PUTs only the field it owns; others are
// left untouched. Empty string is allowed (clears the field).
const CLINICAL_NOTE_FIELDS = ['clinicalInfo', 'presentIllness', 'pastHistory', 'diagnosis', 'conclusion']
router.put('/:id/clinical-notes', requireAuth, async (req, res) => {
  try {
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    let touched = false
    for (const f of CLINICAL_NOTE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, f)) {
        enc[f] = String(req.body[f] || '')
        touched = true
      }
    }
    if (!touched) return res.status(400).json({ error: 'Không có trường nào để cập nhật' })
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

// Q3 — net paid amount across the payments[] ledger (positive sum minus
// refunded sum). Used to decide encounter status (partial vs paid) and to
// surface the cumulative collected amount to the cashier + reports.
function netPaidAmount(enc) {
  const pays = enc.payments || []
  let net = 0
  for (const p of pays) {
    const sign = p.kind === 'refund' ? -1 : 1
    net += sign * (p.amount || 0)
  }
  return Math.max(0, net)
}

function grandTotalForEnc(enc) {
  return Math.max(0, (enc.billTotal || 0) - effectiveDiscount(enc))
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
    // Auto-stamp performer on save (Q2 = B): if the caller didn't explicitly
    // pass assignedTo, attribute the work to the logged-in user. Only stamp
    // when there's actual work being recorded (output saved OR status moved
    // off 'pending') and the slot isn't already filled.
    if (assignedTo === undefined && !svc.assignedTo) {
      const isWork = output !== undefined || (status && status !== 'pending')
      if (isWork) {
        svc.assignedTo = req.user.username
        svc.assignedToName = req.user.displayName || req.user.username
      }
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
      addedAt: now(),
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

// Q3 — Stock-deduct on first payment. Extracted from the legacy /checkout
// path so /payment can call it on the first (and only first) payment to a
// previously-unpaid encounter. Returns { txId } on success or throws an Error
// with a user-facing message on failure (caller should send 400).
async function deductStockForFirstPayment(enc, user) {
  const stockItems = (enc.billItems || []).filter(b => (b.kind === 'thuoc' || b.kind === 'kinh') && b.code)
  if (stockItems.length === 0) return { txId: null }

  const wh = await Warehouse.findOne({ site: enc.site, status: 'active' }).lean()
  if (!wh) throw new Error(`Không có kho cho cơ sở "${enc.site}". Tạo Warehouse trước khi thanh toán.`)

  // Pre-flight stock check (no mutations) so we fail before deducting anything.
  const preChecks = []
  for (const b of stockItems) {
    const exists = await Supply.exists({ _id: b.code })
    if (!exists) throw new Error(`"${b.name}" không có trong Inventory — tạo Supply trước.`)
    const r = await stockCheck({ warehouseId: wh._id, supplyId: b.code, quantity: b.qty })
    if (!r.satisfied) {
      throw new Error(`Không đủ tồn kho cho "${b.name}" tại ${wh.name} — cần ${b.qty}, còn ${r.totalAvailable}. Nhập kho thêm hoặc bỏ mục khỏi bill.`)
    }
    preChecks.push({ b, plan: r.plan })
  }

  const txItems = []
  for (const { b } of preChecks) {
    const result = await fifoDeduct({ warehouseId: wh._id, supplyId: b.code, quantity: b.qty })
    const supply = await Supply.findById(b.code).lean()
    for (const c of result.consumed) {
      txItems.push({
        supplyId: b.code, supplyName: b.name, supplyCode: b.code,
        unit: supply?.unit || 'cái', packagingSpec: supply?.packagingSpec || '',
        lotId: c.lotId, lotNumber: c.lotNumber, expiryDate: c.expiryDate || '',
        quantity: c.quantity, unitPrice: b.unitPrice,
        amount: c.quantity * b.unitPrice,
      })
    }
  }

  const txId = `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`
  await new InventoryTransaction({
    _id: txId, transactionNumber: txId, type: 'auto_deduct',
    warehouseId: wh._id, warehouseName: wh.name, warehouseCode: wh.code, site: wh.site,
    items: txItems,
    totalAmount: txItems.reduce((s, i) => s + (i.amount || 0), 0),
    relatedVisitId: enc._id,
    notes: `Thu ngân ${user.displayName || user.username} — ${enc.patientName}`,
    status: 'confirmed', confirmedBy: user.username, confirmedAt: now(),
    createdBy: user.username, createdAt: now(), updatedAt: now(),
  }).save()
  return { txId }
}

// POST /encounters/:id/payment — record a payment (cash collected). First
// non-refund payment triggers stock deduct. Subsequent payments just add to
// the ledger. Body: { amount, method?, note? }. Status flips to 'partial'
// when paidAmount > 0 but < grandTotal, and 'paid' when paidAmount ≥
// grandTotal. Replaces /checkout (which is kept as a thin wrapper for
// backward compat — full grand-total payment in one call).
router.post('/:id/payment', requireAuth, async (req, res) => {
  try {
    const amount = Number(req.body.amount)
    if (!(amount > 0)) return res.status(400).json({ error: 'Số tiền phải lớn hơn 0' })

    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    if (enc.status === 'cancelled') return res.status(400).json({ error: 'Lượt khám đã hủy' })

    const grand = grandTotalForEnc(enc)
    if (grand <= 0) return res.status(400).json({ error: 'Bill chưa có mục để thanh toán' })

    const isFirstPayment = (enc.payments || []).filter(p => p.kind !== 'refund').length === 0

    let txId = null
    if (isFirstPayment) {
      try { ({ txId } = await deductStockForFirstPayment(enc, req.user)) }
      catch (e) { return res.status(400).json({ error: e.message }) }
      if (txId) {
        enc.consumablesTransactionId = txId
        enc.consumablesDeductedAt = now()
      }
    }

    const at = now()
    const entry = {
      at, by: req.user.username, byName: req.user.displayName || req.user.username,
      amount, method: req.body.method || 'cash', kind: 'payment',
      reason: req.body.note || '',
    }
    if (!enc.payments) enc.payments = []
    enc.payments.push(entry)

    enc.paidAmount = netPaidAmount(enc)
    enc.status = enc.paidAmount >= grand ? 'paid' : 'partial'
    if (isFirstPayment) {
      enc.paidAt = at
      enc.paidBy = req.user.username
      enc.paidByName = req.user.displayName || req.user.username
    }
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /encounters/:id/refund — record a refund. Optionally creates a
// reverse 'import' inventory transaction to put returned kính/thuốc stock
// back on the shelf (when `returnStock=true` AND the encounter has a
// previous auto_deduct transaction to mirror). Body: { amount, method?,
// reason?, returnStock?: bool }.
router.post('/:id/refund', requireAuth, async (req, res) => {
  try {
    const amount = Number(req.body.amount)
    if (!(amount > 0)) return res.status(400).json({ error: 'Số tiền hoàn phải lớn hơn 0' })

    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })

    const currentPaid = netPaidAmount(enc)
    if (currentPaid <= 0) return res.status(400).json({ error: 'Lượt khám chưa có thu — không thể hoàn' })
    if (amount > currentPaid) return res.status(400).json({ error: `Số tiền hoàn vượt mức đã thu (${currentPaid.toLocaleString('vi-VN')}đ)` })

    // Optional stock return: clone the original auto_deduct transaction as a
    // positive 'import' that recreates the same lots' qty. Only meaningful
    // when there's a consumablesTransactionId AND the caller opts in.
    let stockReturnTxId = null
    if (req.body.returnStock && enc.consumablesTransactionId) {
      const origTx = await InventoryTransaction.findById(enc.consumablesTransactionId).lean()
      if (!origTx) return res.status(400).json({ error: 'Không tìm thấy phiếu trừ kho gốc — không thể hoàn kho.' })
      // Recreate a lot per item (manufacturingDate inferred from origTx item if present)
      const wh = await Warehouse.findOne({ _id: origTx.warehouseId }).lean()
      const txItems = origTx.items.map(it => ({
        supplyId: it.supplyId, supplyName: it.supplyName, supplyCode: it.supplyCode,
        unit: it.unit, packagingSpec: it.packagingSpec || '',
        lotNumber: it.lotNumber, expiryDate: it.expiryDate || '',
        quantity: it.quantity, unitPrice: it.unitPrice || 0,
        amount: (it.quantity || 0) * (it.unitPrice || 0),
      }))
      stockReturnTxId = `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`
      const importTx = new InventoryTransaction({
        _id: stockReturnTxId, transactionNumber: stockReturnTxId, type: 'import',
        warehouseId: origTx.warehouseId, warehouseName: origTx.warehouseName,
        warehouseCode: origTx.warehouseCode, site: origTx.site,
        items: txItems,
        totalAmount: txItems.reduce((s, i) => s + (i.amount || 0), 0),
        relatedVisitId: enc._id,
        notes: `Hoàn kho — ${enc.patientName} (${enc._id}). Lý do: ${req.body.reason || 'không ghi'}`,
        status: 'draft',
        createdBy: req.user.username, createdAt: now(), updatedAt: now(),
      })
      await importTx.save()
      // Inline confirm to actually create the lots + bump Supply.currentStock.
      for (const item of importTx.items) {
        const supply = await Supply.findById(item.supplyId)
        if (!supply) continue
        const lot = new InventoryLot({
          _id: `LOT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          supplyId: item.supplyId, warehouseId: importTx.warehouseId,
          site: importTx.site || '',
          lotNumber: item.lotNumber || `RET-${Date.now().toString().slice(-6)}`,
          manufacturingDate: '', expiryDate: item.expiryDate || '',
          importTransactionId: importTx._id, importDate: now().slice(0, 10),
          initialQuantity: item.quantity, currentQuantity: item.quantity,
          unitPrice: item.unitPrice || 0, status: 'available', createdAt: now(),
        })
        await lot.save()
        supply.currentStock += item.quantity
        supply.updatedAt = now()
        await supply.save()
      }
      importTx.status = 'confirmed'
      importTx.confirmedBy = req.user.username
      importTx.confirmedAt = now()
      importTx.updatedAt = now()
      await importTx.save()
    }

    const entry = {
      at: now(), by: req.user.username, byName: req.user.displayName || req.user.username,
      amount, method: req.body.method || 'cash', kind: 'refund',
      reason: req.body.reason || '', stockReturnTxId,
    }
    if (!enc.payments) enc.payments = []
    enc.payments.push(entry)

    enc.paidAmount = netPaidAmount(enc)
    // Status semantics on refund: leave 'paid' if any positive remains
    // (cashier can see it's been a paid encounter even after partial refund);
    // drop to 'completed' when fully refunded so the encounter is no longer
    // counted as paid in revenue queries that filter status === 'paid'. But
    // we still net out the refund in reports for safety, so this is mostly
    // cosmetic. Use 'partial' if there's a leftover < grandTotal but > 0.
    const grand = grandTotalForEnc(enc)
    enc.status = enc.paidAmount === 0 ? 'completed'
      : enc.paidAmount < grand ? 'partial'
      : 'paid'
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /encounters/:id/checkout — full-payment shortcut, kept for backward
// compatibility with the legacy Thu Ngân UI. Internally delegates to
// /payment with amount = remaining grand-total. New code should call
// /payment directly so partial payments are first-class.
router.post('/:id/checkout', requireAuth, async (req, res) => {
  try {
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })
    if (enc.status === 'paid') return res.status(400).json({ error: 'Lượt khám đã được thanh toán' })

    const remaining = Math.max(0, grandTotalForEnc(enc) - netPaidAmount(enc))
    if (remaining <= 0) return res.status(400).json({ error: 'Bill chưa có mục để thanh toán' })

    const isFirstPayment = (enc.payments || []).filter(p => p.kind !== 'refund').length === 0
    let txId = null
    if (isFirstPayment) {
      try { ({ txId } = await deductStockForFirstPayment(enc, req.user)) }
      catch (e) { return res.status(400).json({ error: e.message }) }
      if (txId) {
        enc.consumablesTransactionId = txId
        enc.consumablesDeductedAt = now()
      }
    }

    const at = now()
    if (!enc.payments) enc.payments = []
    enc.payments.push({
      at, by: req.user.username, byName: req.user.displayName || req.user.username,
      amount: remaining, method: req.body.paymentMethod || req.body.method || 'cash',
      kind: 'payment', reason: '',
    })
    enc.paidAmount = netPaidAmount(enc)
    enc.status = 'paid'
    if (isFirstPayment) {
      enc.paidAt = at
      enc.paidBy = req.user.username
      enc.paidByName = req.user.displayName || req.user.username
    }
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /encounters/:id/bill-items/:billItemId — remove an item by its
// stable subdoc _id. Mongoose auto-assigns each subdoc an _id; using that
// instead of an array index avoids race-prone delete-the-wrong-row bugs
// when two staff members hit the same encounter concurrently.
//
// Backward compatibility: the legacy index-based call (`:idx` as a small
// integer string) is detected by the param being numeric AND in-range, and
// falls back to splice. Everything else is treated as a subdoc _id.
router.delete('/:id/bill-items/:billItemId', requireAuth, async (req, res) => {
  try {
    const enc = await Encounter.findById(req.params.id)
    if (!enc) return res.status(404).json({ error: 'Không tìm thấy lượt khám' })

    const param = req.params.billItemId
    let removed = false

    // Try stable _id first.
    const sub = enc.billItems.id ? enc.billItems.id(param) : null
    if (sub) {
      sub.deleteOne ? sub.deleteOne() : enc.billItems.pull({ _id: param })
      removed = true
    } else if (/^\d+$/.test(param)) {
      // Legacy: numeric index (kept so any in-flight client that hasn't
      // refreshed still works).
      const idx = parseInt(param, 10)
      if (idx >= 0 && idx < enc.billItems.length) {
        enc.billItems.splice(idx, 1)
        removed = true
      }
    }

    if (!removed) return res.status(400).json({ error: 'Không tìm thấy mục bill' })
    enc.billTotal = sumBill(enc.billItems)
    enc.updatedAt = now()
    await enc.save()
    res.json(enc.toObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
