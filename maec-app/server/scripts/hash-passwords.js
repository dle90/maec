/**
 * Phase 0 — hash any plaintext user passwords at rest.
 *
 * Login already lazily re-hashes plaintext on first successful sign-in, so this
 * is belt-and-suspenders for accounts that don't log in often. It re-hashes the
 * stored value in place (the password the user knows is unchanged — only its
 * storage becomes a bcrypt hash), so it is safe + idempotent: already-hashed
 * passwords ($2a/$2b/$2y…) are skipped.
 *
 * Run (DRY-RUN, just reports):  railway ssh "node maec-app/server/scripts/hash-passwords.js"
 * Run (APPLY, writes hashes):   railway ssh "node maec-app/server/scripts/hash-passwords.js --apply"
 */
require('../db')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const User = require('../models/User')

const APPLY = process.argv.includes('--apply')
const ROUNDS = 10
const isHashed = (s) => typeof s === 'string' && /^\$2[aby]\$/.test(s)

async function run() {
  console.log(`\n=== hash-passwords  (${APPLY ? 'APPLY — will write' : 'DRY-RUN — no writes'}) ===`)
  const users = await User.find({}).select('_id password').lean()
  const plaintext = users.filter(u => u.password && !isHashed(u.password))
  const already = users.length - plaintext.length

  console.log(`\nUsers: ${users.length}  |  already hashed: ${already}  |  plaintext to hash: ${plaintext.length}`)
  plaintext.slice(0, 20).forEach(u => console.log(`   ${u._id}`))

  if (!APPLY) {
    console.log('\nDRY-RUN only. Re-run with --apply to hash the above.')
    await mongoose.disconnect(); return
  }

  let done = 0
  for (const u of plaintext) {
    const hash = await bcrypt.hash(u.password, ROUNDS)
    await User.updateOne({ _id: u._id }, { $set: { password: hash } })
    done++
  }
  console.log(`\nHashed ${done} password(s).`)
  await mongoose.disconnect()
}

run().catch(e => { console.error(e); process.exit(1) })
