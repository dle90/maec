// Sprint C smoke:
//  1. POST /encounters idempotency: 2 quick consecutive POSTs return same encId
//  2. bill-items DELETE by stable _id
//  3. Stocktake productKind narrows item count
//  4. Date helpers: localDate matches Asia/HCM regardless of host TZ
//
// _TESTSC_* prefix; cleans up at the end.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const mongoose = require('mongoose')
const Patient = require('../models/Patient')
const Encounter = require('../models/Encounter')
const StocktakeSession = require('../models/StocktakeSession')
const Warehouse = require('../models/Warehouse')
const { localDate, localDayStartUtcZ, addDaysLocal } = require('../lib/dates')

const ROOT = 'http://localhost:3001'
const PFX = '_TESTSC_'

async function login() {
  const r = await fetch(ROOT + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'maec2026' }),
  })
  return (await r.json()).token
}
async function api(method, path, token, body) {
  const r = await fetch(ROOT + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data; try { data = JSON.parse(await r.text()) } catch { data = null }
  return { status: r.status, data }
}
const now = () => new Date().toISOString()
function assert(c, m) { if (!c) { console.error('✗', m); process.exit(1) } }

;(async () => {
  await mongoose.connect(process.env.MONGODB_URI)
  const token = await login()

  // ───── Setup: 1 patient
  const pid = `${PFX}P${Date.now()}`
  await new Patient({
    _id: pid, patientId: pid, name: PFX + 'BN sprint C',
    phone: '0900000099', dob: '1990-01-01', gender: 'M',
    registeredSite: 'Trung Kính', createdAt: now(), updatedAt: now(),
  }).save()

  // ───── 1. Idempotency: POST /encounters twice → same encId
  console.log('[1] POST /encounters idempotency')
  const r1 = await api('POST', '/api/encounters', token, { patientId: pid, patientName: PFX + 'BN sprint C', site: 'Trung Kính' })
  assert(r1.status === 201, 'first POST should 201, got ' + r1.status)
  const encId = r1.data._id
  console.log(`  ✓ first POST created ${encId}`)
  const r2 = await api('POST', '/api/encounters', token, { patientId: pid, patientName: PFX + 'BN sprint C', site: 'Trung Kính' })
  assert(r2.status === 200, 'second POST should 200, got ' + r2.status)
  assert(r2.data._id === encId, `second POST should return same encId, got ${r2.data._id}`)
  assert(r2.data._existing === true, 'second POST should mark _existing')
  console.log(`  ✓ second POST returned existing encId (no duplicate)`)

  // ───── 2. bill-items stable _id deletion
  console.log('\n[2] bill-items stable _id')
  await api('POST', `/api/encounters/${encId}/bill-items`, token, { kind: 'service', code: 'TEST-1', name: PFX + 'item 1', qty: 1, unitPrice: 50000 })
  await api('POST', `/api/encounters/${encId}/bill-items`, token, { kind: 'service', code: 'TEST-2', name: PFX + 'item 2', qty: 1, unitPrice: 80000 })
  let g = await api('GET', `/api/encounters/${encId}`, token)
  assert(g.data.billItems.length === 2, `expected 2 bill items, got ${g.data.billItems.length}`)
  // Each subdoc has an _id (Mongoose default)
  const item1Id = g.data.billItems[0]._id
  const item2Id = g.data.billItems[1]._id
  assert(item1Id && item2Id, `bill items should have _id, got ${item1Id} / ${item2Id}`)
  console.log(`  ✓ both items have stable _id (${item1Id.slice(-6)}, ${item2Id.slice(-6)})`)
  // Delete item2 by _id (NOT array index 1)
  const d = await api('DELETE', `/api/encounters/${encId}/bill-items/${item2Id}`, token)
  assert(d.status === 200, 'delete by _id failed: ' + JSON.stringify(d))
  g = await api('GET', `/api/encounters/${encId}`, token)
  assert(g.data.billItems.length === 1, `expected 1 left, got ${g.data.billItems.length}`)
  assert(g.data.billItems[0]._id === item1Id, 'wrong item left after delete')
  console.log(`  ✓ delete by _id removed correct item`)

  // ───── 3. Stocktake productKind narrowing
  console.log('\n[3] Stocktake productKind narrowing')
  const wh = (await Warehouse.findOne({ status: 'active' }).lean())
  if (!wh) throw new Error('No active warehouse')
  // Create 'all' first to get a baseline count
  const all = await api('POST', '/api/inventory/stocktakes', token, { warehouseId: wh._id, name: PFX + 'all', scope: 'all' })
  const allCount = all.data.items.length
  console.log(`  baseline (all): ${allCount} items`)
  // Create kinh-only
  const kinh = await api('POST', '/api/inventory/stocktakes', token, { warehouseId: wh._id, name: PFX + 'kinh', productKind: 'kinh' })
  const kinhCount = kinh.data.items.length
  console.log(`  productKind=kinh: ${kinhCount} items`)
  assert(kinhCount > 0 && kinhCount < allCount, `kinh should be a proper subset, got ${kinhCount} vs ${allCount}`)
  console.log(`  ✓ productKind narrows correctly`)
  // Cleanup the 2 sessions we just created
  await StocktakeSession.deleteOne({ _id: all.data._id })
  await StocktakeSession.deleteOne({ _id: kinh.data._id })

  // ───── 4. Date helpers
  console.log('\n[4] Date helpers')
  const today = localDate()
  console.log(`  today (HCM): ${today}`)
  // The UTC start of today should be 17:00 UTC of yesterday (HCM = UTC+7)
  const startUtc = localDayStartUtcZ(today)
  console.log(`  HCM-day-start as UTC ISO: ${startUtc}`)
  // Verify: parsing it back should give midnight HCM
  const back = new Date(startUtc).toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
  assert(back.startsWith(today + ' 00:00'), `roundtrip mismatch: ${back}`)
  console.log(`  ✓ roundtrip: ${back}`)
  const tomorrow = addDaysLocal(today, 1)
  console.log(`  tomorrow: ${tomorrow}`)

  // ───── Cleanup
  console.log('\nCleanup...')
  await Encounter.deleteOne({ _id: encId })
  await Patient.deleteOne({ _id: pid })

  console.log('\nAll Sprint C assertions passed.')
  await mongoose.disconnect()
})().catch(err => { console.error('FAIL:', err); process.exit(1) })
