/**
 * Sanity check: test Viewer Enhancement APIs (annotations, key images, priors, upload)
 * Run: node scripts/sanity-check-viewer.js
 */
const http = require('http')

const BASE = 'http://localhost:3001'
let TOKEN = ''
let pass = 0, fail = 0

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path)
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method, headers: { 'Content-Type': 'application/json' },
    }
    if (token || TOKEN) opts.headers['Authorization'] = `Bearer ${token || TOKEN}`
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
  console.log('  SANITY CHECK — Viewer Enhancements')
  console.log('═══════════════════════════════════════\n')

  // Login
  const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'maec2026' })
  check('Login OK', login.status === 200)
  TOKEN = login.data.token

  // Get a study to test with
  const studies = await request('GET', '/api/ris/studies?limit=5')
  check('RIS studies still work', studies.status === 200)
  const study = studies.data[0]
  check('Have at least 1 study', !!study)

  if (!study) {
    console.log('\n  No studies to test with. Skipping viewer tests.')
    process.exit(0)
  }

  // ── ANNOTATIONS ───────────────────────────────────────
  console.log('\n1. ANNOTATIONS')

  const getAnn = await request('GET', `/api/ris/annotations/${study._id}`)
  check('Get annotations returns 200', getAnn.status === 200)

  const saveAnn = await request('POST', '/api/ris/annotations', {
    studyId: study._id,
    studyUID: study.studyUID,
    measurements: JSON.stringify([{ type: 'Length', value: 42.5, unit: 'mm' }]),
    measurementCount: 1,
  })
  check('Save annotation returns 200', saveAnn.status === 200)
  check('Annotation has savedBy', !!saveAnn.data.annotation?.savedBy)

  const getAnn2 = await request('GET', `/api/ris/annotations/${study._id}`)
  check('Annotation persisted', !!getAnn2.data.measurements)
  check('Annotation count correct', getAnn2.data.measurementCount === 1)

  // ── KEY IMAGES ────────────────────────────────────────
  console.log('\n2. KEY IMAGES')

  const addKi = await request('POST', '/api/ris/key-images', {
    studyId: study._id,
    studyUID: study.studyUID,
    seriesUID: '1.2.3.4.5',
    instanceUID: '1.2.3.4.5.6',
    description: 'Sanity check key image',
  })
  check('Add key image returns 201', addKi.status === 201)
  check('Key image has _id', !!addKi.data.keyImage?._id)
  const kiId = addKi.data.keyImage?._id

  const listKi = await request('GET', `/api/ris/key-images/${study._id}`)
  check('List key images returns 200', listKi.status === 200)
  check('Key images has data', listKi.data.length >= 1)

  if (kiId) {
    const delKi = await request('DELETE', `/api/ris/key-images/${kiId}`)
    check('Delete key image returns 200', delKi.status === 200)
  }

  // ── PRIOR STUDIES ─────────────────────────────────────
  console.log('\n3. PRIOR STUDIES')

  const priors = await request('GET', `/api/ris/priors/${study.patientId}?modality=${study.modality}&excludeStudyId=${study._id}`)
  check('Get priors returns 200', priors.status === 200)
  check('Priors is array', Array.isArray(priors.data))

  // ── COMPARE URL ───────────────────────────────────────
  console.log('\n4. COMPARE URL')

  const compareUrl = await request('GET', `/api/ris/compare-url?studyUIDs=${study.studyUID},1.2.3.4.5`)
  check('Compare URL returns 200', compareUrl.status === 200)
  check('Compare URL has url', !!compareUrl.data.url)
  check('Compare URL count = 2', compareUrl.data.count === 2)

  // ── UPLOAD ENDPOINT EXISTS ────────────────────────────
  console.log('\n5. DICOM UPLOAD')
  // Just test the endpoint exists (no real Orthanc to upload to)
  const upload = await request('POST', '/api/ris/orthanc/upload', {})
  // Will likely return 503 since Orthanc isn't running, but the endpoint should exist
  check('Upload endpoint exists (not 404)', upload.status !== 404)

  // ── BACKWARD COMPAT ───────────────────────────────────
  console.log('\n6. BACKWARD COMPAT')
  const risStudies2 = await request('GET', '/api/ris/studies?limit=3')
  check('RIS studies endpoint intact', risStudies2.status === 200)

  const risStats = await request('GET', '/api/ris/stats')
  check('RIS stats endpoint intact', risStats.status === 200)

  // ── Summary ───────────────────────────────────────────
  console.log('\n═══════════════════════════════════════')
  console.log(`  RESULT: ${pass} passed, ${fail} failed (${pass + fail} total)`)
  console.log('═══════════════════════════════════════')
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(err => { console.error('Fatal:', err); process.exit(1) })
