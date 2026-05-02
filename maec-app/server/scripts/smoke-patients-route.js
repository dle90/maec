// Sanity-check the new /api/catalogs/patients route end-to-end (HTTP, not Mongo).
// Uses 500 _TEST10K_ rows so it runs fast.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const mongoose = require('mongoose')
const Patient = require('../models/Patient')

const PREFIX = '_TEST10K_'
const N = 500
const ROOT = 'http://localhost:3001'

async function login() {
  const r = await fetch(ROOT + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'maec2026' }),
  })
  const d = await r.json()
  if (!d.token) throw new Error('login failed: ' + JSON.stringify(d))
  return d.token
}

async function get(path, token) {
  const r = await fetch(ROOT + path, { headers: { Authorization: 'Bearer ' + token } })
  return r.json()
}

;(async () => {
  await mongoose.connect(process.env.MONGODB_URI)
  // Seed
  const docs = Array.from({ length: N }, (_, i) => {
    const age = (i % 90) + 1
    const d = new Date(); d.setFullYear(d.getFullYear() - age); d.setDate(d.getDate() - 30)
    const cd = new Date(); cd.setDate(cd.getDate() - (i % 365))
    return {
      _id: `${PREFIX}HTTP${String(i).padStart(4, '0')}`,
      patientId: `BN-T10K-HTTP-${String(i).padStart(4, '0')}`,
      name: `${PREFIX}HTTP ${String(i).padStart(4, '0')}`,
      phone: `09${String(i).padStart(8, '0')}`,
      dob: d.toISOString().slice(0, 10),
      gender: i % 3 === 0 ? 'F' : i % 3 === 1 ? 'M' : 'other',
      createdAt: cd.toISOString(),
      lastEncounterAt: i % 5 === 0 ? cd.toISOString() : '',
    }
  })
  await Patient.insertMany(docs, { ordered: false })
  console.log(`Seeded ${N} via Mongo`)

  try {
    const token = await login()

    // 1. Default page (no filters)
    const r1 = await get('/api/catalogs/patients?pageSize=200', token)
    console.log(`page1 (no filter): items=${r1.items.length} total=${r1.total} page=${r1.page} pageSize=${r1.pageSize}`)
    if (r1.total < N) throw new Error('total too small')

    // 2. Page 2
    const r2 = await get('/api/catalogs/patients?pageSize=200&page=2', token)
    console.log(`page2: items=${r2.items.length}`)

    // 3. Gender filter
    const rM = await get('/api/catalogs/patients?gender=M&pageSize=10', token)
    console.log(`gender=M: total=${rM.total} (sample[0].gender=${rM.items[0]?.gender})`)
    if (rM.items[0]?.gender !== 'M') throw new Error('gender filter failed')

    // 4. Age range 60..80
    const rA = await get('/api/catalogs/patients?ageMin=60&ageMax=80&pageSize=10', token)
    console.log(`ageMin=60 ageMax=80: total=${rA.total}`)
    // Spot-check a row
    if (rA.items[0]) {
      const dobYear = parseInt(rA.items[0].dob.slice(0, 4))
      const age = new Date().getFullYear() - dobYear
      console.log(`  sample[0]: dob=${rA.items[0].dob} → age≈${age}`)
      if (age < 59 || age > 81) throw new Error('age window suspicious')
    }

    // 5. q is authoritative — gender ignored
    const rQ = await get('/api/catalogs/patients?q=HTTP&gender=M&pageSize=10', token)
    console.log(`q=HTTP&gender=M (gender should be ignored): total=${rQ.total}`)
    const allM = rQ.items.every(p => p.gender === 'M')
    if (allM && rQ.items.length > 0) throw new Error('q should override gender')

    // 6. Search by phone
    const rPhone = await get(`/api/catalogs/patients?q=09000000${50}`, token)
    console.log(`q=phone match: items=${rPhone.items.length}`)

    console.log('✓ All HTTP route assertions passed')
  } finally {
    const r = await Patient.deleteMany({ _id: { $regex: `^${PREFIX}HTTP` } })
    console.log(`Cleaned ${r.deletedCount}`)
    await mongoose.disconnect()
  }
})().catch(err => { console.error(err); process.exit(1) })
