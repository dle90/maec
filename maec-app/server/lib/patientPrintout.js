// Renders the patient-facing result printout (templates/patient-printout.docx).
//
// Builds a flat { var → string } map from an encounter + its patient, then
// hands it to docxtemplater. Unknown vars stay empty (nullGetter below).
//
// Source template uses {{var}} syntax; schema codes from examSummarySchema.js
// land verbatim (e.g. {{iop_od}}). Higher-level rollups that don't have a
// single source field (e.g. {{slit_lid_lash_od}}) are composed here.

const fs = require('fs')
const path = require('path')
const PizZip = require('pizzip')
const Docxtemplater = require('docxtemplater')

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'patient-printout.docx')

const todayDMY = () => {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

const ageFromDob = (dob) => {
  if (!dob) return ''
  const d = new Date(dob)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const beforeBirthday = (now.getMonth() < d.getMonth()) ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())
  if (beforeBirthday) age -= 1
  return age >= 0 ? String(age) : ''
}

const sexLabel = (g) => g === 'M' ? 'Nam' : g === 'F' ? 'Nữ' : ''

// Flatten assignedServices[].output into a single namespace. Each service may
// store its findings under output keys that match the canonical schema codes,
// e.g. { iop_od: 14, iop_os: 15, iop_time: '09:30' }. Last-write wins across
// services (this is acceptable for a printout — the finalised station value
// wins). Returns a plain object.
const flattenOutputs = (enc) => {
  const out = {}
  for (const svc of enc.assignedServices || []) {
    const o = svc.output || {}
    for (const k of Object.keys(o)) {
      const v = o[k]
      if (v !== null && v !== undefined && String(v) !== '') out[k] = v
    }
  }
  return out
}

const j = (...parts) => parts.filter((p) => p !== null && p !== undefined && String(p).trim() !== '').join(' | ')

function buildVars(enc, patient) {
  const o = flattenOutputs(enc)
  const v = {}

  // 1. Visit metadata
  v.visit_id = enc._id || ''
  v.patient_id = enc.patientId || ''
  v.visit_date = (enc.studyDate || enc.scheduledDate || '').slice(0, 10)
  v.print_date = todayDMY()
  v.result_link = `https://maec-production.up.railway.app/portal?v=${encodeURIComponent(enc._id || '')}`

  // 2. Patient pane
  v.patient_name = enc.patientName || patient?.fullName || ''
  v.dob = enc.dob || patient?.dob || ''
  v.age = ageFromDob(v.dob)
  v.sex = sexLabel(enc.gender || patient?.gender)
  v.phone = patient?.phone || ''
  v.guardian_name = patient?.guardianName || ''
  v.chief_complaint = enc.clinicalInfo || ''

  // 3. Summary
  v.diagnosis_summary = enc.diagnosis || ''
  v.patient_friendly_summary = enc.conclusion || ''
  v.followup_date = o.next_visit_date || ''
  v.followup_reason = o.followup_interval || ''

  // 4. VA / Refraction — pull eyeSplit fields straight from the output bag.
  for (const k of [
    'va_ucdva_od', 'va_ucdva_os',
    'va_with_old_glasses_od', 'va_with_old_glasses_os',
    'final_rx_od', 'final_rx_os',
    'va_final_rx_od', 'va_final_rx_os',
    'near_va_od', 'near_va_os',
    'add_od', 'add_os',
    'spectacle_note_od', 'spectacle_note_os',
  ]) v[k] = o[k] ?? ''

  // 5. Slit-lamp rollups — compose from per-structure fields per OD/OS.
  for (const eye of ['od', 'os']) {
    v[`slit_lid_lash_${eye}`] = j(o[`lids_${eye}`], o[`lid_margin_${eye}`], o[`lashes_${eye}`])
    v[`slit_conj_cornea_${eye}`] = j(o[`bulbar_conjunctiva_${eye}`], o[`palpebral_conjunctiva_${eye}`], o[`cornea_clarity_${eye}`])
    v[`slit_ac_iris_pupil_${eye}`] = j(o[`anterior_chamber_${eye}`], o[`iris_${eye}`], o[`pupil_${eye}`])
    v[`slit_lens_${eye}`] = o[`lens_${eye}`] ?? ''
    v[`iop_${eye}`] = o[`iop_${eye}`] ?? ''
    v[`fundus_disc_${eye}`] = j(o[`disc_color_${eye}`], o[`disc_margin_${eye}`])
    v[`cdr_${eye}`] = o[`cdr_vertical_${eye}`] ?? ''
    v[`fundus_macula_retina_${eye}`] = j(o[`macula_status_${eye}`], o[`peripheral_retina_${eye}`])
  }
  v.iop_time = o.iop_time || ''

  // 6. Imaging — verbatim where available.
  for (const k of [
    'topo_k1_od', 'topo_k2_od', 'topo_axis_od', 'topo_e_od',
    'topo_k1_os', 'topo_k2_os', 'topo_axis_os', 'topo_e_os',
  ]) {
    // Aliases: topo_k1 ↔ k1 in the schema. Try both naming conventions.
    v[k] = o[k] ?? o[k.replace(/^topo_/, '')] ?? ''
  }
  v.topo_impression = o.topo_morphology_od || o.topo_morphology_os || ''
  v.topo_link = o.topo_file_link || ''

  for (const eye of ['od', 'os']) {
    v[`al_${eye}`] = o[`axial_length_${eye}`] ?? ''
    v[`cr_${eye}`] = o[`corneal_radius_${eye}`] ?? ''
    v[`alcr_${eye}`] = o[`al_cr_ratio_${eye}`] ?? ''
  }
  v.biometry_impression = o.biometry_impression || ''
  v.biometry_link = o.biometry_file_link || ''

  v.oct_od_summary = o.oct_macula_od || o.oct_disc_od || ''
  v.oct_os_summary = o.oct_macula_os || o.oct_disc_os || ''
  v.oct_impression = o.imaging_impression || ''
  v.oct_link = o.imaging_file_link || ''

  for (const eye of ['od', 'os']) {
    v[`tbut_${eye}`] = o[`tbut_${eye}`] ?? ''
    v[`staining_${eye}`] = o[`corneal_staining_${eye}`] ?? ''
    v[`mgd_${eye}`] = o[`mgd_grade_${eye}`] ?? ''
  }
  v.dry_eye_score_name = o.osdi_score != null ? 'OSDI' : o.speed_score != null ? 'SPEED' : ''
  v.dry_eye_score = o.osdi_score ?? o.speed_score ?? ''
  v.dry_eye_impression = o.ocular_surface_dx || ''

  // 7. Myopia narrative
  v.myopia_status = j(o.final_rx_od, o.final_rx_os)
  v.myopia_risk_interpretation = ''
  v.myopia_plan_short = ''
  v.se_change = j(o.se_change_od, o.se_change_os)
  v.al_change = j(o.al_change_od, o.al_change_os)
  v.progression_interpretation = ''
  v.treatment_adjustment = ''
  const fmyopia = o.family_myopia
  v.parental_myopia = fmyopia === 1 ? 'Bố' : fmyopia === 2 ? 'Mẹ' : fmyopia === 3 ? 'Cả hai' : fmyopia === 4 ? 'Anh/chị/em' : 'Không'
  v.outdoor_time = o.outdoor_time_hours != null ? `${o.outdoor_time_hours} giờ/ngày` : ''
  v.nearwork_screen_time = o.near_work_hours != null ? `${o.near_work_hours} giờ/ngày` : ''
  v.risk_factor_summary = ''
  v.lifestyle_advice_short = ''

  // 8. Plan
  v.optical_management_plan = o.final_prescription_summary || ''
  v.medication_treatment_plan = o.medication_plan || ''
  v.lifestyle_counselling = o.advice_given || ''
  v.additional_notes = enc.conclusion || ''
  v.urgent_warning_text = o.referral_needed === 1 ? 'Có dấu hiệu cần tái khám sớm — vui lòng liên hệ phòng khám.' : ''

  v.examiner_name = enc.radiologistName || enc.technicianName || ''

  return v
}

function renderPrintout(enc, patient) {
  const buf = fs.readFileSync(TEMPLATE_PATH)
  const zip = new PizZip(buf)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  })
  doc.render(buildVars(enc, patient))
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

module.exports = { renderPrintout, buildVars }
