/**
 * Sanity check: test Patient Portal & Partner Portal APIs
 * Run: node scripts/sanity-check-portals.js
 * Requires: server running on localhost:3001, seed-portals.js already run
 */
const http = require('http')

const BASE = 'http://localhost:3001'
let PATIENT_TOKEN = ''
let PARTNER_TOKEN = ''
let ADMIN_TOKEN = ''
let pass = 0, fail = 0

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path)
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method, headers: { 'Content-Type': 'application/json' },
    }
    if (token) opts.headers['Authorization'] = `Bearer ${token}`
    const req = http.request(opts, res => {
      let data = ''; res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, data }) }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

function check(label, condition) {
  if (condition) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

async function run() {
  console.log('═══════════════════════════════════════')
  console.log('  SANITY CHECK — Portals')
  console.log('═══════════════════════════════════════\n')

  // ── Admin login (for partner-admin tests) ─────────────
  console.log('0. ADMIN LOGIN')
  const adminLogin = await request('POST', '/api/auth/login', { username: 'admin', password: 'linkrad2025' })
  check('Admin login returns 200', adminLogin.status === 200)
  ADMIN_TOKEN = adminLogin.data.token

  // ══════════════════════════════════════════════════════
  // PATIENT PORTAL
  // ══════════════════════════════════════════════════════
  console.log('\n1. PATIENT PORTAL — LOGIN')

  const pLogin = await request('POST', '/api/patient-portal/login', { phone: '0901000001', dob: '1975-04-12' })
  check('Patient login returns 200', pLogin.status === 200)
  check('Patient login returns token', !!pLogin.data.token)
  check('Patient login returns name', pLogin.data.patientName === 'Nguyễn Văn Nam')
  PATIENT_TOKEN = pLogin.data.token

  const pLoginBad = await request('POST', '/api/patient-portal/login', { phone: '0901000001', dob: '1999-01-01' })
  check('Wrong DOB returns 401', pLoginBad.status === 401)

  const pLoginMissing = await request('POST', '/api/patient-portal/login', { phone: '0999999999', dob: '2000-01-01' })
  check('Unknown phone returns 401', pLoginMissing.status === 401)

  // ── Profile ───────────────────────────────────────────
  console.log('\n2. PATIENT PORTAL — PROFILE')
  const pProfile = await request('GET', '/api/patient-portal/profile', null, PATIENT_TOKEN)
  check('Profile returns 200', pProfile.status === 200)
  check('Profile has name', pProfile.data.name === 'Nguyễn Văn Nam')

  const pProfileNoAuth = await request('GET', '/api/patient-portal/profile')
  check('Profile without token returns 401', pProfileNoAuth.status === 401)

  // ── Visits ────────────────────────────────────────────
  console.log('\n3. PATIENT PORTAL — VISITS')
  const pVisits = await request('GET', '/api/patient-portal/visits', null, PATIENT_TOKEN)
  check('Visits returns 200', pVisits.status === 200)
  check('Visits returns array', Array.isArray(pVisits.data))
  check('Visits count >= 1', pVisits.data.length >= 1)

  const firstVisit = pVisits.data[0]
  if (firstVisit) {
    check('Visit has appointmentId', !!firstVisit.appointmentId)
    check('Visit has date', !!firstVisit.date)
    check('Visit has site', !!firstVisit.site)
  }

  // ── Report ────────────────────────────────────────────
  console.log('\n4. PATIENT PORTAL — REPORT')
  const visitWithStudy = pVisits.data.find(v => v.study?.hasReport)
  if (visitWithStudy) {
    const pReport = await request('GET', `/api/patient-portal/visits/${visitWithStudy.appointmentId}/report`, null, PATIENT_TOKEN)
    check('Report returns 200', pReport.status === 200)
    check('Report has findings', !!pReport.data.findings || !!pReport.data.impression)
  } else {
    console.log('  (skipped — no visits with reports)')
  }

  // ── Feedback ──────────────────────────────────────────
  console.log('\n5. PATIENT PORTAL — FEEDBACK')
  // Login as patient 4 (no existing feedback)
  const p4Login = await request('POST', '/api/patient-portal/login', { phone: '0901000004', dob: '1992-07-15' })
  const P4_TOKEN = p4Login.data.token
  const p4Visits = await request('GET', '/api/patient-portal/visits', null, P4_TOKEN)
  const p4Visit = p4Visits.data[0]
  if (p4Visit) {
    const pFb = await request('POST', '/api/patient-portal/feedback', { appointmentId: p4Visit.appointmentId, rating: 4, comment: 'Tốt lắm!' }, P4_TOKEN)
    check('Feedback submit returns 201', pFb.status === 201)
  } else {
    console.log('  (skipped — no visits for patient 4)')
  }

  // ══════════════════════════════════════════════════════
  // PARTNER PORTAL
  // ══════════════════════════════════════════════════════
  console.log('\n6. PARTNER PORTAL — LOGIN')

  const ptLogin = await request('POST', '/api/partner-portal/login', { username: 'partner_ndh', password: 'partner123' })
  check('Partner login returns 200', ptLogin.status === 200)
  check('Partner login returns token', !!ptLogin.data.token)
  check('Partner login returns facilityName', !!ptLogin.data.facilityName)
  PARTNER_TOKEN = ptLogin.data.token

  const ptLoginBad = await request('POST', '/api/partner-portal/login', { username: 'partner_ndh', password: 'wrong' })
  check('Wrong password returns 401', ptLoginBad.status === 401)

  // ── Profile ───────────────────────────────────────────
  console.log('\n7. PARTNER PORTAL — PROFILE')
  const ptProfile = await request('GET', '/api/partner-portal/profile', null, PARTNER_TOKEN)
  check('Profile returns 200', ptProfile.status === 200)
  check('Profile has account', !!ptProfile.data.account)
  check('Profile has facility', !!ptProfile.data.facility)

  // ── Services & Sites ──────────────────────────────────
  console.log('\n8. PARTNER PORTAL — SERVICES & SITES')
  const ptSvc = await request('GET', '/api/partner-portal/services', null, PARTNER_TOKEN)
  check('Services returns 200', ptSvc.status === 200)
  check('Services returns array', Array.isArray(ptSvc.data))

  const ptSites = await request('GET', '/api/partner-portal/sites', null, PARTNER_TOKEN)
  check('Sites returns 200', ptSites.status === 200)

  // ── Submit Referral ───────────────────────────────────
  console.log('\n9. PARTNER PORTAL — REFERRALS')
  const ptRef = await request('POST', '/api/partner-portal/referrals', {
    patientName: 'Test BN Portal', patientPhone: '0999888777', patientDob: '1990-01-01',
    patientGender: 'M', site: 'Hải Dương', requestedServiceName: 'CT sọ não', modality: 'CT',
    clinicalInfo: 'Test referral from sanity check',
  }, PARTNER_TOKEN)
  check('Submit referral returns 201', ptRef.status === 201)
  check('Referral has _id', !!ptRef.data.referral?._id)

  const ptRefList = await request('GET', '/api/partner-portal/referrals', null, PARTNER_TOKEN)
  check('Referrals list returns 200', ptRefList.status === 200)
  check('Referrals list has data', ptRefList.data.length >= 1)

  // ── Commissions ───────────────────────────────────────
  console.log('\n10. PARTNER PORTAL — COMMISSIONS')
  const ptComm = await request('GET', '/api/partner-portal/commissions', null, PARTNER_TOKEN)
  check('Commissions returns 200', ptComm.status === 200)
  check('Commissions returns array', Array.isArray(ptComm.data))

  // ══════════════════════════════════════════════════════
  // PARTNER ADMIN
  // ══════════════════════════════════════════════════════
  console.log('\n11. PARTNER ADMIN')
  const paAccounts = await request('GET', '/api/partner-admin/accounts', null, ADMIN_TOKEN)
  check('Admin list accounts returns 200', paAccounts.status === 200)
  check('Admin accounts has data', paAccounts.data.length >= 1)

  const paReferrals = await request('GET', '/api/partner-admin/referrals', null, ADMIN_TOKEN)
  check('Admin list referrals returns 200', paReferrals.status === 200)

  // ── Accept a pending referral ─────────────────────────
  const pendingRef = paReferrals.data.find(r => r.status === 'pending')
  if (pendingRef) {
    const accept = await request('PUT', `/api/partner-admin/referrals/${pendingRef._id}/accept`, {}, ADMIN_TOKEN)
    check('Accept referral returns 200', accept.status === 200)
    check('Accept creates appointment', !!accept.data.appointment?._id)
  } else {
    console.log('  (skipped — no pending referrals)')
  }

  // ── Summary ───────────────────────────────────────────
  console.log('\n═══════════════════════════════════════')
  console.log(`  RESULT: ${pass} passed, ${fail} failed (${pass + fail} total)`)
  console.log('═══════════════════════════════════════')
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(err => { console.error('Fatal:', err); process.exit(1) })
