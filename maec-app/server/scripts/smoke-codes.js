/**
 * Phase 1 Unit 2 — prove the wired code generators are atomic + correctly
 * formatted. Calls each format helper concurrently with a SYNTHETIC future date
 * (so real per-day/per-month counters are untouched) and asserts the outputs are
 * all distinct and match the exact legacy format. Cleans up its synthetic
 * Counter docs.
 *
 * Run:  railway ssh "node maec-app/server/scripts/smoke-codes.js"
 */
require('../db')
const mongoose = require('mongoose')
const Counter = require('../models/Counter')
const { nextInvoiceCode, nextTxCode, nextStocktakeCode, nextPatientCode } = require('../lib/counters')

const D = '29991231'
const M = '299912'

async function batch(label, fn, re, N = 20) {
  const out = await Promise.all(Array.from({ length: N }, () => fn()))
  const distinct = new Set(out).size === N
  const formatOk = out.every(c => re.test(c))
  const ok = distinct && formatOk
  console.log(`${label.padEnd(10)} ${N} concurrent → distinct=${distinct} formatOk=${formatOk}  e.g. ${out[0]}  ${ok ? 'PASS' : 'FAIL'}`)
  return ok
}

async function run() {
  console.log('\n=== smoke-codes (synthetic date 2999-12-31) ===')
  const results = [
    await batch('invoice', () => nextInvoiceCode(D), /^HD-29991231-\d{4}$/),
    await batch('tx(NK)', () => nextTxCode('NK', D), /^NK-29991231-\d{3}$/),
    await batch('stocktake', () => nextStocktakeCode(M), /^KK-299912-\d{3}$/),
    await batch('patient', () => nextPatientCode(D), /^BN-29991231-\d{4}$/),
  ]
  await Counter.deleteMany({ _id: { $in: [`invoice:${D}`, `tx:NK:${D}`, `stocktake:${M}`, `patient:${D}`] } })
  const ok = results.every(Boolean)
  console.log(`\n${ok ? 'PASS — all generators atomic + correct format' : 'FAIL'}`)
  await mongoose.disconnect()
  if (!ok) process.exit(1)
}
run().catch(e => { console.error(e); process.exit(1) })
