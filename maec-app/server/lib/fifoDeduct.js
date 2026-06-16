const InventoryLot = require('../models/InventoryLot')

// FIFO deduct a quantity of a supply from a specific warehouse.
// Returns { satisfied, shortfall, consumed: [{ lotId, lotNumber, quantity,
//   expiryDate, manufacturingDate, unitPrice }] }.
// Soft-fail: deducts what's available; caller decides whether to roll back or fail.
//
// Each lot is decremented with an ATOMIC conditional update (currentQuantity
// $gte take), so two concurrent deducts can never oversell or drive a lot
// negative: if a lot is emptied out from under us between read and write, the
// guarded update matches 0 docs and we re-fetch the next FIFO lot. Pass
// { session } to enlist the reads + writes in a transaction.
async function fifoDeduct({ warehouseId, supplyId, quantity }, { session } = {}) {
  let remaining = Number(quantity) || 0
  const consumed = []
  let guard = 0
  while (remaining > 0) {
    if (++guard > 100000) break // pathological safety stop
    const lot = await InventoryLot.findOne(
      { warehouseId, supplyId, status: 'available', currentQuantity: { $gt: 0 } },
      null,
      { session, sort: { expiryDate: 1, createdAt: 1 } }
    )
    if (!lot) break // no more available stock
    const take = Math.min(lot.currentQuantity, remaining)
    // Atomic claim — only lands if the lot still has >= take when the write
    // executes. Pipeline update so status flips to 'depleted' at exactly zero.
    const upd = await InventoryLot.updateOne(
      { _id: lot._id, currentQuantity: { $gte: take } },
      [
        { $set: { currentQuantity: { $subtract: ['$currentQuantity', take] } } },
        { $set: { status: { $cond: [{ $lte: ['$currentQuantity', 0] }, 'depleted', '$status'] } } },
      ],
      { session, updatePipeline: true } // Mongoose 9 requires opt-in for pipeline updates
    )
    if (upd.modifiedCount === 0) continue // lost the race — re-fetch FIFO
    consumed.push({
      lotId: lot._id, lotNumber: lot.lotNumber, quantity: take,
      expiryDate: lot.expiryDate, manufacturingDate: lot.manufacturingDate || '',
      unitPrice: lot.unitPrice || 0,
    })
    remaining -= take
  }
  return { satisfied: remaining <= 0, shortfall: Math.max(0, remaining), consumed }
}

// Read-only stock check: how many units available across lots, and the FIFO
// plan (which lots would be consumed) — without mutating anything.
async function stockCheck({ warehouseId, supplyId, quantity }, { session } = {}) {
  let remaining = Number(quantity) || 0
  const plan = []
  const lots = await InventoryLot.find(
    { warehouseId, supplyId, status: 'available', currentQuantity: { $gt: 0 } },
    null,
    { session, sort: { expiryDate: 1, createdAt: 1 } }
  ).lean()
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
