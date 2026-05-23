// Quick R2 roundtrip: put a tiny object, presign-GET it, fetch it, delete it.
// Run with `node scripts/smoke-r2.js` (reads .env via dotenv from server root)
// or `railway run --service maec node scripts/smoke-r2.js` to probe prod creds.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const r2 = require('../lib/r2')

;(async () => {
  if (!r2.isConfigured()) {
    console.error('FAIL — R2 env vars not set. Need R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET.')
    process.exit(1)
  }
  console.log('R2 configured. Bucket:', process.env.R2_BUCKET)

  const key = `smoke/${Date.now()}-r2-smoke.txt`
  const body = `hello from maec smoke test at ${new Date().toISOString()}`

  try {
    console.log('PUT  ->', key)
    await r2.putObject(key, Buffer.from(body), 'text/plain')

    console.log('SIGN ->', key)
    const url = await r2.presignGet(key, { filename: 'r2-smoke.txt', contentType: 'text/plain', inline: true })
    console.log('     ', url.slice(0, 80) + '...')

    console.log('GET  -> (via presigned URL)')
    const res = await fetch(url)
    const text = await res.text()
    if (text !== body) throw new Error(`body mismatch: got "${text}", expected "${body}"`)
    console.log('     OK (matched body)')

    console.log('DEL  ->', key)
    await r2.deleteObject(key)

    console.log('\nPASS — R2 roundtrip succeeded. Credentials + bucket + presigned URL all working.')
  } catch (err) {
    console.error('\nFAIL —', err.message)
    if (err.$metadata) console.error('     httpStatus:', err.$metadata.httpStatusCode, 'requestId:', err.$metadata.requestId)
    process.exit(1)
  }
})()
