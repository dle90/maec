const express = require('express')
const crypto = require('crypto')
const router = express.Router()
const Supplier = require('../models/Supplier')
const SupplyCategory = require('../models/SupplyCategory')
const Supply = require('../models/Supply')
const InventoryTransaction = require('../models/InventoryTransaction')
const InventoryLot = require('../models/InventoryLot')
const Warehouse = require('../models/Warehouse')
const CancelReason = require('../models/CancelReason')
const SupplyServiceMapping = require('../models/SupplyServiceMapping')
const StocktakeSession = require('../models/StocktakeSession')
const { requireAuth, requirePermission } = require('../middleware/auth')
const { withWarehouseScope, listAccessibleWarehouses, isSupervisor } = require('../lib/warehouseScope')

const manageInventory = requirePermission('inventory.manage')

const now = () => new Date().toISOString()
const today = () => now().slice(0, 10)
const rid = (prefix) => `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`

// ═══════════════════════════════════════════════════════════
//  WAREHOUSE SCOPE ENDPOINTS  (landing / switcher support)
// ═══════════════════════════════════════════════════════════
router.get('/warehouses/accessible', requireAuth, async (req, res) => {
  try {
    const warehouses = await listAccessibleWarehouses(req.user)
    res.json({
      warehouses,
      supervisor: isSupervisor(req.user),
      defaultWarehouseId: warehouses.length === 1 ? warehouses[0]._id : null,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  SUPPLIERS
// ═══════════════════════════════════════════════════════════
router.get('/suppliers', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.status) filter.status = req.query.status
    if (req.query.q) filter.name = { $regex: req.query.q, $options: 'i' }
    const suppliers = await Supplier.find(filter).sort({ name: 1 }).lean()
    res.json(suppliers)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/suppliers', manageInventory, async (req, res) => {
  try {
    const { code, name, contactPerson, phone, email, address, taxCode } = req.body
    if (!name) return res.status(400).json({ error: 'Tên nhà cung cấp là bắt buộc' })
    const supplier = new Supplier({
      _id: `SUP-${Date.now()}`,
      code: code || `NCC-${Date.now().toString().slice(-6)}`,
      name, contactPerson, phone, email, address, taxCode,
      status: 'active',
      createdAt: now(), updatedAt: now(),
    })
    await supplier.save()
    res.status(201).json(supplier)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/suppliers/:id', manageInventory, async (req, res) => {
  try {
    const update = { ...req.body, updatedAt: now() }
    delete update._id
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!supplier) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' })
    res.json(supplier)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  SUPPLY CATEGORIES
// ═══════════════════════════════════════════════════════════
router.get('/categories', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.status) filter.status = req.query.status
    const categories = await SupplyCategory.find(filter).sort({ name: 1 }).lean()
    res.json(categories)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/categories', manageInventory, async (req, res) => {
  try {
    const { code, name, parentId } = req.body
    if (!name) return res.status(400).json({ error: 'Tên nhóm vật tư là bắt buộc' })
    const cat = new SupplyCategory({
      _id: `SCAT-${Date.now()}`,
      code: code || `NVT-${Date.now().toString().slice(-6)}`,
      name, parentId: parentId || null,
      status: 'active',
      createdAt: now(), updatedAt: now(),
    })
    await cat.save()
    res.status(201).json(cat)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/categories/:id', manageInventory, async (req, res) => {
  try {
    const update = { ...req.body, updatedAt: now() }
    delete update._id
    const cat = await SupplyCategory.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!cat) return res.status(404).json({ error: 'Không tìm thấy nhóm vật tư' })
    res.json(cat)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  SUPPLIES  (master SKU — not warehouse-scoped)
// ═══════════════════════════════════════════════════════════
router.get('/supplies', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.categoryId) filter.categoryId = req.query.categoryId
    if (req.query.status) filter.status = req.query.status
    if (req.query.productKind) filter.productKind = req.query.productKind
    if (req.query.q) {
      filter.$or = [
        { name: { $regex: req.query.q, $options: 'i' } },
        { code: { $regex: req.query.q, $options: 'i' } },
      ]
    }
    const supplies = await Supply.find(filter).sort({ name: 1 }).lean()
    res.json(supplies)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/supplies', manageInventory, async (req, res) => {
  try {
    const { code, name, categoryId, unit, packagingSpec, conversionRate, minimumStock, supplierId } = req.body
    if (!name) return res.status(400).json({ error: 'Tên vật tư là bắt buộc' })
    const supply = new Supply({
      _id: `SPL-${Date.now()}`,
      code: code || `VT-${Date.now().toString().slice(-6)}`,
      name, categoryId, unit: unit || 'cái', packagingSpec: packagingSpec || '',
      conversionRate: conversionRate || 1,
      minimumStock: minimumStock || 0,
      supplierId,
      status: 'active',
      createdAt: now(), updatedAt: now(),
    })
    await supply.save()
    res.status(201).json(supply)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/supplies/:id', manageInventory, async (req, res) => {
  try {
    const update = { ...req.body, updatedAt: now() }
    delete update._id
    delete update.currentStock
    const supply = await Supply.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!supply) return res.status(404).json({ error: 'Không tìm thấy vật tư' })
    res.json(supply)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  STOCK  (live aggregation per warehouse)
// ═══════════════════════════════════════════════════════════

// GET /inventory/stock — rows: { supply, qty, nearestExpiry, belowMin }
// Scope: one warehouse (nv_kho default, supervisor with ?warehouseId=X)
//        OR summed across the supervisor's accessible set (no ?warehouseId=)
router.get('/stock', requireAuth, withWarehouseScope(), async (req, res) => {
  try {
    const { ids } = req.warehouseScope
    const lotMatch = { warehouseId: { $in: ids }, status: 'available', currentQuantity: { $gt: 0 } }

    // Aggregate lots grouped by supply
    const agg = await InventoryLot.aggregate([
      { $match: lotMatch },
      { $group: {
          _id: '$supplyId',
          qty: { $sum: '$currentQuantity' },
          nearestExpiry: { $min: '$expiryDate' },
          lotCount: { $sum: 1 },
      } },
    ])
    const bySupplyId = {}
    agg.forEach(row => { bySupplyId[row._id] = row })

    const supplyFilter = { status: 'active' }
    if (req.query.productKind) supplyFilter.productKind = req.query.productKind
    const supplies = await Supply.find(supplyFilter).lean()
    const rows = supplies.map(s => {
      const a = bySupplyId[s._id] || { qty: 0, nearestExpiry: null, lotCount: 0 }
      return {
        supply: { _id: s._id, code: s.code, name: s.name, unit: s.unit, categoryId: s.categoryId, minimumStock: s.minimumStock, productKind: s.productKind || 'supply', packagingSpec: s.packagingSpec },
        qty: a.qty,
        nearestExpiry: a.nearestExpiry,
        lotCount: a.lotCount,
        belowMin: s.minimumStock > 0 && a.qty < s.minimumStock,
      }
    })

    // Optional filters
    let out = rows
    if (req.query.categoryId) out = out.filter(r => r.supply.categoryId === req.query.categoryId)
    if (req.query.belowMin === 'true') out = out.filter(r => r.belowMin)
    if (req.query.q) {
      const q = req.query.q.toLowerCase()
      out = out.filter(r => r.supply.name.toLowerCase().includes(q) || (r.supply.code || '').toLowerCase().includes(q))
    }
    res.json({ rows: out, scope: { mode: req.warehouseScope.mode, ids } })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /inventory/stock/matrix — supply × warehouse matrix for supervisor
router.get('/stock/matrix', requireAuth, async (req, res) => {
  try {
    if (!isSupervisor(req.user)) return res.status(403).json({ error: 'Chỉ supervisor mới xem ma trận' })
    const warehouses = await listAccessibleWarehouses(req.user)
    const whIds = warehouses.map(w => w._id)

    const agg = await InventoryLot.aggregate([
      { $match: { warehouseId: { $in: whIds }, status: 'available', currentQuantity: { $gt: 0 } } },
      { $group: { _id: { supplyId: '$supplyId', warehouseId: '$warehouseId' }, qty: { $sum: '$currentQuantity' } } },
    ])
    const cells = {} // supplyId → { warehouseId → qty }
    agg.forEach(r => {
      cells[r._id.supplyId] = cells[r._id.supplyId] || {}
      cells[r._id.supplyId][r._id.warehouseId] = r.qty
    })

    const supplies = await Supply.find({ status: 'active' }).sort({ name: 1 }).lean()
    const rows = supplies.map(s => {
      const per = cells[s._id] || {}
      const total = Object.values(per).reduce((a, b) => a + b, 0)
      const min = s.minimumStock || 0
      return {
        supply: { _id: s._id, code: s.code, name: s.name, unit: s.unit, minimumStock: min },
        cells: whIds.map(id => ({ warehouseId: id, qty: per[id] || 0, belowMin: min > 0 && (per[id] || 0) < min })),
        total,
      }
    })

    let out = rows
    if (req.query.categoryId) out = out.filter(r => {
      const sup = supplies.find(s => s._id === r.supply._id)
      return sup?.categoryId === req.query.categoryId
    })
    if (req.query.belowMin === 'true') {
      out = out.filter(r => r.cells.some(c => c.belowMin))
    }
    if (req.query.q) {
      const q = req.query.q.toLowerCase()
      out = out.filter(r => r.supply.name.toLowerCase().includes(q) || (r.supply.code || '').toLowerCase().includes(q))
    }

    res.json({ warehouses, rows: out })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  ALERTS / LANDING SUMMARY
// ═══════════════════════════════════════════════════════════
router.get('/alerts', requireAuth, withWarehouseScope(), async (req, res) => {
  try {
    const { ids } = req.warehouseScope
    const todayStr = today()
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const in60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)

    const expiringSoonLots = await InventoryLot.find({
      warehouseId: { $in: ids },
      status: 'available',
      currentQuantity: { $gt: 0 },
      expiryDate: { $ne: '', $gte: todayStr, $lte: in60 },
    }).sort({ expiryDate: 1 }).limit(20).lean()

    const countExp30 = expiringSoonLots.filter(l => l.expiryDate <= in30).length

    // Below-min supplies
    const supplies = await Supply.find({ status: 'active', minimumStock: { $gt: 0 } }).lean()
    const lotAgg = await InventoryLot.aggregate([
      { $match: { warehouseId: { $in: ids }, status: 'available', currentQuantity: { $gt: 0 } } },
      { $group: { _id: '$supplyId', qty: { $sum: '$currentQuantity' } } },
    ])
    const onHand = {}
    lotAgg.forEach(r => { onHand[r._id] = r.qty })
    const belowMin = supplies
      .filter(s => (onHand[s._id] || 0) < s.minimumStock)
      .map(s => ({ supplyId: s._id, code: s.code, name: s.name, unit: s.unit, qty: onHand[s._id] || 0, minimumStock: s.minimumStock }))
      .sort((a, b) => (a.qty / (a.minimumStock || 1)) - (b.qty / (b.minimumStock || 1)))

    // Pending transfers-in (to receive)
    const pendingTransfers = await InventoryTransaction.find({
      warehouseId: { $in: ids },
      type: 'transfer_in',
      status: 'draft',
    }).sort({ createdAt: -1 }).limit(10).lean()

    // Today's auto-deduct variance count (Studies only — not in this collection; we flag via tx notes)
    const varianceTxs = await InventoryTransaction.find({
      warehouseId: { $in: ids },
      type: 'auto_deduct',
      createdAt: { $gte: todayStr + 'T00:00:00' },
      reasonCode: 'variance',
    }).lean()

    res.json({
      expiringSoon: { count30: countExp30, count60: expiringSoonLots.length, lots: expiringSoonLots.slice(0, 5) },
      belowMinimum: { count: belowMin.length, supplies: belowMin.slice(0, 5) },
      pendingTransfers: { count: pendingTransfers.length, transfers: pendingTransfers },
      autoDeductVariance: { count: varianceTxs.length, transactions: varianceTxs.slice(0, 5) },
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /inventory/activity-today — counts + recent feed for landing
router.get('/activity-today', requireAuth, withWarehouseScope(), async (req, res) => {
  try {
    const { ids } = req.warehouseScope
    const from = today() + 'T00:00:00'
    const txs = await InventoryTransaction.find({
      warehouseId: { $in: ids },
      createdAt: { $gte: from },
    }).sort({ createdAt: -1 }).limit(50).lean()
    const counts = { import: 0, export: 0, auto_deduct: 0, adjustment: 0, transfer_in: 0, transfer_out: 0 }
    txs.forEach(t => { counts[t.type] = (counts[t.type] || 0) + 1 })
    res.json({ counts, recent: txs.slice(0, 15) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  TRANSACTIONS  (unified log)
// ═══════════════════════════════════════════════════════════
async function nextTxNumber(type) {
  const prefixMap = { import: 'NK', export: 'XK', adjustment: 'DC', transfer_out: 'CO', transfer_in: 'CI', auto_deduct: 'AU' }
  const prefix = prefixMap[type] || 'TX'
  const d = today().replace(/-/g, '')
  const count = await InventoryTransaction.countDocuments({
    transactionNumber: { $regex: `^${prefix}-${d}` },
  })
  return `${prefix}-${d}-${String(count + 1).padStart(3, '0')}`
}

function calcItemTotals(items) {
  return items.map(it => {
    const qty = it.quantity || 0
    const convQty = it.conversionQuantity || 0
    const purchasePrice = it.purchasePrice || it.unitPrice || 0
    const unitPr = convQty > 0 ? purchasePrice / (convQty / qty || 1) : purchasePrice
    const amtBefore = purchasePrice * qty
    const vatRate = it.vatRate || 0
    const vatAmt = Math.round(amtBefore * vatRate / 100)
    const amtAfter = amtBefore + vatAmt
    const discPct = it.discountPercent || 0
    const discAmt = it.discountAmount || Math.round(amtAfter * discPct / 100)
    const finalAmt = amtAfter - discAmt
    return {
      supplyId: it.supplyId,
      supplyName: it.supplyName,
      supplyCode: it.supplyCode || '',
      unit: it.unit || '',
      packagingSpec: it.packagingSpec || '',
      lotId: it.lotId || '',
      lotNumber: it.lotNumber || '',
      manufacturingDate: it.manufacturingDate || '',
      expiryDate: it.expiryDate || '',
      quantity: qty,
      conversionQuantity: convQty,
      purchasePrice,
      unitPrice: unitPr,
      amountBeforeTax: amtBefore,
      vatRate,
      vatAmount: vatAmt,
      amountAfterTax: amtAfter,
      discountPercent: discPct,
      discountAmount: discAmt,
      amount: finalAmt,
      notes: it.notes || '',
    }
  })
}

// List transactions (unified log). Filter by type, date, supply, reason.
router.get('/transactions', requireAuth, withWarehouseScope(), async (req, res) => {
  try {
    const { ids } = req.warehouseScope
    const filter = { warehouseId: { $in: ids } }
    if (req.query.type) filter.type = Array.isArray(req.query.type) ? { $in: req.query.type } : req.query.type
    if (req.query.status) filter.status = req.query.status
    if (req.query.reasonCode) filter.reasonCode = req.query.reasonCode
    if (req.query.supplyId) filter['items.supplyId'] = req.query.supplyId
    if (req.query.accountingPeriod) filter.accountingPeriod = req.query.accountingPeriod
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {}
      if (req.query.dateFrom) filter.createdAt.$gte = req.query.dateFrom
      if (req.query.dateTo) filter.createdAt.$lte = req.query.dateTo + 'T23:59:59'
    }
    const txs = await InventoryTransaction.find(filter).sort({ createdAt: -1 }).limit(+req.query.limit || 200).lean()
    res.json(txs)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/transactions/:id', requireAuth, async (req, res) => {
  try {
    const tx = await InventoryTransaction.findById(req.params.id).lean()
    if (!tx) return res.status(404).json({ error: 'Không tìm thấy phiếu' })
    // Verify caller has access to this warehouse
    const accessible = await listAccessibleWarehouses(req.user)
    if (!accessible.some(w => w._id === tx.warehouseId)) {
      return res.status(403).json({ error: 'Bạn không có quyền xem phiếu này' })
    }
    res.json(tx)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Create transaction (import / export / adjustment). For transfers use /transfers.
router.post('/transactions', requireAuth, async (req, res) => {
  try {
    const { type, warehouseId, items, supplierId, supplierName, reasonCode, reason, notes,
            accountingPeriod } = req.body
    if (!type || !['import', 'export', 'adjustment'].includes(type)) {
      return res.status(400).json({ error: 'Loại phiếu không hợp lệ' })
    }
    if (!warehouseId) return res.status(400).json({ error: 'Thiếu kho' })
    if (!items || items.length === 0) return res.status(400).json({ error: 'Thiếu danh sách vật tư' })

    const accessible = await listAccessibleWarehouses(req.user)
    const wh = accessible.find(w => w._id === warehouseId)
    if (!wh) return res.status(403).json({ error: 'Bạn không có quyền tạo phiếu cho kho này' })

    const mappedItems = calcItemTotals(items)
    const totalAmountBeforeTax = mappedItems.reduce((s, it) => s + it.amountBeforeTax, 0)
    const totalVat = mappedItems.reduce((s, it) => s + it.vatAmount, 0)
    const totalDiscount = mappedItems.reduce((s, it) => s + it.discountAmount, 0)
    const totalAmount = mappedItems.reduce((s, it) => s + it.amount, 0)

    const tx = new InventoryTransaction({
      _id: rid('TX'),
      transactionNumber: await nextTxNumber(type),
      type,
      warehouseId: wh._id,
      warehouseName: wh.name,
      warehouseCode: wh.code,
      site: wh.site || '',
      accountingPeriod: accountingPeriod || '',
      items: mappedItems,
      totalAmountBeforeTax, totalVat, totalDiscount, totalAmount,
      supplierId, supplierName,
      reasonCode: reasonCode || '',
      reason: reason || '',
      notes: notes || '',
      status: 'draft',
      createdBy: req.user.username,
      createdAt: now(), updatedAt: now(),
    })
    await tx.save()
    res.status(201).json(tx)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// FIFO deduct a quantity of a supply from a specific warehouse. Returns the
// list of (lotId, deducted) pairs actually consumed. Soft-fail: if insufficient,
// deducts what's available and returns { satisfied: false, shortfall: N }.
async function fifoDeduct({ warehouseId, supplyId, quantity }) {
  let remaining = quantity
  const consumed = []
  const lots = await InventoryLot.find({
    warehouseId, supplyId, status: 'available', currentQuantity: { $gt: 0 },
  }).sort({ expiryDate: 1, createdAt: 1 })
  for (const lot of lots) {
    if (remaining <= 0) break
    const take = Math.min(lot.currentQuantity, remaining)
    lot.currentQuantity -= take
    if (lot.currentQuantity <= 0) lot.status = 'depleted'
    await lot.save()
    consumed.push({ lotId: lot._id, lotNumber: lot.lotNumber, quantity: take, expiryDate: lot.expiryDate })
    remaining -= take
  }
  return { satisfied: remaining <= 0, shortfall: Math.max(0, remaining), consumed }
}

// Confirm transaction → apply effects (create lots on import, FIFO-deduct on export, etc.)
router.put('/transactions/:id/confirm', requireAuth, async (req, res) => {
  try {
    const tx = await InventoryTransaction.findById(req.params.id)
    if (!tx) return res.status(404).json({ error: 'Không tìm thấy phiếu' })
    if (tx.status !== 'draft') return res.status(400).json({ error: 'Phiếu đã xác nhận hoặc đã hủy' })

    for (const item of tx.items) {
      const supply = await Supply.findById(item.supplyId)
      if (!supply) continue

      if (tx.type === 'import' || tx.type === 'transfer_in') {
        const lot = new InventoryLot({
          _id: rid('LOT'),
          supplyId: item.supplyId,
          warehouseId: tx.warehouseId,
          site: tx.site || '',
          lotNumber: item.lotNumber || `L-${Date.now().toString().slice(-6)}`,
          manufacturingDate: item.manufacturingDate || '',
          expiryDate: item.expiryDate || '',
          importTransactionId: tx._id,
          importDate: today(),
          initialQuantity: item.quantity,
          currentQuantity: item.quantity,
          unitPrice: item.unitPrice || 0,
          status: 'available',
          createdAt: now(),
        })
        await lot.save()
        supply.currentStock += item.quantity
      } else if (tx.type === 'export' || tx.type === 'auto_deduct' || tx.type === 'transfer_out') {
        const result = await fifoDeduct({ warehouseId: tx.warehouseId, supplyId: item.supplyId, quantity: item.quantity })
        if (result.consumed.length) item.lotId = result.consumed[0].lotId
        supply.currentStock = Math.max(0, supply.currentStock - (item.quantity - (result.shortfall || 0)))
      } else if (tx.type === 'adjustment') {
        // Positive variance → create a lot; negative → FIFO deduct
        if (item.quantity > 0) {
          const lot = new InventoryLot({
            _id: rid('LOT'),
            supplyId: item.supplyId,
            warehouseId: tx.warehouseId,
            site: tx.site || '',
            lotNumber: item.lotNumber || `ADJ-${Date.now().toString().slice(-6)}`,
            expiryDate: item.expiryDate || '',
            importTransactionId: tx._id,
            importDate: today(),
            initialQuantity: item.quantity,
            currentQuantity: item.quantity,
            unitPrice: item.unitPrice || 0,
            status: 'available',
            createdAt: now(),
          })
          await lot.save()
          supply.currentStock += item.quantity
        } else if (item.quantity < 0) {
          await fifoDeduct({ warehouseId: tx.warehouseId, supplyId: item.supplyId, quantity: -item.quantity })
          supply.currentStock = Math.max(0, supply.currentStock + item.quantity)
        }
      }
      supply.updatedAt = now()
      await supply.save()
    }

    tx.status = 'confirmed'
    tx.confirmedBy = req.user.username
    tx.confirmedAt = now()
    tx.updatedAt = now()
    await tx.save()
    res.json(tx)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/transactions/:id/cancel', requireAuth, async (req, res) => {
  try {
    const tx = await InventoryTransaction.findById(req.params.id)
    if (!tx) return res.status(404).json({ error: 'Không tìm thấy phiếu' })
    if (tx.status !== 'draft') return res.status(400).json({ error: 'Chỉ hủy được phiếu nháp' })
    tx.status = 'cancelled'
    tx.updatedAt = now()
    await tx.save()
    res.json(tx)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  TRANSFERS  (linked pair: transfer_out at source + transfer_in at dest)
// ═══════════════════════════════════════════════════════════
router.post('/transfers', requireAuth, async (req, res) => {
  try {
    const { fromWarehouseId, toWarehouseId, items, notes } = req.body
    if (!fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId) {
      return res.status(400).json({ error: 'Chọn kho nguồn và kho đích khác nhau' })
    }
    if (!items || items.length === 0) return res.status(400).json({ error: 'Thiếu danh sách vật tư' })

    const accessible = await listAccessibleWarehouses(req.user)
    const from = accessible.find(w => w._id === fromWarehouseId)
    if (!from) return res.status(403).json({ error: 'Bạn không có quyền xuất từ kho này' })
    const to = await Warehouse.findById(toWarehouseId).lean()
    if (!to) return res.status(404).json({ error: 'Không tìm thấy kho đích' })

    const mapped = calcItemTotals(items)
    const transferId = `TRF-${Date.now().toString().slice(-8)}`

    const outTx = new InventoryTransaction({
      _id: rid('TX'),
      transactionNumber: await nextTxNumber('transfer_out'),
      type: 'transfer_out',
      warehouseId: from._id, warehouseName: from.name, warehouseCode: from.code, site: from.site || '',
      counterpartyWarehouseId: to._id, counterpartyWarehouseName: to.name,
      transferId,
      items: mapped,
      totalAmount: mapped.reduce((s, it) => s + it.amount, 0),
      notes: notes || '',
      status: 'draft',
      createdBy: req.user.username,
      createdAt: now(), updatedAt: now(),
    })
    const inTx = new InventoryTransaction({
      _id: rid('TX'),
      transactionNumber: await nextTxNumber('transfer_in'),
      type: 'transfer_in',
      warehouseId: to._id, warehouseName: to.name, warehouseCode: to.code, site: to.site || '',
      counterpartyWarehouseId: from._id, counterpartyWarehouseName: from.name,
      transferId,
      items: mapped,
      totalAmount: mapped.reduce((s, it) => s + it.amount, 0),
      notes: notes || '',
      status: 'draft',
      createdBy: req.user.username,
      createdAt: now(), updatedAt: now(),
    })
    await outTx.save(); await inTx.save()
    res.status(201).json({ transferId, outTx, inTx })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  STOCKTAKE SESSIONS
// ═══════════════════════════════════════════════════════════
router.get('/stocktakes', requireAuth, withWarehouseScope(), async (req, res) => {
  try {
    const { ids } = req.warehouseScope
    const filter = { warehouseId: { $in: ids } }
    if (req.query.status) filter.status = req.query.status
    const sessions = await StocktakeSession.find(filter).sort({ startedAt: -1 }).limit(50).lean()
    res.json(sessions)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/stocktakes/:id', requireAuth, async (req, res) => {
  try {
    const session = await StocktakeSession.findById(req.params.id).lean()
    if (!session) return res.status(404).json({ error: 'Không tìm thấy phiên kiểm kê' })
    const accessible = await listAccessibleWarehouses(req.user)
    if (!accessible.some(w => w._id === session.warehouseId)) {
      return res.status(403).json({ error: 'Bạn không có quyền xem phiên kiểm kê này' })
    }
    res.json(session)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /stocktakes — start a session, snapshot current system qty per supply
router.post('/stocktakes', requireAuth, async (req, res) => {
  try {
    const { warehouseId, name, scope, categoryId, notes } = req.body
    if (!warehouseId) return res.status(400).json({ error: 'Thiếu kho' })
    const accessible = await listAccessibleWarehouses(req.user)
    const wh = accessible.find(w => w._id === warehouseId)
    if (!wh) return res.status(403).json({ error: 'Bạn không có quyền kiểm kê kho này' })

    const supplyFilter = { status: 'active' }
    if (scope === 'category' && categoryId) supplyFilter.categoryId = categoryId
    const supplies = await Supply.find(supplyFilter).lean()

    const agg = await InventoryLot.aggregate([
      { $match: { warehouseId, status: 'available', currentQuantity: { $gt: 0 } } },
      { $group: { _id: '$supplyId', qty: { $sum: '$currentQuantity' } } },
    ])
    const onHand = {}
    agg.forEach(r => { onHand[r._id] = r.qty })

    const items = supplies.map(s => ({
      supplyId: s._id,
      supplyCode: s.code,
      supplyName: s.name,
      unit: s.unit,
      systemQty: onHand[s._id] || 0,
      actualQty: null,
      variance: 0,
    }))

    const yyyymm = today().slice(0, 7).replace('-', '')
    const count = await StocktakeSession.countDocuments({ sessionNumber: { $regex: `^KK-${yyyymm}` } })
    const session = new StocktakeSession({
      _id: rid('KK'),
      sessionNumber: `KK-${yyyymm}-${String(count + 1).padStart(3, '0')}`,
      warehouseId: wh._id,
      warehouseName: wh.name,
      name: name || `Kiểm kê ${today()}`,
      scope: scope || 'all',
      categoryId: categoryId || null,
      items,
      status: 'open',
      startedBy: req.user.username,
      startedAt: now(),
      notes: notes || '',
      updatedAt: now(),
    })
    await session.save()
    res.status(201).json(session)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /stocktakes/:id/counts — batch update counts
router.put('/stocktakes/:id/counts', requireAuth, async (req, res) => {
  try {
    const session = await StocktakeSession.findById(req.params.id)
    if (!session) return res.status(404).json({ error: 'Không tìm thấy phiên' })
    if (session.status !== 'open') return res.status(400).json({ error: 'Phiên đã nộp hoặc kết thúc' })

    const updates = req.body.updates || {}  // { supplyId: { actualQty, reasonCode, reasonText, notes } }
    let changed = 0
    session.items.forEach(it => {
      const u = updates[it.supplyId]
      if (!u) return
      if (typeof u.actualQty === 'number') {
        it.actualQty = u.actualQty
        it.variance = u.actualQty - it.systemQty
        it.countedAt = now()
        it.countedBy = req.user.username
      }
      if (u.reasonCode !== undefined) it.reasonCode = u.reasonCode
      if (u.reasonText !== undefined) it.reasonText = u.reasonText
      if (u.notes !== undefined) it.notes = u.notes
      changed++
    })
    session.updatedAt = now()
    await session.save()
    res.json({ session, changed })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /stocktakes/:id/submit — require reason for non-zero variances
router.put('/stocktakes/:id/submit', requireAuth, async (req, res) => {
  try {
    const session = await StocktakeSession.findById(req.params.id)
    if (!session) return res.status(404).json({ error: 'Không tìm thấy phiên' })
    if (session.status !== 'open') return res.status(400).json({ error: 'Phiên đã nộp' })

    const missing = session.items.filter(it => it.variance !== 0 && !it.reasonCode)
    if (missing.length) {
      return res.status(400).json({
        error: `Còn ${missing.length} vật tư chênh lệch chưa có lý do`,
        supplyIds: missing.map(m => m.supplyId),
      })
    }

    session.status = 'submitted'
    session.submittedBy = req.user.username
    session.submittedAt = now()
    session.updatedAt = now()
    await session.save()
    res.json(session)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /stocktakes/:id/approve — spawn adjustment transactions for each variance
router.put('/stocktakes/:id/approve', manageInventory, async (req, res) => {
  try {
    const session = await StocktakeSession.findById(req.params.id)
    if (!session) return res.status(404).json({ error: 'Không tìm thấy phiên' })
    if (session.status !== 'submitted') return res.status(400).json({ error: 'Chỉ duyệt được phiên đã nộp' })

    const wh = await Warehouse.findById(session.warehouseId).lean()
    if (!wh) return res.status(404).json({ error: 'Không tìm thấy kho' })

    const txIds = []
    for (const it of session.items) {
      if (!it.variance) continue
      const tx = new InventoryTransaction({
        _id: rid('TX'),
        transactionNumber: await nextTxNumber('adjustment'),
        type: 'adjustment',
        warehouseId: wh._id, warehouseName: wh.name, warehouseCode: wh.code, site: wh.site || '',
        items: [{
          supplyId: it.supplyId,
          supplyName: it.supplyName,
          supplyCode: it.supplyCode,
          unit: it.unit,
          quantity: it.variance,
          amount: 0,
        }],
        reasonCode: it.reasonCode || 'stocktake',
        reason: it.reasonText || `Kiểm kê ${session.sessionNumber}`,
        stocktakeSessionId: session._id,
        status: 'draft',
        createdBy: req.user.username,
        createdAt: now(), updatedAt: now(),
      })
      await tx.save()

      // Auto-confirm the adjustment so stock reflects it immediately
      const Supply_ = await Supply.findById(it.supplyId)
      if (Supply_) {
        if (it.variance > 0) {
          const lot = new InventoryLot({
            _id: rid('LOT'),
            supplyId: it.supplyId,
            warehouseId: wh._id,
            site: wh.site || '',
            lotNumber: `KK-${session.sessionNumber}`,
            expiryDate: '',
            importTransactionId: tx._id,
            importDate: today(),
            initialQuantity: it.variance,
            currentQuantity: it.variance,
            unitPrice: 0,
            status: 'available',
            createdAt: now(),
          })
          await lot.save()
          Supply_.currentStock += it.variance
        } else {
          await fifoDeduct({ warehouseId: wh._id, supplyId: it.supplyId, quantity: -it.variance })
          Supply_.currentStock = Math.max(0, Supply_.currentStock + it.variance)
        }
        Supply_.updatedAt = now()
        await Supply_.save()
      }

      tx.status = 'confirmed'
      tx.confirmedBy = req.user.username
      tx.confirmedAt = now()
      await tx.save()
      txIds.push(tx._id)
    }

    session.status = 'applied'
    session.approvedBy = req.user.username
    session.approvedAt = now()
    session.adjustmentTxIds = txIds
    session.updatedAt = now()
    await session.save()
    res.json({ session, adjustmentCount: txIds.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  LOTS
// ═══════════════════════════════════════════════════════════
router.get('/lots', requireAuth, withWarehouseScope(), async (req, res) => {
  try {
    const { ids } = req.warehouseScope
    const filter = { warehouseId: { $in: ids } }
    if (req.query.supplyId) filter.supplyId = req.query.supplyId
    if (req.query.status) filter.status = req.query.status
    const lots = await InventoryLot.find(filter).sort({ expiryDate: 1, createdAt: 1 }).lean()
    res.json(lots)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  REPORTS  (legacy; kept for back-compat, now warehouse-scoped)
// ═══════════════════════════════════════════════════════════

router.get('/reports/expiring', requireAuth, withWarehouseScope(), async (req, res) => {
  try {
    const { ids } = req.warehouseScope
    const days = +(req.query.days || 60)
    const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
    const lots = await InventoryLot.find({
      warehouseId: { $in: ids },
      status: 'available',
      currentQuantity: { $gt: 0 },
      expiryDate: { $ne: '', $lte: cutoff },
    }).sort({ expiryDate: 1 }).lean()
    res.json(lots)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Stock card (sổ kho) — per-supply ledger within a specific warehouse
router.get('/reports/card/:supplyId', requireAuth, withWarehouseScope(), async (req, res) => {
  try {
    const { ids } = req.warehouseScope
    const supply = await Supply.findById(req.params.supplyId).lean()
    if (!supply) return res.status(404).json({ error: 'Không tìm thấy vật tư' })

    const filter = { 'items.supplyId': req.params.supplyId, status: 'confirmed', warehouseId: { $in: ids } }
    if (req.query.dateFrom || req.query.dateTo) {
      filter.confirmedAt = {}
      if (req.query.dateFrom) filter.confirmedAt.$gte = req.query.dateFrom
      if (req.query.dateTo) filter.confirmedAt.$lte = req.query.dateTo + 'T23:59:59'
    }
    const txs = await InventoryTransaction.find(filter).sort({ confirmedAt: 1 }).lean()

    let balance = 0
    const entries = []
    for (const tx of txs) {
      for (const item of tx.items) {
        if (item.supplyId !== req.params.supplyId) continue
        const inflow = tx.type === 'import' || tx.type === 'transfer_in' || (tx.type === 'adjustment' && item.quantity > 0)
        const qty = inflow ? Math.abs(item.quantity) : -Math.abs(item.quantity)
        balance += qty
        entries.push({
          date: tx.confirmedAt?.slice(0, 10),
          transactionNumber: tx.transactionNumber,
          type: tx.type,
          inQty: qty > 0 ? qty : 0,
          outQty: qty < 0 ? Math.abs(qty) : 0,
          balance,
          unitPrice: item.unitPrice,
          note: tx.reason || tx.reasonCode || '',
        })
      }
    }

    // Current on-hand from lots
    const [agg] = await InventoryLot.aggregate([
      { $match: { warehouseId: { $in: ids }, supplyId: req.params.supplyId, status: 'available', currentQuantity: { $gt: 0 } } },
      { $group: { _id: null, qty: { $sum: '$currentQuantity' } } },
    ])
    res.json({ supply, entries, currentBalance: agg ? agg.qty : 0 })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Import/Export/Balance (xuất nhập tồn) per scope
router.get('/reports/balance', requireAuth, withWarehouseScope(), async (req, res) => {
  try {
    const { ids } = req.warehouseScope
    const supplies = await Supply.find({ status: 'active' }).lean()
    const filter = { status: 'confirmed', warehouseId: { $in: ids } }
    if (req.query.dateFrom || req.query.dateTo) {
      filter.confirmedAt = {}
      if (req.query.dateFrom) filter.confirmedAt.$gte = req.query.dateFrom
      if (req.query.dateTo) filter.confirmedAt.$lte = req.query.dateTo + 'T23:59:59'
    }
    const txs = await InventoryTransaction.find(filter).lean()

    const agg = await InventoryLot.aggregate([
      { $match: { warehouseId: { $in: ids }, status: 'available', currentQuantity: { $gt: 0 } } },
      { $group: { _id: '$supplyId', qty: { $sum: '$currentQuantity' } } },
    ])
    const onHand = {}
    agg.forEach(r => { onHand[r._id] = r.qty })

    const bySupply = {}
    for (const s of supplies) {
      bySupply[s._id] = { supplyId: s._id, code: s.code, name: s.name, unit: s.unit, currentStock: onHand[s._id] || 0, totalIn: 0, totalOut: 0, totalInAmount: 0, totalOutAmount: 0 }
    }
    for (const tx of txs) {
      for (const item of tx.items) {
        if (!bySupply[item.supplyId]) continue
        const inflow = tx.type === 'import' || tx.type === 'transfer_in' || (tx.type === 'adjustment' && item.quantity > 0)
        if (inflow) {
          bySupply[item.supplyId].totalIn += Math.abs(item.quantity)
          bySupply[item.supplyId].totalInAmount += item.amount || 0
        } else {
          bySupply[item.supplyId].totalOut += Math.abs(item.quantity)
          bySupply[item.supplyId].totalOutAmount += item.amount || 0
        }
      }
    }
    res.json(Object.values(bySupply).filter(s => s.totalIn > 0 || s.totalOut > 0 || s.currentStock > 0))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  WAREHOUSES
// ═══════════════════════════════════════════════════════════
router.get('/warehouses', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.status) filter.status = req.query.status
    if (req.query.site) filter.site = req.query.site
    const warehouses = await Warehouse.find(filter).sort({ name: 1 }).lean()
    res.json(warehouses)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/warehouses', manageInventory, async (req, res) => {
  try {
    const { code, name, site, region, address, manager, phone, description } = req.body
    if (!name) return res.status(400).json({ error: 'Tên kho là bắt buộc' })
    const wh = new Warehouse({
      _id: `WH-${Date.now()}`,
      code: code || `KHO-${Date.now().toString().slice(-6)}`,
      name, site: site || null, region: region || null, address, manager, phone, description,
      status: 'active', createdAt: now(), updatedAt: now(),
    })
    await wh.save()
    res.status(201).json(wh)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/warehouses/:id', manageInventory, async (req, res) => {
  try {
    const update = { ...req.body, updatedAt: now() }
    delete update._id
    const wh = await Warehouse.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!wh) return res.status(404).json({ error: 'Không tìm thấy kho' })
    res.json(wh)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  CANCEL REASONS  (reason-code picker backing store)
// ═══════════════════════════════════════════════════════════
router.get('/cancel-reasons', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.type) filter.type = req.query.type
    if (req.query.status) filter.status = req.query.status
    const reasons = await CancelReason.find(filter).sort({ name: 1 }).lean()
    res.json(reasons)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/cancel-reasons', manageInventory, async (req, res) => {
  try {
    const { code, name, type } = req.body
    if (!name) return res.status(400).json({ error: 'Tên lý do là bắt buộc' })
    const cr = new CancelReason({
      _id: `CR-${Date.now()}`,
      code: code || `LDH-${Date.now().toString().slice(-6)}`,
      name, type: type || 'export',
      status: 'active', createdAt: now(), updatedAt: now(),
    })
    await cr.save()
    res.status(201).json(cr)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/cancel-reasons/:id', manageInventory, async (req, res) => {
  try {
    const update = { ...req.body, updatedAt: now() }
    delete update._id
    const cr = await CancelReason.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!cr) return res.status(404).json({ error: 'Không tìm thấy lý do' })
    res.json(cr)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ═══════════════════════════════════════════════════════════
//  SUPPLY-SERVICE MAPPING (định mức)
// ═══════════════════════════════════════════════════════════
router.get('/his-mapping', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.serviceId) filter.serviceId = req.query.serviceId
    if (req.query.supplyId) filter.supplyId = req.query.supplyId
    const mappings = await SupplyServiceMapping.find(filter).sort({ serviceName: 1 }).lean()
    res.json(mappings)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/his-mapping', manageInventory, async (req, res) => {
  try {
    const { serviceId, serviceCode, serviceName, supplyId, supplyCode, supplyName, quantity, unit } = req.body
    if (!serviceId || !supplyId) return res.status(400).json({ error: 'Thiếu dịch vụ hoặc vật tư' })
    const existing = await SupplyServiceMapping.findOne({ serviceId, supplyId })
    if (existing) return res.status(400).json({ error: 'Mapping đã tồn tại' })
    const m = new SupplyServiceMapping({
      _id: `HSM-${Date.now()}`,
      serviceId, serviceCode, serviceName, supplyId, supplyCode, supplyName,
      quantity: quantity || 1, unit: unit || '',
      createdAt: now(), updatedAt: now(),
    })
    await m.save()
    res.status(201).json(m)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/his-mapping/:id', manageInventory, async (req, res) => {
  try {
    const update = { ...req.body, updatedAt: now() }
    delete update._id
    const m = await SupplyServiceMapping.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!m) return res.status(404).json({ error: 'Không tìm thấy mapping' })
    res.json(m)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/his-mapping/:id', manageInventory, async (req, res) => {
  try {
    await SupplyServiceMapping.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.fifoDeduct = fifoDeduct
router.calcItemTotals = calcItemTotals
router.nextTxNumber = nextTxNumber
module.exports = router
