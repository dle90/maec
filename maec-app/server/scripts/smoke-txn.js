/**
 * Phase 1 Unit 6 — prove the withTxn primitive on prod (Atlas replica set):
 *   1. ROLLBACK: a write inside withTxn that then throws does NOT persist.
 *   2. COMMIT:   a write inside withTxn with no throw DOES persist.
 *   3. CONCURRENT CLAIM: two concurrent withTxn that each "act only if not yet
 *      acted" → exactly ONE acts (MongoDB write-conflict detection + auto-retry
 *      re-reads committed state). This is the same mechanism that stops two
 *      racing first-payments from both deducting stock.
 *
 * Uses only a throwaway _TESTBE_txn Counter doc; self-cleans.
 * Run:  railway ssh "node maec-app/server/scripts/smoke-txn.js"
 */
const mongoose = require('../db')
const { withTxn, supportsTransactions } = mongoose
const Counter = require('../models/Counter')

const KEY = '_TESTBE_txn'

async function run() {
  const txnSupported = await supportsTransactions()
  console.log('supportsTransactions:', txnSupported)

  // 1) rollback
  await Counter.deleteOne({ _id: KEY })
  let threw = false
  try {
    await withTxn(async (session) => {
      await Counter.create([{ _id: KEY, seq: 99 }], { session })
      throw new Error('boom')
    })
  } catch (e) { threw = e.message === 'boom' }
  const afterRollback = await Counter.findById(KEY).lean()
  const rollbackOk = threw && !afterRollback

  // 2) commit (delete first so a failed rollback above doesn't crash this step)
  await Counter.deleteOne({ _id: KEY })
  await withTxn(async (session) => { await Counter.create([{ _id: KEY, seq: 7 }], { session }) })
  const afterCommit = await Counter.findById(KEY).lean()
  const commitOk = !!afterCommit && afterCommit.seq === 7

  // 3) concurrent claim — act only if seq===0; expect exactly one actor, final seq===1
  await Counter.deleteOne({ _id: KEY })
  await Counter.create({ _id: KEY, seq: 0 })
  const claimOnce = async (session) => {
    const c = await Counter.findById(KEY, null, { session })
    if (c.seq === 0) { c.seq = 1; await c.save({ session }); return true }
    return false
  }
  const results = await Promise.all([withTxn(claimOnce), withTxn(claimOnce)])
  const actedCount = results.filter(Boolean).length
  const finalDoc = await Counter.findById(KEY).lean()
  const claimOk = actedCount === 1 && finalDoc && finalDoc.seq === 1

  const ok = rollbackOk && commitOk && (txnSupported ? claimOk : true)
  console.log(`smoke-txn: rollback=${rollbackOk} commit=${commitOk} concurrentClaim(acted=${actedCount},seq=${finalDoc?.seq})=${claimOk} → ${ok ? 'PASS' : 'FAIL'}`)

  await Counter.deleteOne({ _id: KEY })
  await mongoose.disconnect()
  if (!ok) process.exit(1)
}
run().catch(e => { console.error(e); process.exit(1) })
