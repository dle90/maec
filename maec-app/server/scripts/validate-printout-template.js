#!/usr/bin/env node
// Cross-checks the patient printout docx (File 1) against the canonical exam
// summary schema (File 2 / examSummarySchema.js).
//
// Reports {{vars}} in the docx that are NOT covered by the schema, accounting
// for OD/OS suffixing (e.g. {{iop_od}} matches schema key `iop` with
// eyeSplit:true). Also lists schema keys not referenced by the printout (FYI,
// not a failure — printout is a deliberate subset).
//
// Run with:  cd maec-app/server && node scripts/validate-printout-template.js

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const SCHEMA = require('../config/examSummarySchema')

// Hand-picked exceptions: variables that legitimately live outside the exam
// summary (visit metadata, free-text printout-only blocks, signatures).
const PRINTOUT_ONLY = new Set([
  'print_date', 'result_link',
  // Patient pane (these all exist on Encounter / Patient, not in the summary schema):
  'patient_name', 'phone', 'age', 'sex',
  // Section 2 — patient-friendly summary:
  'diagnosis_summary', 'patient_friendly_summary',
  // Section 3 — extra spectacle / near VA rollups:
  'va_with_old_glasses_od', 'va_with_old_glasses_os',
  'final_rx_od', 'final_rx_os',
  'va_final_rx_od', 'va_final_rx_os',
  'near_va_od', 'near_va_os', 'add_od', 'add_os',
  'spectacle_note_od', 'spectacle_note_os',
  // Section 4 — slit-lamp rollups (regrouped vs File 2):
  'slit_lid_lash_od', 'slit_lid_lash_os',
  'slit_conj_cornea_od', 'slit_conj_cornea_os',
  'slit_ac_iris_pupil_od', 'slit_ac_iris_pupil_os',
  'slit_lens_od', 'slit_lens_os',
  'fundus_disc_od', 'fundus_disc_os', 'cdr_od', 'cdr_os',
  'fundus_macula_retina_od', 'fundus_macula_retina_os',
  'urgent_warning_text',
  // Section 5 — composite "Nhận xét / link" cells:
  'topo_k1_od', 'topo_k2_od', 'topo_axis_od', 'topo_e_od',
  'topo_k1_os', 'topo_k2_os', 'topo_axis_os', 'topo_e_os',
  'topo_impression', 'topo_link',
  'al_od', 'al_os', 'cr_od', 'cr_os', 'alcr_od', 'alcr_os',
  'biometry_impression', 'biometry_link',
  'oct_od_summary', 'oct_os_summary', 'oct_impression', 'oct_link',
  'staining_od', 'staining_os', 'mgd_od', 'mgd_os',
  'dry_eye_score_name', 'dry_eye_score', 'dry_eye_impression',
  // Section 6 — myopia narrative summary:
  'myopia_status', 'myopia_risk_interpretation', 'myopia_plan_short',
  'progression_interpretation', 'treatment_adjustment',
  'parental_myopia', 'outdoor_time', 'nearwork_screen_time',
  'risk_factor_summary', 'lifestyle_advice_short',
  // Section 7 — plan rollups:
  'optical_management_plan', 'medication_treatment_plan',
  'lifestyle_counselling', 'followup_reason', 'additional_notes',
  'examiner_name',
  // Literal docstring example at the bottom of the source template.
  'variable_name',
])

const SCHEMA_KEYS = new Set()
const EYE_SPLIT_KEYS = new Set()
for (const section of SCHEMA) {
  for (const f of section.fields) {
    SCHEMA_KEYS.add(f.key)
    if (f.eyeSplit === true) EYE_SPLIT_KEYS.add(f.key)
  }
}

function isCoveredBySchema(varName) {
  if (SCHEMA_KEYS.has(varName)) return true
  for (const suffix of ['_od', '_os']) {
    if (varName.endsWith(suffix)) {
      const base = varName.slice(0, -suffix.length)
      if (EYE_SPLIT_KEYS.has(base)) return true
    }
  }
  return false
}

function extractVarsFromDocx(docxPath) {
  // Unzip to a temp dir and parse word/document.xml. Avoid the unzip CLI not
  // being on every system — use node's zlib via a tiny inline zip reader.
  const buf = fs.readFileSync(docxPath)
  const sig = buf.slice(0, 2).toString()
  if (sig !== 'PK') throw new Error(`${docxPath} is not a zip/docx`)
  // Easiest path: shell out to PowerShell's built-in Expand-Archive on win32,
  // unzip elsewhere. The script already lives next to other smoke scripts and
  // is dev-only, so this is fine.
  const tmp = path.join(require('os').tmpdir(), `maec-vars-${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
  fs.mkdirSync(tmp, { recursive: true })
  const isWin = process.platform === 'win32'
  // Copy with a .zip extension because Expand-Archive insists on it.
  const zipCopy = path.join(tmp, 'in.zip')
  fs.copyFileSync(docxPath, zipCopy)
  if (isWin) {
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipCopy}' -DestinationPath '${tmp}' -Force"`,
      { stdio: 'ignore' })
  } else {
    execSync(`unzip -o '${zipCopy}' -d '${tmp}'`, { stdio: 'ignore' })
  }
  const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8')
  // Strip XML tags first so {{var}} that got split across runs by Word still
  // reads as one token. (Word frequently breaks {{ foo_bar }} into multiple
  // <w:t> runs depending on author edits.)
  const text = xml.replace(/<[^>]+>/g, '')
  const vars = new Set()
  const re = /\{\{\s*([a-zA-Z][\w.]*)\s*\}\}/g
  let m
  while ((m = re.exec(text)) !== null) vars.add(m[1])
  return vars
}

function main() {
  const root = path.resolve(__dirname, '..', '..', '..')
  const docxPath = path.join(root, 'MAU_PHIEU_TRA_KET_QUA_KHAM_MAT_CHO_NGUOI_BENH.docx')
  if (!fs.existsSync(docxPath)) {
    // Also accept the moved location under server/templates/.
    const alt = path.join(__dirname, '..', 'templates', 'patient-printout.docx')
    if (fs.existsSync(alt)) {
      return reportFor(alt)
    }
    console.error('Patient printout docx not found at:', docxPath)
    process.exit(2)
  }
  reportFor(docxPath)
}

function reportFor(docxPath) {
  const vars = extractVarsFromDocx(docxPath)
  const missing = []
  const ok = []
  const printoutOnly = []
  for (const v of [...vars].sort()) {
    if (isCoveredBySchema(v)) ok.push(v)
    else if (PRINTOUT_ONLY.has(v)) printoutOnly.push(v)
    else missing.push(v)
  }
  console.log(`Printout: ${path.basename(docxPath)}`)
  console.log(`Total unique {{vars}}: ${vars.size}`)
  console.log(`  ✓ Covered by exam-summary schema:    ${ok.length}`)
  console.log(`  ⊙ Printout-only (visit / rollups):   ${printoutOnly.length}`)
  console.log(`  ✗ Unmapped — need a derivation rule: ${missing.length}`)
  if (missing.length) {
    console.log('\nUnmapped vars:')
    for (const v of missing) console.log('  -', v)
  }

  // Coverage report: schema keys not referenced by the printout (informational).
  const used = new Set()
  for (const v of vars) {
    if (SCHEMA_KEYS.has(v)) used.add(v)
    for (const suffix of ['_od', '_os']) {
      if (v.endsWith(suffix)) {
        const base = v.slice(0, -suffix.length)
        if (EYE_SPLIT_KEYS.has(base)) used.add(base)
      }
    }
  }
  const unused = [...SCHEMA_KEYS].filter((k) => !used.has(k))
  console.log(`\nSchema fields not in this printout: ${unused.length} (informational; printout is intentionally a summary)`)

  process.exitCode = missing.length === 0 ? 0 : 1
}

main()
