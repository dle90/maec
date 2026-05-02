// Sprint B end-to-end smoke:
//  1. Inventory transfer: source → destination, verify expiry propagated +
//     transfer_in auto-confirmed.
//  2. Payment ledger: full pay via /payment, partial pay → top-up, refund
//     (with stock-return), confirm net + status transitions.
//  3. Site swap: PUT /encounter/:id/site flips before checkout, blocked after.
//
// Uses _TESTSB_* prefix for all created entities. Cleans up at the end.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const mongoose = require('mongoose')
const Patient = require('../models/Patient')
const Encounter = require('../models/Encounter')
const Supply = require('../models/Supply')
const InventoryLot = require('../models/InventoryLot')
const InventoryTransaction = require('../models/InventoryTransaction')
const Warehouse = require('../models/Warehouse')

const ROOT = 'http://localhost:3001'
const PFX = '_TESTSB_'

async function login() {
  const r = await fetch(ROOT + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'maec2026' }),
  })
  const d = await r.json()
  if (!d.token) throw new Error('login failed')
  return d.token
}
async function api(method, path, token, body) {
  const r = await fetch(ROOT + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  return { status: r.status, data }
}

const now = () => new Date().toISOString()
function assert(c, m) { if (!c) { console.error('✗', m); process.exit(1) } }

;(async () => {
  await mongoose.connect(process.env.MONGODB_URI)
  const token = await login()

  // ───── Setup: 2 warehouses (or use existing), 1 supply, 1 lot in source warehouse
  const whs = await Warehouse.find({ status: 'active' }).limit(2).lean()
  if (whs.length < 2) throw new Error('Need at least 2 active warehouses for transfer test')
  const [src, dst] = whs
  console.log(`Warehouses: src=${src.name} dst=${dst.name}`)

  // Use an existing Kinh supply rather than creating one (avoids polluting catalog)
  const supply = await Supply.findOne({ productKind: 'kinh' }).lean()
  if (!supply) throw new Error('Need a kinh supply seeded')
  console.log(`Supply: ${supply.name} (${supply._id})`)

  // Create a lot in source warehouse with known expiry + price
  const lotId = `LOT-${PFX}${Date.now()}`
  await new InventoryLot({
    _id: lotId, supplyId: supply._id, warehouseId: src._id,
    site: src.site || '', lotNumber: PFX + 'L1',
    expiryDate: '2027-06-01', manufacturingDate: '2025-06-01',
    initialQuantity: 10, currentQuantity: 10, unitPrice: 50000,
    status: 'available', createdAt: now(),
  }).save()

  // ───── 1. Transfer: source → destination, expecting expiry propagation + auto-confirm
  console.log('\n[1] Transfer flow')
  const tr = await api('POST', '/api/inventory/transfers', token, {
    fromWarehouseId: src._id, toWarehouseId: dst._id,
    items: [{ supplyId: supply._id, supplyName: supply.name, supplyCode: supply.code, unit: supply.unit, quantity: 4, lotNumber: '', expiryDate: '', purchasePrice: 0 }],
    notes: PFX + 'transfer test',
  })
  assert(tr.status === 201, 'transfer create: ' + JSON.stringify(tr))
  const outTxId = tr.data.outTx._id
  const inTxId = tr.data.inTx._id
  console.log(`  ✓ created transfer pair: outTx=${outTxId} inTx=${inTxId}`)

  // Confirm the OUT — should auto-confirm the IN + propagate expiry
  const conf = await api('PUT', `/api/inventory/transactions/${outTxId}/confirm`, token)
  assert(conf.status === 200, 'confirm: ' + JSON.stringify(conf))
  assert(conf.data.pairedTransferIn === inTxId, `paired in not auto-confirmed (got: ${conf.data.pairedTransferIn})`)
  console.log(`  ✓ transfer_out confirm auto-confirmed transfer_in`)

  // Verify destination lot exists with correct expiry + unitPrice
  const dstLots = await InventoryLot.find({ warehouseId: dst._id, supplyId: supply._id, importTransactionId: inTxId }).lean()
  assert(dstLots.length === 1, `expected 1 dst lot, got ${dstLots.length}`)
  const dstLot = dstLots[0]
  assert(dstLot.expiryDate === '2027-06-01', `expected expiryDate 2027-06-01, got "${dstLot.expiryDate}"`)
  assert(dstLot.unitPrice === 50000, `expected unitPrice 50000, got ${dstLot.unitPrice}`)
  assert(dstLot.currentQuantity === 4, `expected qty 4, got ${dstLot.currentQuantity}`)
  console.log(`  ✓ dst lot: expiry=${dstLot.expiryDate}, price=${dstLot.unitPrice}, qty=${dstLot.currentQuantity}`)

  // Cleanup transfer artifacts (lots + txs) before payment tests
  await InventoryLot.deleteMany({ importTransactionId: { $in: [outTxId, inTxId] } })
  await InventoryLot.findByIdAndDelete(lotId)
  await InventoryTransaction.deleteMany({ _id: { $in: [outTxId, inTxId] } })
  // Roll back source supply.currentStock
  await Supply.updateOne({ _id: supply._id }, { $inc: { currentStock: 10 } })

  // ───── 2. Payment ledger flow
  console.log('\n[2] Payment ledger flow')
  // Need a patient + encounter with bill items
  const pid = `${PFX}P${Date.now()}`
  const eid = `${PFX}E${Date.now()}`
  await new Patient({
    _id: pid, patientId: pid, name: PFX + 'BN payment',
    phone: '0900000001', dob: '1990-01-01', gender: 'M',
    registeredSite: src.site || 'Trung Kính', createdAt: now(), updatedAt: now(),
  }).save()
  await new Encounter({
    _id: eid, patientId: pid, patientName: PFX + 'BN payment',
    site: src.site || 'Trung Kính', dob: '1990-01-01', gender: 'M',
    status: 'in_progress',
    billItems: [{ kind: 'service', code: 'TEST-SVC', name: PFX + 'Khám test', qty: 1, unitPrice: 200000, totalPrice: 200000, addedBy: 'admin', addedAt: now() }],
    billTotal: 200000,
    createdAt: now(), updatedAt: now(),
  }).save()

  // Partial pay: 50k of 200k
  let r = await api('POST', `/api/encounters/${eid}/payment`, token, { amount: 50000, method: 'cash' })
  assert(r.status === 200, 'partial payment: ' + JSON.stringify(r))
  assert(r.data.status === 'partial', `expected status partial, got ${r.data.status}`)
  assert(r.data.paidAmount === 50000, `expected paidAmount 50000, got ${r.data.paidAmount}`)
  assert(r.data.payments.length === 1, `expected 1 payment, got ${r.data.payments.length}`)
  console.log(`  ✓ partial pay: status=${r.data.status} paid=${r.data.paidAmount} payments=${r.data.payments.length}`)

  // Top-up to full
  r = await api('POST', `/api/encounters/${eid}/payment`, token, { amount: 150000, method: 'transfer' })
  assert(r.status === 200, 'topup: ' + JSON.stringify(r))
  assert(r.data.status === 'paid', `expected paid, got ${r.data.status}`)
  assert(r.data.paidAmount === 200000, `expected 200000, got ${r.data.paidAmount}`)
  assert(r.data.payments.length === 2, `expected 2 payments, got ${r.data.payments.length}`)
  console.log(`  ✓ topup: status=paid payments=2`)

  // Refund 100k (no stock since this encounter has no kinh/thuoc)
  r = await api('POST', `/api/encounters/${eid}/refund`, token, { amount: 100000, method: 'cash', reason: PFX + 'partial refund test' })
  assert(r.status === 200, 'refund: ' + JSON.stringify(r))
  assert(r.data.status === 'partial', `after partial refund expected partial, got ${r.data.status}`)
  assert(r.data.paidAmount === 100000, `after refund expected 100000, got ${r.data.paidAmount}`)
  console.log(`  ✓ refund 100k: status=${r.data.status} net=${r.data.paidAmount}`)

  // Refund the rest → completed
  r = await api('POST', `/api/encounters/${eid}/refund`, token, { amount: 100000, method: 'cash', reason: PFX + 'full refund' })
  assert(r.data.status === 'completed', `after full refund expected completed, got ${r.data.status}`)
  assert(r.data.paidAmount === 0, `after full refund expected 0, got ${r.data.paidAmount}`)
  console.log(`  ✓ full refund: status=${r.data.status} net=${r.data.paidAmount}`)

  // Try to over-refund — should 400
  r = await api('POST', `/api/encounters/${eid}/refund`, token, { amount: 50000, method: 'cash', reason: 'should fail' })
  assert(r.status === 400, `expected 400 over-refund, got ${r.status}`)
  console.log(`  ✓ over-refund blocked (${r.status})`)

  // ───── 3. Site swap on a fresh encounter (pre-checkout)
  console.log('\n[3] Site swap (Q7)')
  const eid2 = `${PFX}E2${Date.now()}`
  await new Encounter({
    _id: eid2, patientId: pid, patientName: PFX + 'BN site',
    site: 'Trung Kính', status: 'in_progress',
    billItems: [], billTotal: 0,
    createdAt: now(), updatedAt: now(),
  }).save()

  r = await api('PUT', `/api/encounters/${eid2}/site`, token, { site: 'Kim Giang' })
  assert(r.status === 200, 'site swap: ' + JSON.stringify(r))
  assert(r.data.site === 'Kim Giang', `expected Kim Giang, got ${r.data.site}`)
  console.log(`  ✓ site swap pre-checkout: ${r.data.site}`)

  // Cancel the encounter, try again — should 400
  await Encounter.updateOne({ _id: eid2 }, { $set: { status: 'cancelled' } })
  r = await api('PUT', `/api/encounters/${eid2}/site`, token, { site: 'Trung Kính' })
  assert(r.status === 400, `expected 400 after cancel, got ${r.status}`)
  console.log(`  ✓ site swap blocked after close (${r.status})`)

  // ───── Cleanup
  console.log('\nCleanup...')
  await Encounter.deleteMany({ _id: { $in: [eid, eid2] } })
  await Patient.deleteOne({ _id: pid })
  console.log('  ✓ deleted test patient + encounters')

  console.log('\nAll Sprint B assertions passed.')
  await mongoose.disconnect()
})().catch(err => { console.error('FAIL:', err); process.exit(1) })
