/**
 * Phase 1 Unit 5 — prove the atomic FIFO decrement has no oversell race.
 *
 * Seeds 5 units of a throwaway _TESTBE_ supply across 2 lots, then fires 8
 * concurrent single-unit deducts. With the old read-modify-write (lot.save())
 * concurrent decrements lost updates and could drive stock negative / oversell.
 * With the conditional $gte update, exactly 5 deducts succeed, total consumed
 * is exactly 5, no lot goes below 0. Cleans up only its own seeded docs.
 *
 * Run:  railway ssh "node maec-app/server/scripts/smoke-fifo-concurrent.js"
 */
require('../db')
const mongoose = require('mongoose')
const InventoryLot = require('../models/InventoryLot')
const { fifoDeduct } = require('../lib/fifoDeduct')

const WH = '_TESTBE_wh'
const SUP = '_TESTBE_sup'

async function run() {
  await InventoryLot.deleteMany({ supplyId: SUP }) // clean any prior run
  const iso = new Date().toISOString()
  await InventoryLot.create([
    { _id: '_TESTBE_lot1', supplyId: SUP, warehouseId: WH, status: 'available', initialQuantity: 3, currentQuantity: 3, expiryDate: '2030-01-01', createdAt: iso },
    { _id: '_TESTBE_lot2', supplyId: SUP, warehouseId: WH, status: 'available', initialQuantity: 2, currentQuantity: 2, expiryDate: '2030-06-01', createdAt: iso },
  ])

  const results = await Promise.all(
    Array.from({ length: 8 }, () => fifoDeduct({ warehouseId: WH, supplyId: SUP, quantity: 1 }))
  )
  const totalConsumed = results.reduce((s, r) => s + r.consumed.reduce((a, c) => a + c.quantity, 0), 0)
  const satisfied = results.filter(r => r.satisfied).length
  const lots = await InventoryLot.find({ supplyId: SUP }).lean()
  const minQty = Math.min(...lots.map(l => l.currentQuantity))
  const remaining = lots.reduce((s, l) => s + l.currentQuantity, 0)
  const ok = totalConsumed === 5 && minQty >= 0 && remaining === 0 && satisfied === 5

  console.log(`smoke-fifo-concurrent: 8×deduct(1) on 5 stock → consumed=${totalConsumed} satisfied=${satisfied}/8 minLotQty=${minQty} remaining=${remaining} → ${ok ? 'PASS (no oversell)' : 'FAIL'}`)

  await InventoryLot.deleteMany({ supplyId: SUP }) // cleanup
  await mongoose.disconnect()
  if (!ok) process.exit(1)
}
run().catch(e => { console.error(e); process.exit(1) })
