// Smoke test for the diagnostic v0 engine.
//
// Runs the 6 worked examples from docs/clinical-primer.md §4 + a battery of
// red-flag triggers through the orchestrator and asserts plausible outputs.
// Failure exits non-zero; success prints a green summary.
//
// Usage:
//   cd maec-app/server
//   node diagnostic/seed.js      # ensure KB is loaded
//   node diagnostic/smoke.js

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
require('../db')

const mongoose = require('mongoose')
const { runDiagnostic } = require('./engine/orchestrator')
const { deriveFromMeasurement } = require('./engine/deriveFindings')
const DxTest = require('./models/DxTest')

let passes = 0
let failures = 0
const failedCases = []

function assert(cond, msg, caseName) {
  if (cond) {
    passes += 1
  } else {
    failures += 1
    failedCases.push({ caseName, msg })
    console.error(`  ✘ ${msg}`)
  }
}

function topDiseaseIds(result, n = 5) {
  return (result.differential || []).slice(0, n).map(d => d.diseaseId)
}

function redFlagIds(result) {
  return (result.redFlags || []).map(rf => rf.redFlagId)
}

const cases = [
  {
    name: '#1 Gradual blur, both eyes, age 68',
    complaint: {
      text: 'Mờ tăng dần 2 mắt nhiều tháng nay',
      eyeAffected: 'OU',
      onset: 'gradual',
      pain: 'none',
      visionChange: 'mild',
      symptoms: ['vision_blur_gradual'],
      patientContext: { ageYears: 68 },
    },
    expectInTop: ['d-cataract'],
    expectRedFlag: [],
    expectNoRedFlag: ['rf-acute-angle-closure', 'rf-rao'],
  },
  {
    name: '#2 Sudden severe pain + red + halos',
    complaint: {
      text: 'Đau dữ dội mắt phải, đỏ, nhìn thấy quầng sáng',
      eyeAffected: 'OD',
      onset: 'sudden',
      pain: 'severe',
      redness: 'severe',
      visionChange: 'severe',
      symptoms: ['pain_severe', 'halos', 'nausea_vomiting'],
      patientContext: { ageYears: 62 },
    },
    expectInTop: ['d-acute-angle-closure'],
    expectRedFlag: ['rf-acute-angle-closure'],
  },
  {
    name: '#3 Red watery itchy, no pain',
    complaint: {
      text: 'Đỏ, chảy nước, ngứa, không đau',
      eyeAffected: 'OU',
      onset: 'subacute',
      pain: 'none',
      redness: 'mild',
      symptoms: ['itching', 'discharge_watery', 'binocular'],
      patientContext: { ageYears: 30 },
    },
    expectInTop: ['d-allergic-conjunctivitis'],
    expectRedFlag: [],
  },
  {
    name: '#4 Gritty, blur clears with blink',
    complaint: {
      text: 'Cộm rát, mờ khi đọc máy tính, đỡ khi chớp mắt',
      eyeAffected: 'OU',
      onset: 'gradual',
      pain: 'mild',
      symptoms: ['gritty_burning', 'blur_that_clears_with_blink'],
      patientContext: { ageYears: 45 },
    },
    expectInTop: ['d-dry-eye-mgd'],
    expectRedFlag: [],
  },
  {
    name: '#5 Double vision that resolves when one eye covered',
    complaint: {
      text: 'Nhìn đôi, hết khi che 1 mắt',
      eyeAffected: 'OU',
      onset: 'sudden',
      symptoms: ['diplopia_binocular'],
      patientContext: { ageYears: 60 },
    },
    expectInTop: ['d-cn3-palsy-ischemic', 'd-cn4-palsy', 'd-cn6-palsy', 'd-strabismus-adult'],
    expectInTopAny: true,
  },
  {
    name: '#6 Flashes + new floaters + curtain',
    complaint: {
      text: 'Chớp sáng, ruồi bay nhiều, bóng đen che một bên',
      eyeAffected: 'OD',
      onset: 'sudden',
      symptoms: ['flashes', 'floaters_new', 'curtain', 'field_loss', 'monocular'],
      patientContext: { ageYears: 58 },
    },
    expectInTop: ['d-retinal-detachment'],
    expectRedFlag: ['rf-retinal-detachment'],
  },

  // ── Red-flag triggers ──────────────────────────────────────

  {
    name: 'RF: chemical burn',
    complaint: {
      text: 'Hóa chất văng vào mắt',
      symptoms: ['chemical_exposure', 'pain_severe'],
      onset: 'sudden',
      pain: 'severe',
      patientContext: { ageYears: 35 },
    },
    expectInTop: ['d-chemical-burn'],
    expectRedFlag: ['rf-chemical-burn'],
  },
  {
    name: 'RF: leukocoria in a child',
    complaint: {
      text: 'Bé 3 tuổi đồng tử trắng khi chụp ảnh',
      symptoms: ['white_pupillary_reflex'],
      patientContext: { ageYears: 3 },
    },
    expectInTop: ['d-retinoblastoma'],
    expectRedFlag: ['rf-leukocoria-child'],
  },
  {
    name: 'RF: CN III palsy with blown pupil',
    complaint: {
      text: 'Sụp mi, song thị, đồng tử giãn 1 bên',
      symptoms: ['diplopia_binocular', 'ptosis', 'pupil_dilated_unilateral', 'headache'],
      patientContext: { ageYears: 55 },
    },
    expectInTop: ['d-cn3-palsy-compressive'],
    expectRedFlag: ['rf-cn3-blown-pupil'],
  },
  {
    name: 'RF: GCA (age 72 + sudden loss + jaw claudication)',
    complaint: {
      text: 'Mất thị lực đột ngột mắt phải, đau đầu, đau cơ hàm khi nhai',
      symptoms: ['vision_loss_sudden', 'monocular', 'headache', 'jaw_claudication', 'scalp_tenderness'],
      onset: 'sudden',
      pain: 'mild',
      patientContext: { ageYears: 72 },
    },
    expectInTop: ['d-gca'],
    expectRedFlag: ['rf-gca'],
  },
  {
    name: 'RF: NAION split (age 65 + sudden loss + altitudinal)',
    complaint: {
      text: 'Mất thị lực nửa trên đột ngột mắt phải, không đau',
      symptoms: ['vision_loss_sudden', 'monocular', 'field_loss_altitudinal'],
      onset: 'sudden',
      pain: 'none',
      patientContext: { ageYears: 65 },
    },
    expectInTop: ['d-naion'],
    expectRedFlag: ['rf-naion'],
  },
  {
    name: 'RF: orbital cellulitis (child + swelling + proptosis + fever)',
    complaint: {
      text: 'Trẻ 6 tuổi, mắt phải sưng nhiều, lồi ra, đau khi liếc, đang sốt',
      symptoms: ['periorbital_swelling', 'proptosis', 'pain_on_eye_movement', 'fever_or_systemic'],
      pain: 'moderate',
      patientContext: { ageYears: 6 },
    },
    expectInTop: ['d-orbital-cellulitis'],
    expectRedFlag: ['rf-orbital-cellulitis'],
  },
  {
    name: 'RF: hyphema after trauma',
    complaint: {
      text: 'Bị bóng tennis va vào mắt 2 giờ trước, thấy lớp máu dưới giác mạc',
      symptoms: ['trauma_recent', 'blood_in_AC', 'vision_drop'],
      onset: 'sudden',
      pain: 'moderate',
      patientContext: { ageYears: 22, recentTrauma: true },
    },
    expectInTop: ['d-hyphema'],
    expectRedFlag: ['rf-hyphema'],
  },
  {
    name: 'RF: severe scleritis (deep boring + tender + violet)',
    complaint: {
      text: 'Đau sâu kiểu khoan mắt phải, đau hơn về đêm, đau khi sờ',
      symptoms: ['pain_deep_boring', 'tender_globe', 'violet_hue_sclera'],
      pain: 'severe',
      patientContext: { ageYears: 48, systemic: ['rheumatoid_arthritis'] },
    },
    expectInTop: ['d-scleritis'],
    expectRedFlag: ['rf-scleritis-severe'],
  },
  {
    name: 'RF: HSV keratitis fires from observation (dendritic ulcer)',
    complaint: {
      text: 'Đau mắt + sợ ánh sáng, không đeo CL',
      symptoms: ['pain_severe_or_moderate', 'photophobia'],
      pain: 'moderate',
      patientContext: { ageYears: 35, isContactLensWearer: false },
    },
    observations: [
      { findingId: 'dendritic_corneal_ulcer', eye: 'OD', source: 'manual' },
    ],
    expectInTop: ['d-hsv-keratitis'],
    expectRedFlag: ['rf-hsv-keratitis'],
  },
  {
    name: 'RF: endophthalmitis (post-injection)',
    complaint: {
      text: 'Sau tiêm nội nhãn 3 ngày, mắt đau, giảm thị lực',
      symptoms: ['pain_severe', 'vision_drop', 'redness_circumcorneal'],
      onset: 'subacute',
      pain: 'severe',
      patientContext: { ageYears: 68, recentIntraocularSurgeryOrInjection: true },
    },
    expectInTop: ['d-endophthalmitis'],
    expectRedFlag: ['rf-endophthalmitis'],
  },
  {
    name: 'RF: contact-lens corneal ulcer',
    complaint: {
      text: 'Đeo kính tiếp xúc, đau dữ dội, sợ ánh sáng, có đốm trắng trên giác mạc',
      symptoms: ['pain_severe', 'photophobia', 'corneal_white_spot'],
      pain: 'severe',
      patientContext: { ageYears: 24, isContactLensWearer: true },
    },
    expectInTop: ['d-bacterial-keratitis'],
    expectRedFlag: ['rf-bacterial-keratitis'],
  },
  {
    name: 'RF: optic neuritis (young + pain-on-EOM + subacute mono loss)',
    complaint: {
      text: 'Mờ 1 mắt 3 ngày, đau khi liếc mắt',
      symptoms: ['vision_loss_subacute', 'monocular', 'pain_on_eye_movement'],
      onset: 'subacute',
      patientContext: { ageYears: 28, sex: 'F' },
    },
    expectInTop: ['d-optic-neuritis'],
    expectRedFlag: ['rf-optic-neuritis'],
  },
  {
    name: 'RF: new Horner with neck pain',
    complaint: {
      text: 'Sụp mi nhẹ, đồng tử nhỏ 1 bên, đau cổ',
      symptoms: ['ptosis', 'pupil_small_unilateral', 'neck_pain'],
      patientContext: { ageYears: 45 },
    },
    expectInTop: ['d-horner-syndrome'],
    expectRedFlag: ['rf-horner-new'],
  },
  {
    name: '#20 Blur → auto-refraction OD -2.00 / OS -3.00 → myopia (numeric measurement)',
    complaint: {
      text: 'Mắt nhìn mờ',
      eyeAffected: 'OU',
      onset: 'gradual',
      symptoms: ['vision_blur_gradual'],
      patientContext: { ageYears: 20 },
    },
    expectRecommends: 't-autorefraction',   // before measurement, suggester offers refraction
    measurementEntry: { testId: 't-autorefraction', measurements: { OD: { sphere: -2.00 }, OS: { sphere: -3.00 } } },
    expectInTop: ['d-myopia'],
    expectTopIs: 'd-myopia',                 // d-myopia must be RANK #1 after refraction
    expectNoRedFlag: ['rf-acute-angle-closure'],
  },
]

async function runCase(c) {
  console.log(`\n▸ ${c.name}`)

  // If the case enters a measurement, first assert the suggester offers the test
  // for the bare complaint, then derive the per-eye findings it produces.
  let observations = c.observations || []
  if (c.measurementEntry) {
    const pre = await runDiagnostic(c.complaint, observations)
    if (c.expectRecommends) {
      const recs = (pre.recommendedNextTests || []).map(t => t.testId)
      assert(recs.includes(c.expectRecommends), `expected ${c.expectRecommends} recommended pre-measurement, got [${recs.join(', ')}]`, c.name)
    }
    const test = await DxTest.findById(c.measurementEntry.testId).lean()
    const at = new Date().toISOString()
    const d = deriveFromMeasurement({ test, measurementsByEye: c.measurementEntry.measurements, enteredBy: 'smoke', at })
    if (d.errors.length) assert(false, `measurement derive errors: ${d.errors.join('; ')}`, c.name)
    observations = [...observations, ...d.rawObservations, ...d.derivedObservations]
    console.log(`  derived:      ${d.derivedObservations.map(o => `${o.eye}:${o.findingId}`).join(', ') || '(none)'}`)
  }

  const result = await runDiagnostic(c.complaint, observations)
  const top = topDiseaseIds(result, 6)
  const rfs = redFlagIds(result)
  console.log(`  differential: ${top.join(', ') || '(empty)'}`)
  console.log(`  redFlags:     ${rfs.join(', ') || '(none)'}`)

  // Expectations
  if (c.expectTopIs) {
    assert(top[0] === c.expectTopIs, `expected ${c.expectTopIs} at RANK #1, got [${top.join(', ')}]`, c.name)
  }
  if (c.expectInTopAny && c.expectInTop) {
    const matched = c.expectInTop.some(id => top.includes(id))
    assert(matched, `expected ANY of [${c.expectInTop.join(', ')}] in top 6, got [${top.join(', ')}]`, c.name)
  } else if (c.expectInTop) {
    for (const want of c.expectInTop) {
      assert(top.includes(want), `expected ${want} in top 6, got [${top.join(', ')}]`, c.name)
    }
  }
  for (const want of c.expectRedFlag || []) {
    assert(rfs.includes(want), `expected red-flag ${want}, got [${rfs.join(', ')}]`, c.name)
  }
  for (const dontWant of c.expectNoRedFlag || []) {
    assert(!rfs.includes(dontWant), `unexpected red-flag ${dontWant} fired`, c.name)
  }

  assert(typeof result.disclaimer === 'string' && result.disclaimer.length > 0,
    'response must include disclaimer', c.name)
}

async function main() {
  for (const c of cases) {
    try {
      await runCase(c)
    } catch (err) {
      failures += 1
      failedCases.push({ caseName: c.name, msg: `threw: ${err.message}` })
      console.error(`  ✘ threw: ${err.message}`)
    }
  }

  console.log('\n' + '─'.repeat(60))
  console.log(`Smoke: ${passes} pass / ${failures} fail (${cases.length} cases)`)
  if (failures > 0) {
    console.error('\nFailures:')
    for (const f of failedCases) console.error(`  - [${f.caseName}] ${f.msg}`)
    process.exit(1)
  } else {
    console.log('All cases produced plausible output.')
  }
}

main()
  .then(() => mongoose.connection.close())
  .catch(err => {
    console.error('Smoke crashed:', err)
    mongoose.connection.close()
    process.exit(1)
  })
