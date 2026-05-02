const express = require('express')
const router = express.Router()
const { requireAuth, requireAdmin, requirePermission } = require('../middleware/auth')

// All catalog models
const ServiceType = require('../models/ServiceType')
const Service = require('../models/Service')
const Package = require('../models/Package')
const Thuoc = require('../models/Thuoc')
const Kinh = require('../models/Kinh')
const Specialty = require('../models/Specialty')
const ReferralDoctor = require('../models/ReferralDoctor')
const PartnerFacility = require('../models/PartnerFacility')
const CommissionGroup = require('../models/CommissionGroup')
const CommissionRule = require('../models/CommissionRule')
const TaxGroup = require('../models/TaxGroup')
const User = require('../models/User')
const Patient = require('../models/Patient')
const CustomerSource = require('../models/CustomerSource')
const Supply = require('../models/Supply')
const SupplyCategory = require('../models/SupplyCategory')
const Supplier = require('../models/Supplier')
const SupplyServiceMapping = require('../models/SupplyServiceMapping')
const Promotion = require('../models/Promotion')
const PromoCode = require('../models/PromoCode')
const AuditLog = require('../models/AuditLog')

const now = () => new Date().toISOString()

// ── Generic CRUD factory ─────────────────────────────────
// writePerm: optional permission key. When set, POST/PUT/DELETE use requirePermission(writePerm)
// instead of requireAdmin, so non-admin roles (e.g. kinhdoanh for partners.manage) can edit.
function catalogCRUD(Model, prefix, nameField = 'name', writePerm = null) {
  const writeGuard = writePerm ? requirePermission(writePerm) : requireAdmin

  // GET list
  router.get(`/${prefix}`, requireAuth, async (req, res) => {
    try {
      const filter = {}
      if (req.query.status) filter.status = req.query.status
      if (req.query.q) filter[nameField] = { $regex: req.query.q, $options: 'i' }
      // Extra filters
      if (req.query.type) filter.type = req.query.type
      if (req.query.level) filter.level = req.query.level
      if (req.query.parentCode) filter.parentCode = req.query.parentCode
      if (req.query.typeCode) filter.serviceTypeCode = req.query.typeCode
      if (req.query.modality) filter.modality = req.query.modality
      if (req.query.commissionGroupId) filter.commissionGroupId = req.query.commissionGroupId
      if (req.query.branchCode) filter.branchCode = req.query.branchCode
      const items = await Model.find(filter).sort({ [nameField]: 1 }).limit(+(req.query.limit || 500)).lean()
      res.json(items)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  // POST create
  // _id defaults to req.body.code when supplied (matches seed convention —
  // every seed script sets `_id: x.code`). UI calls PUT/DELETE with `code`
  // as the URL param, so keeping `_id == code` makes those routes work
  // without a separate lookup. The PREFIX-timestamp fallback only fires
  // when the caller didn't supply a code (rare, mostly legacy callers).
  router.post(`/${prefix}`, writeGuard, async (req, res) => {
    try {
      const _id = req.body.code || `${prefix.toUpperCase()}-${Date.now()}`
      const data = { ...req.body, _id, createdAt: now(), updatedAt: now() }
      if (!data.status) data.status = 'active'
      const item = new Model(data)
      await item.save()
      res.status(201).json(item)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  // PUT update
  // Look up by `_id` first (covers seeded + new-correctly-keyed rows), then
  // fall back to `{code: param}` so any pre-fix rows (where _id was set to
  // PREFIX-timestamp but code was the user-friendly value) remain editable.
  router.put(`/${prefix}/:id`, writeGuard, async (req, res) => {
    try {
      const update = { ...req.body, updatedAt: now() }
      delete update._id
      let item = await Model.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
      if (!item) item = await Model.findOneAndUpdate({ code: req.params.id }, update, { new: true }).lean()
      if (!item) return res.status(404).json({ error: 'Không tìm thấy' })
      res.json(item)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  // DELETE — same dual-lookup as PUT.
  router.delete(`/${prefix}/:id`, writeGuard, async (req, res) => {
    try {
      let r = await Model.findByIdAndDelete(req.params.id)
      if (!r) r = await Model.findOneAndDelete({ code: req.params.id })
      res.json({ ok: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })
}

// Register all catalog CRUD routes
catalogCRUD(ServiceType, 'service-types')
catalogCRUD(Service, 'services')
catalogCRUD(Package, 'packages')
catalogCRUD(Specialty, 'specialties')

// ── Linked CRUD for Thuốc / Kính (auto-syncs to Supply for inventory) ─────
// Difference from generic catalogCRUD:
// - _id = code (not auto-generated) — keeps Catalog.code == Supply.code
// - On create/update: upserts a mirror Supply with productKind/productCode set
// - On delete: marks Supply inactive (preserves any inventory tx history)

async function syncSupplyFromCatalog(item, productKind) {
  const t = now()
  const set = {
    code: item.code,
    name: item.name,
    productKind,
    productCode: item.code,
    packagingSpec: item.spec || '',
    status: item.status || 'active',
    updatedAt: t,
  }
  await Supply.findByIdAndUpdate(
    item.code,
    {
      $set: set,
      $setOnInsert: {
        _id: item.code,
        unit: 'cái',
        currentStock: 0,
        conversionRate: 1,
        minimumStock: 0,
        createdAt: t,
      },
    },
    { upsert: true, new: true }
  )
}

function linkedCatalogCRUD(Model, prefix, productKind) {
  router.get(`/${prefix}`, requireAuth, async (req, res) => {
    try {
      const filter = {}
      if (req.query.status) filter.status = req.query.status
      if (req.query.q) filter.name = { $regex: req.query.q, $options: 'i' }
      if (req.query.category) filter.category = req.query.category
      const items = await Model.find(filter).sort({ name: 1 }).limit(+(req.query.limit || 500)).lean()
      res.json(items)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post(`/${prefix}`, requireAdmin, async (req, res) => {
    try {
      const code = (req.body.code || '').trim()
      if (!code) return res.status(400).json({ error: 'code là bắt buộc' })
      const data = { ...req.body, _id: code, code, createdAt: now(), updatedAt: now() }
      if (!data.status) data.status = 'active'
      const item = new Model(data)
      await item.save()
      await syncSupplyFromCatalog(item.toObject(), productKind)
      res.status(201).json(item)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.put(`/${prefix}/:id`, requireAdmin, async (req, res) => {
    try {
      const update = { ...req.body, updatedAt: now() }
      delete update._id
      const item = await Model.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
      if (!item) return res.status(404).json({ error: 'Không tìm thấy' })
      await syncSupplyFromCatalog(item, productKind)
      res.json(item)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.delete(`/${prefix}/:id`, requireAdmin, async (req, res) => {
    try {
      await Model.findByIdAndDelete(req.params.id)
      // Keep Supply for tx history; just inactivate so it stops appearing in pickers.
      await Supply.findByIdAndUpdate(req.params.id, { status: 'inactive', updatedAt: now() })
      res.json({ ok: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })
}

linkedCatalogCRUD(Thuoc, 'thuoc', 'thuoc')
linkedCatalogCRUD(Kinh,  'kinh',  'kinh')
catalogCRUD(ReferralDoctor, 'referral-doctors', 'name', 'partners.manage')
catalogCRUD(PartnerFacility, 'partner-facilities', 'name', 'partners.manage')
catalogCRUD(CommissionGroup, 'commission-groups', 'name', 'partners.manage')
catalogCRUD(CommissionRule, 'commission-rules', 'name', 'partners.manage')
catalogCRUD(TaxGroup, 'tax-groups')

// customer-sources: seed 3 defaults on first GET so the Registration dropdown is never empty
const DEFAULT_CUSTOMER_SOURCES = [
  { code: 'TUDEN',    name: 'Tự đến',           requiresReferralPartner: false },
  { code: 'ONLMKT',   name: 'Online Marketing', requiresReferralPartner: false },
  { code: 'GIOITHIEU',name: 'Được giới thiệu',  requiresReferralPartner: true  },
]
router.get('/customer-sources', requireAuth, async (req, res) => {
  try {
    let items = await CustomerSource.find({}).sort({ name: 1 }).lean()
    if (items.length === 0) {
      const ts = now()
      await CustomerSource.insertMany(DEFAULT_CUSTOMER_SOURCES.map((s, i) => ({
        ...s, _id: `CUSTOMER-SOURCES-SEED-${i}`, status: 'active', createdAt: ts, updatedAt: ts,
      })))
      items = await CustomerSource.find({}).sort({ name: 1 }).lean()
    }
    res.json(items)
  } catch (err) { res.status(500).json({ error: err.message }) }
})
catalogCRUD(CustomerSource, 'customer-sources')

// ── Danh mục summary (landing page tiles + recent edits) ─
// Returns per-catalog item counts + the last 10 catalog-write audit entries,
// so the landing page can render 4 group tiles + a recent-edits feed without
// 20 parallel fetches. Counts are cheap (single indexed collection).
const SUMMARY_CATALOGS = [
  { key: 'customer-sources',       model: CustomerSource },
  { key: 'referral-doctors',       model: ReferralDoctor },
  { key: 'partner-facilities',     model: PartnerFacility },
  { key: 'commission-groups',      model: CommissionGroup },
  { key: 'commission-rules',       model: CommissionRule },
  { key: 'specialties',            model: Specialty },
  { key: 'services',               model: Service },
  { key: 'service-types',          model: ServiceType },
  { key: 'tax-groups',             model: TaxGroup },
  { key: 'promotions',             model: Promotion },
  { key: 'promo-codes',            model: PromoCode },
  { key: 'users',                  model: User },
  { key: 'patients',               model: Patient },
  { key: 'supplies',               model: Supply },
  { key: 'supply-categories',      model: SupplyCategory },
  { key: 'suppliers',              model: Supplier },
  { key: 'supply-service-mapping', model: SupplyServiceMapping },
]
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const counts = Object.fromEntries(await Promise.all(SUMMARY_CATALOGS.map(async ({ key, model }) => {
      const c = await model.countDocuments({}).catch(() => 0)
      return [key, c]
    })))
    // Recent write activity on catalogs/promotions (both back Danh mục surface)
    const recentEdits = await AuditLog.find({
      resource: { $in: ['catalogs', 'promotions'] },
      method: { $in: ['POST', 'PUT', 'DELETE'] },
      status: { $gte: 200, $lt: 300 },
    }).sort({ ts: -1 }).limit(10).lean()
    res.json({ counts, recentEdits })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Inventory catalogs ───────────────────────────────────
// Supplies / categories / suppliers: generic CRUD, gated by inventory.manage.
// The /api/inventory/* endpoints still exist for the Kho workspace's internal
// reads (e.g. category filter dropdown) — both read from the same collections.
catalogCRUD(Supply, 'supplies', 'name', 'inventory.manage')
catalogCRUD(SupplyCategory, 'supply-categories', 'name', 'inventory.manage')
catalogCRUD(Supplier, 'suppliers', 'name', 'inventory.manage')

// ── Supply-Service mapping (Định mức dịch vụ) ────────────
// Custom GET so we can backfill an empty serviceName by joining Service on
// serviceId/serviceCode — seed data leaves the display name blank.
const manageInventory = requirePermission('inventory.manage')
router.get('/supply-service-mapping', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.q) filter.$or = [
      { serviceName: { $regex: req.query.q, $options: 'i' } },
      { serviceCode: { $regex: req.query.q, $options: 'i' } },
      { supplyName:  { $regex: req.query.q, $options: 'i' } },
      { supplyCode:  { $regex: req.query.q, $options: 'i' } },
    ]
    const mappings = await SupplyServiceMapping.find(filter).sort({ serviceName: 1, supplyName: 1 }).lean()

    // Collect the Service references we need to resolve
    const needIds   = [...new Set(mappings.filter(m => !m.serviceName && m.serviceId  ).map(m => m.serviceId))]
    const needCodes = [...new Set(mappings.filter(m => !m.serviceName && !m.serviceId && m.serviceCode).map(m => m.serviceCode))]
    const byId = new Map()
    const byCode = new Map()
    if (needIds.length)   (await Service.find({ _id:  { $in: needIds   } }).lean()).forEach(s => byId.set(s._id, s))
    if (needCodes.length) (await Service.find({ code: { $in: needCodes } }).lean()).forEach(s => byCode.set(s.code, s))

    const hydrated = mappings.map(m => {
      if (m.serviceName) return m
      const s = (m.serviceId && byId.get(m.serviceId)) || (m.serviceCode && byCode.get(m.serviceCode))
      if (!s) return m
      return { ...m, serviceName: s.name, serviceId: m.serviceId || s._id, serviceCode: m.serviceCode || s.code }
    })
    res.json(hydrated)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/supply-service-mapping', manageInventory, async (req, res) => {
  try {
    const data = { ...req.body, _id: `SUPPLY-SERVICE-MAPPING-${Date.now()}`, createdAt: now(), updatedAt: now() }
    const item = new SupplyServiceMapping(data)
    await item.save()
    res.status(201).json(item)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/supply-service-mapping/:id', manageInventory, async (req, res) => {
  try {
    const update = { ...req.body, updatedAt: now() }
    delete update._id
    const item = await SupplyServiceMapping.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!item) return res.status(404).json({ error: 'Không tìm thấy' })
    res.json(item)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/supply-service-mapping/:id', manageInventory, async (req, res) => {
  try {
    await SupplyServiceMapping.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Public services endpoint (for booking form) ──────────
router.get('/services/public', async (req, res) => {
  try {
    const services = await Service.find({ status: 'active' }).sort({ serviceTypeCode: 1, name: 1 }).lean()
    res.json(services.map(s => ({ _id: s._id, code: s.code, name: s.name, serviceTypeCode: s.serviceTypeCode, modality: s.modality, basePrice: s.basePrice })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Users list (read-only for catalog) ───────────────────
router.get('/users', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.q) filter.$or = [
      { _id: { $regex: req.query.q, $options: 'i' } },
      { displayName: { $regex: req.query.q, $options: 'i' } },
    ]
    if (req.query.role) filter.role = req.query.role
    const users = await User.find(filter).select('-password').sort({ displayName: 1 }).lean()
    res.json(users)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Update user (admin) ─────────────────────────────────
router.put('/users/:id', requireAdmin, async (req, res) => {
  try {
    const update = { ...req.body }
    delete update._id
    delete update.password
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password').lean()
    if (!user) return res.status(404).json({ error: 'Không tìm thấy' })
    res.json(user)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Create user (admin) ─────────────────────────────────
router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { _id, password, ...rest } = req.body
    if (!_id) return res.status(400).json({ error: 'Mã nhân viên là bắt buộc' })
    const existing = await User.findById(_id)
    if (existing) return res.status(400).json({ error: 'Mã nhân viên đã tồn tại' })
    const user = new User({ _id, password: password || _id, ...rest })
    await user.save()
    const result = user.toObject()
    delete result.password
    res.status(201).json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Patients list (read-only for catalog) ────────────────
// Server-driven filtering + pagination so the Bệnh nhân tab scales past
// the ~100-row cap that bit us before (advanced filters silently missed
// anyone past row 100 because they ran client-side over the truncated
// response). Response shape is { items, total, page, pageSize } — the
// only consumer is PatientsTable in Catalogs.jsx.
//
// Search semantics: when `q` is provided it's authoritative — gender /
// age / date filters are ignored so receptionists searching by name/SĐT
// always see all matches regardless of which filters are toggled.
router.get('/patients', requireAuth, async (req, res) => {
  try {
    const { q, gender, ageMin, ageMax, createdFrom, createdTo, lastFrom, lastTo } = req.query
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize) || 200))

    const filter = {}
    if (q && q.trim()) {
      // Escape regex specials — patient queries often include "(", "+", etc.
      const safe = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { patientId: { $regex: safe, $options: 'i' } },
        { phone: { $regex: safe, $options: 'i' } },
        { idCard: { $regex: safe, $options: 'i' } },
        { guardianName: { $regex: safe, $options: 'i' } },
        { guardianPhone: { $regex: safe, $options: 'i' } },
      ]
    } else {
      if (gender) filter.gender = gender
      // Age range → dob range. dob is stored as YYYY-MM-DD string so lex
      // compare works. age >= ageMin ↔ dob <= today minus ageMin years.
      // age <= ageMax ↔ dob > today minus (ageMax+1) years.
      if (ageMin !== undefined && ageMin !== '') {
        const d = new Date(); d.setFullYear(d.getFullYear() - parseInt(ageMin))
        filter.dob = { ...(filter.dob || {}), $lte: d.toISOString().slice(0, 10), $ne: '' }
      }
      if (ageMax !== undefined && ageMax !== '') {
        const d = new Date(); d.setFullYear(d.getFullYear() - parseInt(ageMax) - 1); d.setDate(d.getDate() + 1)
        filter.dob = { ...(filter.dob || {}), $gte: d.toISOString().slice(0, 10) }
      }
      if (createdFrom) {
        filter.createdAt = { ...(filter.createdAt || {}), $gte: `${createdFrom}T00:00:00` }
      }
      if (createdTo) {
        filter.createdAt = { ...(filter.createdAt || {}), $lte: `${createdTo}T23:59:59.999` }
      }
      if (lastFrom) {
        filter.lastEncounterAt = { ...(filter.lastEncounterAt || {}), $gte: `${lastFrom}T00:00:00` }
      }
      if (lastTo) {
        filter.lastEncounterAt = { ...(filter.lastEncounterAt || {}), $lte: `${lastTo}T23:59:59.999` }
      }
    }

    const [total, items] = await Promise.all([
      Patient.countDocuments(filter),
      Patient.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ])
    res.json({ items, total, page, pageSize })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
