// Maps a diagnostic-engine test id → the clinic service (dịch vụ) code that
// performs it, so the dx assistant's "suggested tests" can be ordered as billable
// services and their results fed back into the engine (via exam-sync).
//
// Tests with NO clinic service are intentionally omitted — they are either bedside
// (pinhole, Amsler grid, confrontation field, pupil exam) or external referrals
// (ESR/CRP, MRI, CT-angio, B-scan, culture). Those stay in the dx assistant's own
// bedside/referral lane (entered as findings, not ordered as services).
export const TEST_SERVICE_MAP = {
  't-va':                'SVC-REFRACT',
  't-autorefraction':    'SVC-AUTOREF',
  't-cyclo-refraction':  'SVC-CYCLO',
  't-slit-lamp':         'SVC-SLIT',
  't-tonometry':         'SVC-IOP',
  't-color-vision':      'SVC-ISHIHARA',
  't-cover-test':        'SVC-TG2M',
  't-motility':          'SVC-TG2M',
  't-stereopsis':        'SVC-TG2M',
  't-fundus-exam':       'SVC-BIO',
  't-fundus-photo':      'SVC-FUNDUS',
  't-oct-macula':        'SVC-OCT-POST',
  't-oct-rnfl':          'SVC-OCT-POST',
  't-oct-angiography':   'SVC-OCT-POST',
  't-anterior-oct':      'SVC-OCT-ANT',
  't-pachymetry':        'SVC-OCT-ANT',
  't-topography':        'SVC-TOPO',
  't-tbut':              'SVC-DRYEYE',
  't-schirmer':          'SVC-DRYEYE',
  't-meibography':       'SVC-DRYEYE',
  't-biometry':          'SVC-BIOMETRY',
  't-gonioscopy':        'SVC-SLIT',
  't-fluorescein-stain': 'SVC-SLIT',
  't-seidel':            'SVC-SLIT',
}

export const serviceForTest = (testId) => TEST_SERVICE_MAP[testId] || null
