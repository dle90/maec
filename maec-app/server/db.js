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
    const hello = await mongoose.connection.db.admin().command({ hello: 1 })
    _supportsTxn = !!(hello.setName || hello.msg === 'isdbgrid') // replica set or mongos
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
