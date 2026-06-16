const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/maec'

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err))

// Multi-document transactions require a replica set (Atlas prod is one) or a
// mongos. A bare local mongod is standalone and rejects transactions. Detect
// support once (cached) so withTxn can degrade to running without a session in
// dev — and so we NEVER run the callback twice.
let _supportsTxn = null
async function supportsTransactions() {
  if (_supportsTxn !== null) return _supportsTxn
  try {
    // Wait for the connection to be ready — otherwise an early call (e.g. the
    // first request right after boot, before connect() resolves) would read an
    // undefined connection.db, throw, and cache `false` forever.
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('connection not ready')), 15000)
        mongoose.connection.once('connected', () => { clearTimeout(t); resolve() })
        mongoose.connection.once('error', (e) => { clearTimeout(t); reject(e) })
      })
    }
    // Primary: replica-set / mongos handshake.
    try {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 })
      if (hello.setName || hello.msg === 'isdbgrid') { _supportsTxn = true; return true }
    } catch { /* fall through to the probe */ }
    // Fallback: probe a trivial no-op transaction (safe — runs no user code).
    // On a standalone mongod this throws the replica-set error → false.
    const s = await mongoose.connection.startSession()
    try {
      await s.withTransaction(async () => {
        await mongoose.connection.db.collection('counters').findOne({ _id: '__txn_probe__' }, { session: s })
      })
      _supportsTxn = true
    } catch {
      _supportsTxn = false
    } finally {
      await s.endSession()
    }
  } catch {
    _supportsTxn = false
  }
  return _supportsTxn
}

// Run `fn(session)` inside a multi-document transaction when supported, else run
// `fn(undefined)` with no session (dev/standalone). On a replica set,
// session.withTransaction auto-retries transient conflicts (e.g. two cashiers
// settling the same encounter) — so `fn` MUST re-read its documents *inside* the
// callback (with the session) so each retry sees committed state. All writes in
// `fn` must pass { session } or they won't be part of the transaction.
async function withTxn(fn) {
  if (!(await supportsTransactions())) return fn(undefined)
  const session = await mongoose.connection.startSession()
  try {
    let result
    await session.withTransaction(async () => { result = await fn(session) })
    return result
  } finally {
    await session.endSession()
  }
}

module.exports = mongoose
module.exports.withTxn = withTxn
module.exports.supportsTransactions = supportsTransactions
