/**
 * Phase 1 — prove the atomic Counter has no race.
 *
 * Fires N concurrent nextSeq() on one key and asserts all N returned values are
 * distinct (1..N). With countDocuments()+1 this would collide; with the atomic
 * findOneAndUpdate($inc) it cannot. Creates + deletes a throwaway "smoke:test"
 * counter doc only.
 *
 * Run:  railway ssh "node maec-app/server/scripts/smoke-counter.js"
 */
require('../db')
const mongoose = require('mongoose')
const Counter = require('../models/Counter')
const { nextSeq } = require('../lib/counters')

async function run() {
  const KEY = 'smoke:test'
  await Counter.deleteOne({ _id: KEY })
  const N = 50
  const results = await Promise.all(Array.from({ length: N }, () => nextSeq(KEY)))
  const distinct = new Set(results)
  const ok = distinct.size === N && Math.min(...results) === 1 && Math.max(...results) === N
  console.log(`smoke-counter: ${N} concurrent nextSeq → ${distinct.size} distinct, range ${Math.min(...results)}..${Math.max(...results)} → ${ok ? 'PASS (atomic)' : 'FAIL (collision!)'}`)
  await Counter.deleteOne({ _id: KEY })
  await mongoose.disconnect()
  if (!ok) process.exit(1)
}
run().catch(e => { console.error(e); process.exit(1) })
