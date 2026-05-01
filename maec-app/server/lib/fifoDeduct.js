const InventoryLot = require('../models/InventoryLot')

// FIFO deduct a quantity of a supply from a specific warehouse.
// Returns { satisfied, shortfall, consumed: [{ lotId, lotNumber, quantity, expiryDate }] }.
// Soft-fail: deducts what's available; caller decides whether to roll back or fail.
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

// Read-only stock check: how many units available across lots, and the FIFO
// plan (which lots would be consumed) — without mutating anything.
async function stockCheck({ warehouseId, supplyId, quantity }) {
  let remaining = quantity
  const plan = []
  const lots = await InventoryLot.find({
    warehouseId, supplyId, status: 'available', currentQuantity: { $gt: 0 },
  }).sort({ expiryDate: 1, createdAt: 1 }).lean()
  for (const lot of lots) {
    if (remaining <= 0) break
    const take = Math.min(lot.currentQuantity, remaining)
    plan.push({ lotId: lot._id, lotNumber: lot.lotNumber, quantity: take, expiryDate: lot.expiryDate })
    remaining -= take
  }
  const totalAvailable = lots.reduce((s, l) => s + l.currentQuantity, 0)
  return { satisfied: remaining <= 0, shortfall: Math.max(0, remaining), plan, totalAvailable }
}

module.exports = { fifoDeduct, stockCheck }
