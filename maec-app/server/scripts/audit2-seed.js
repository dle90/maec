// Seed for audit2 flow verification. Run via: railway run node scripts/audit2-seed.js [seed|clean]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const m = require('mongoose')
const Patient = require('../models/Patient')
const Encounter = require('../models/Encounter')

const PFX = '_TESTFL2_'
const PID = PFX + 'BN'
const EID = PFX + 'ENC'

;(async () => {
  await m.connect(process.env.MONGODB_URI)
  const cmd = process.argv[2] || 'seed'
  if (cmd === 'clean') {
    const r1 = await Encounter.deleteMany({ _id: { $regex: '^' + PFX } })
    const r2 = await Patient.deleteMany({ _id: { $regex: '^' + PFX } })
    console.log(`cleaned: encounters=${r1.deletedCount}, patients=${r2.deletedCount}`)
  } else {
    await Encounter.deleteMany({ _id: { $regex: '^' + PFX } })
    await Patient.deleteMany({ _id: { $regex: '^' + PFX } })
    const now = new Date().toISOString()
    await Patient.create({
      _id: PID, patientId: PID, name: PFX + 'BN audit flows',
      phone: '0900000202', dob: '1985-03-15', gender: 'F',
      registeredSite: 'Trung Kính', createdAt: now, updatedAt: now, lastEncounterAt: now,
    })
    await Encounter.create({
      _id: EID, patientId: PID, patientName: PFX + 'BN audit flows',
      site: 'Trung Kính', dob: '1985-03-15', gender: 'F',
      status: 'in_progress',
      billItems: [{ kind: 'service', code: 'SVC-AUD', name: PFX + 'Khám audit', qty: 1, unitPrice: 200000, totalPrice: 200000, addedBy: 'admin', addedAt: now }],
      billTotal: 200000,
      createdAt: now, updatedAt: now,
    })
    console.log(`seeded patient=${PID} encounter=${EID}`)
  }
  await m.disconnect()
})().catch(e => { console.error(e); process.exit(1) })
