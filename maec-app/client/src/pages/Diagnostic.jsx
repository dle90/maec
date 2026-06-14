// Hỗ trợ chẩn đoán — standalone diagnostic decision-support page.
//
// Flow (matches POST /api/diagnostic/* endpoints):
//   1. Pick patient (optional — sessions work without one)
//   2. Capture complaint: free text + chip picker + qualifier dropdowns,
//      optionally run through LLM parser to pre-fill chips
//   3. Engine runs → red-flags + ranked differential + recommended next tests
//   4. Doctor enters observations (per-eye OD/OS) → engine re-ranks
//   5. Doctor excludes red-flags with a reason, or confirms a diagnosis
//   6. Outcome captured → writes to dxsessions (and Encounter when linked)
//
// Design notes:
// - Decision support ONLY. The bottom strip always carries the disclaimer.
// - Red-flags are sticky — once fired, they stay on the session until the
//   clinician actively excludes them. The UI fades excluded ones but keeps
//   them visible with the exclusion reason for the audit trail.
// - All findings entered as observations carry an OD/OS/OU eye qualifier.
// - The page is standalone (no encounter required), but accepts ?encounterId=
//   and ?patientId= via URL for deep-linking from Khám later.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api, {
  dxParseComplaint, dxParseTestResult, dxCreateSession, dxGetSession, dxUpdateComplaint,
  dxAddObservation, dxSyncExam, dxExcludeRedFlag, dxConfirmOutcome, dxGetTreatments, dxExplainDx,
} from '../api'
import { useLanguage } from '../context/LanguageContext'
import { pickLang } from './diagnostic.i18n'

// ── Symptom catalog ──
// Each symptom is added as a ROW that carries its own eye (OD/OS/OU) and, if
// `graded`, a severity. This folds the old "presence chip + severity dropdown"
// into one control and lets different symptoms sit in different eyes.
// `graded` maps the severity to engine inputs when the complaint is assembled:
//   pain    → pain qualifier + symptom tag (mild=pain, moderate=pain_severe_or_moderate, severe=pain_severe)
//   redness → redness qualifier only (the KB has no generic redness *finding*)
// `impliesOnset` / `impliesVision` auto-set those qualifiers from the symptom itself.
const SYMPTOMS = [
  { id: 'pain',                graded: 'pain',    label: 'Đau' },
  { id: 'redness',             graded: 'redness', label: 'Đỏ' },
  { id: 'vision_blur_gradual', impliesOnset: 'gradual',                       label: 'Mờ tăng dần' },
  { id: 'vision_loss_sudden',  impliesOnset: 'sudden', impliesVision: 'lost', label: 'Mất TL đột ngột' },
  { id: 'photophobia',         label: 'Sợ ánh sáng' },
  { id: 'halos',               label: 'Quầng sáng' },
  { id: 'flashes',             label: 'Chớp sáng' },
  { id: 'floaters_new',        label: 'Ruồi bay mới' },
  { id: 'curtain',             label: 'Màn che' },
  { id: 'diplopia_binocular',  label: 'Nhìn đôi' },
  { id: 'gritty_burning',      label: 'Cộm rát' },
  { id: 'itching',             label: 'Ngứa' },
  { id: 'discharge',           label: 'Tiết dịch' },
  { id: 'headache',            label: 'Đau đầu' },
  { id: 'nausea_vomiting',     label: 'Buồn nôn' },
]
const SYMPTOM_BY_ID = Object.fromEntries(SYMPTOMS.map(s => [s.id, s]))

// Severity ladders per graded axis (value → label).
const SEVERITY = {
  pain:    [['mild', 'Nhẹ'], ['moderate', 'Vừa'], ['severe', 'Dữ dội']],
  redness: [['mild', 'Nhẹ'], ['moderate', 'Vừa'], ['severe', 'Nặng']],
}
// Per-row onset ladder (each symptom carries its own onset now).
const ONSET_ROW = [['sudden', 'Cấp'], ['subacute', 'Bán cấp'], ['gradual', 'Từ từ']]
const ONSET_RANK = { unknown: 0, gradual: 1, subacute: 2, sudden: 3 }
const SEV_RANK = { unknown: 0, none: 0, mild: 1, moderate: 2, severe: 3 }
const EYE_TOGGLE = ['OD', 'OS', 'OU']

// Tiền sử / bối cảnh quick-pick catalogs (free additions allowed via the "+" input).
const SYSTEMIC_CHIPS  = ['Đái tháo đường', 'Tăng huyết áp', 'Bệnh tuyến giáp', 'Bệnh tự miễn']
const MED_CHIPS       = ['Chống đông', 'Corticoid', 'Thuốc hạ nhãn áp']
const FAMILY_CHIPS    = ['Glôcôm', 'Thoái hóa hoàng điểm', 'Lác / nhược thị']
const DURATION_UNITS  = [['hours', 'giờ'], ['days', 'ngày'], ['weeks', 'tuần'], ['months', 'tháng']]
const DURATION_TO_DAYS = { hours: 1 / 24, days: 1, weeks: 7, months: 30 }

// Assemble the engine-facing complaint from the symptom rows. The engine reads
// the flat `symptoms[]` + global qualifiers, so per-row onset/severity is
// flattened CONSERVATIVELY (most-urgent wins → red flags never missed); the
// full per-eye/per-symptom detail is preserved in `symptomDetails[]`.
function buildComplaintFromRows(rows, text, patientContext) {
  const symptoms = []
  let pain = 'unknown', redness = 'unknown', visionChange = 'unknown', onset = 'unknown'
  const eyes = new Set()
  const symptomDetails = []
  for (const r of rows) {
    if (r.eye) eyes.add(r.eye)
    const cfg = SYMPTOM_BY_ID[r.id]
    const rowOnset = (r.onset && r.onset !== 'unknown') ? r.onset : (cfg?.impliesOnset || null)
    symptomDetails.push({ findingId: r.id, eye: r.eye || null, severity: r.severity || null, onset: rowOnset || null })
    if (rowOnset && ONSET_RANK[rowOnset] > ONSET_RANK[onset]) onset = rowOnset
    if (cfg?.graded === 'pain') {
      if ((SEV_RANK[r.severity] || 0) > (SEV_RANK[pain] || 0)) pain = r.severity || pain
      symptoms.push(r.severity === 'severe' ? 'pain_severe' : r.severity === 'moderate' ? 'pain_severe_or_moderate' : 'pain')
    } else if (cfg?.graded === 'redness') {
      if ((SEV_RANK[r.severity] || 0) > (SEV_RANK[redness] || 0)) redness = r.severity || redness  // qualifier only — no redness finding
    } else {
      symptoms.push(r.id)
      if (cfg?.impliesVision) visionChange = cfg.impliesVision
    }
  }
  const eyeAffected = eyes.size === 1 ? [...eyes][0] : eyes.size > 1 ? 'OU' : 'unknown'
  return { text, symptoms, onset, pain, redness, visionChange, eyeAffected, symptomDetails, patientContext }
}

const URGENCY_LABEL = {
  emergency:        { label: 'CẤP CỨU',       cls: 'bg-red-100 text-red-800 border-red-300' },
  urgent_referral:  { label: 'KHẨN — chuyển', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
  urgent:           { label: 'Khẩn',          cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  routine:          { label: 'Thường',        cls: 'bg-gray-100 text-gray-700 border-gray-300' },
}

const SERVICE_DOT = {
  optical:      'bg-blue-500',
  sensor:       'bg-purple-500',
  transport:    'bg-indigo-500',
  coordination: 'bg-teal-500',
  surface:      'bg-cyan-500',
  pressure:     'bg-orange-500',
  vascular:     'bg-red-500',
  immune:       'bg-green-500',
  autonomic:    'bg-amber-500',
}

const DISCLAIMER_VI = 'Công cụ này chỉ hỗ trợ chẩn đoán — bác sĩ chịu trách nhiệm chẩn đoán cuối cùng và quyết định điều trị.'

// ─────────────────────────────────────────────────────────────────
// Standalone route (/diagnostic): page chrome + the assistant.
// ─────────────────────────────────────────────────────────────────
export default function Diagnostic() {
  const [searchParams] = useSearchParams()
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-4">
        <DiagnosticAssistant
          initialPatientId={searchParams.get('patientId') || ''}
          initialEncounterId={searchParams.get('encounterId') || ''}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Reusable assistant — owns the session lifecycle. Standalone shows a patient
// picker; `embedded` (e.g. inside the Khám encounter) takes patient/encounter
// from props and calls `onConfirmed(session)` when the session is closed so the
// host can write the diagnosis/treatment back to the encounter.
// ─────────────────────────────────────────────────────────────────
export function DiagnosticAssistant({ initialPatientId = '', initialEncounterId = '', embedded = false, onConfirmed }) {
  const [patient, setPatient]     = useState(null)   // {patientId, name, dob, gender}
  const [encounterId, setEncId]   = useState(initialEncounterId)
  const [session, setSession]     = useState(null)   // engine response, or null before first run
  const [formKey, setFormKey]     = useState(0)      // bump to reset the (persistent) complaint form
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')
  const [syncedExam, setSyncedExam] = useState(null)   // last exam-sync summary (for the note)
  const autoSyncedRef = useRef(false)
  const { t: tr } = useLanguage()

  useEffect(() => {
    if (!initialPatientId) return
    api.get('/registration/patients', { params: { q: initialPatientId, limit: 1 } })
      .then(r => { if (r.data?.[0]) setPatient(r.data[0]) })
      .catch(() => {})
  }, [initialPatientId])

  // Pull the encounter's recorded exam values (IOP, refraction, VA, …) into the dx
  // session so the engine reacts to incidental screening findings even with no
  // complaint. Creates a blank session if none yet. Idempotent (server supersedes
  // per-test rows), so the button can re-sync after more exam data is entered.
  async function syncExam() {
    if (!encounterId) return
    setBusy(true); setError('')
    try {
      let s = session
      if (!s || s.clinicianOutcome?.closedAt) {
        s = await dxCreateSession({
          patientId: patient?.patientId || patient?._id || initialPatientId || undefined,
          encounterId,
          complaint: { text: '', symptoms: [], onset: 'unknown', pain: 'unknown', redness: 'unknown', visionChange: 'unknown', eyeAffected: 'unknown', patientContext: {} },
        })
      }
      const updated = await dxSyncExam(s._id, encounterId)
      setSession(updated)
      setSyncedExam(updated.syncedExam || [])
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally { setBusy(false) }
  }

  // Embedded in Khám: auto-pull exam findings once when the assistant opens, if no
  // session exists yet. (The section only mounts when the clinician expands it.)
  useEffect(() => {
    if (!embedded || !initialEncounterId || session || autoSyncedRef.current) return
    autoSyncedRef.current = true
    syncExam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, initialEncounterId])

  // Single submit path: create the session on first run, then update the open
  // session's complaint on subsequent runs (so the form stays editable and the
  // doctor can add symptoms revealed during the exam without losing results).
  async function handleComplaint(complaint) {
    setBusy(true); setError('')
    try {
      const result = (session && !session.clinicianOutcome?.closedAt)
        ? await dxUpdateComplaint(session._id, complaint)
        : await dxCreateSession({
            patientId: patient?.patientId || patient?._id || initialPatientId || undefined,
            encounterId: encounterId || undefined,
            complaint,
          })
      setSession(result)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally { setBusy(false) }
  }

  async function handleAddObservation(obs) {
    if (!session) return
    setBusy(true); setError('')
    try {
      const updated = await dxAddObservation(session._id, obs)
      setSession(updated)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally { setBusy(false) }
  }

  async function handleExcludeRedFlag(redFlagId, reason) {
    if (!session) return
    setBusy(true); setError('')
    try {
      const updated = await dxExcludeRedFlag(session._id, redFlagId, { reason })
      setSession(updated)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally { setBusy(false) }
  }

  async function handleConfirmOutcome(payload) {
    if (!session) return
    setBusy(true); setError('')
    try {
      const updated = await dxConfirmOutcome(session._id, payload)
      setSession(updated)
      // On final save (close), let the host (e.g. Khám) write the result back.
      if (updated.clinicianOutcome?.closedAt && onConfirmed) onConfirmed(updated)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally { setBusy(false) }
  }

  function handleReset() {
    if (!confirm(tr('Bắt đầu phiên mới? Phiên hiện tại đã lưu trong hệ thống.'))) return
    setSession(null)
    setFormKey(k => k + 1)   // remount the form to clear it
    setError('')
  }

  // A "blank" session: analysis ran but there is nothing to act on yet — no exam
  // findings entered, no candidates, no red flags. Common for a routine check-up of
  // an asymptomatic patient. Show a friendly ready-state instead of a stack of empty
  // panels (the next-tests panel otherwise shows a misleading "enough info" note).
  const liveObsCount = (session?.observations || []).filter(o => !o.amended && !o.supersededBy).length
  const isBlank = !!session && !session.clinicianOutcome?.closedAt
    && (session.differential || []).length === 0
    && (session.redFlags || []).length === 0
    && liveObsCount === 0

  return (
    <div className="space-y-4">
      <Header
        patient={patient}
        setPatient={setPatient}
        encounterId={encounterId}
        setEncId={setEncId}
        session={session}
        onReset={handleReset}
        embedded={embedded}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
          <strong>{tr('Lỗi:')}</strong> {error}
        </div>
      )}

      {/* Complaint form is persistent — stays editable alongside results so new
          symptoms found during the exam can be added without losing the session. */}
      <ComplaintForm key={formKey} onSubmit={handleComplaint} busy={busy} hasSession={!!session} />

      {/* Embedded in Khám: pull this encounter's recorded exam values into the engine
          (auto on open; re-sync after entering more results). */}
      {embedded && encounterId && (
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <button onClick={syncExam} disabled={busy}
            className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 disabled:opacity-50">
            {tr('🔄 Lấy kết quả khám vào trợ lý')}
          </button>
          {syncedExam && (syncedExam.length
            ? <span className="text-gray-500">{tr('Đã lấy:')} {syncedExam.map(s => s.label).join(', ')}</span>
            : <span className="text-gray-400 italic">{tr('Chưa có kết quả khám dạng số để lấy.')}</span>
          )}
        </div>
      )}

      {session && (
        <>
          <RedFlagPanel
            redFlags={session.redFlags || []}
            onExclude={handleExcludeRedFlag}
            outcomeClosed={!!session.clinicianOutcome?.closedAt}
          />
          {isBlank ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm">
              <div className="font-medium text-emerald-800 mb-1">{tr('🟢 Trợ lý sẵn sàng')}</div>
              <p className="text-emerald-700">
                {tr('Chưa có triệu chứng hay dấu hiệu bất thường — với khám định kỳ thì đây là bình thường, không có gì để cảnh báo. Thêm triệu chứng ở khung trên khi có; khi khám phát hiện dấu hiệu bất thường (vd. nhãn áp cao, tổn thương đáy mắt) trợ lý sẽ tự đưa ra gợi ý chẩn đoán.')}
              </p>
            </div>
          ) : (
            <>
              <NextTestsPanel
                tests={session.recommendedNextTests || []}
                observations={session.observations || []}
                onAddObservation={handleAddObservation}
                busy={busy}
              />
              <DifferentialPanel
                sessionId={session._id}
                differential={session.differential || []}
                outcome={session.clinicianOutcome}
                onConfirm={handleConfirmOutcome}
                busy={busy}
              />
            </>
          )}
          <OutcomePanel
            session={session}
            onConfirm={handleConfirmOutcome}
            busy={busy}
          />
        </>
      )}

      <footer className="text-xs text-gray-500 italic pt-4 border-t border-gray-200">
        ⚙ {tr(DISCLAIMER_VI)}
      </footer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Header: patient picker + encounter id + session id
// ─────────────────────────────────────────────────────────────────
function Header({ patient, setPatient, encounterId, setEncId, session, onReset, embedded = false }) {
  const { t: tr, lang, setLang } = useLanguage()
  return (
    <div className={`bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-3 ${embedded ? '' : 'sticky top-0 z-10'}`}>
      <div className="font-semibold text-lg text-gray-800">{tr('Hỗ trợ chẩn đoán')}</div>
      {/* Standalone shows a patient picker; embedded takes patient + encounter from the host. */}
      {!embedded && (
        <>
          <div className="flex-1 min-w-[260px]">
            {patient ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{patient.name}</span>
                <span className="font-mono text-gray-500 text-xs">{patient.patientId || patient._id}</span>
                <button onClick={() => setPatient(null)} className="text-xs text-blue-600 hover:underline">{tr('Đổi')}</button>
              </div>
            ) : (
              <InlinePatientPicker onPick={setPatient} />
            )}
          </div>
          <input
            value={encounterId}
            onChange={e => setEncId(e.target.value)}
            placeholder={tr('Lượt khám (tuỳ chọn)')}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 font-mono"
            disabled={!!session}
          />
        </>
      )}
      {embedded && <div className="flex-1" />}
      {/* EN / VN language toggle (dx assistant only) */}
      <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
        {['vi', 'en'].map(l => (
          <button key={l} onClick={() => setLang(l)}
            className={`px-2.5 py-1.5 ${lang === l ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            {l === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
          </button>
        ))}
      </div>
      {session && (
        <>
          <span className="text-xs text-gray-500 font-mono">{session._id}</span>
          <button onClick={onReset} className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">{tr('+ Phiên mới')}</button>
        </>
      )}
    </div>
  )
}

function InlinePatientPicker({ onPick }) {
  const { t: tr } = useLanguage()
  const [q, setQ]         = useState('')
  const [results, setRes] = useState([])
  const [open, setOpen]   = useState(false)
  const [loading, setLd]  = useState(false)
  const debRef = useRef(null)

  useEffect(() => {
    if (!q.trim()) { setRes([]); return }
    setLd(true)
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(async () => {
      try {
        const r = await api.get('/registration/patients', { params: { q, limit: 8 } })
        setRes(r.data || []); setOpen(true)
      } catch { setRes([]) }
      setLd(false)
    }, 200)
    return () => debRef.current && clearTimeout(debRef.current)
  }, [q])

  return (
    <div className="relative">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={tr('Tìm bệnh nhân (tên / SĐT / mã)...')}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full focus:border-blue-400 focus:ring-2 focus:ring-blue-50 focus:outline-none"
      />
      {loading && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-80 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20">
          {results.map(p => (
            <button key={p._id} onMouseDown={() => { onPick(p); setQ(''); setRes([]); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0">
              <div className="text-sm font-medium text-gray-800">{p.name}</div>
              <div className="text-xs text-gray-500 font-mono">{p.patientId || p._id} · {p.phone || '—'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Complaint form — free text + per-symptom rows (eye + onset + severity) + LLM.
// Persistent: stays editable after a session exists so the doctor can add a
// symptom revealed during the exam (onSubmit then re-runs on the open session).
// ─────────────────────────────────────────────────────────────────
function ComplaintForm({ onSubmit, busy, hasSession }) {
  const { t: tr } = useLanguage()
  const [text, setText]   = useState('')
  const [rows, setRows]   = useState([])        // [{ key, id, label, graded, eye, severity, onset }]
  const [age, setAge]     = useState('')
  const [sex, setSex]     = useState('unknown')
  const [cl, setCL]       = useState(null)       // null | true | false
  const [trauma, setTrauma] = useState(null)
  const [postOp, setPostOp] = useState(null)
  const [pregnant, setPregnant] = useState(null)
  const [smoker, setSmoker] = useState(null)
  const [systemic, setSystemic] = useState([])
  const [meds, setMeds]   = useState([])
  const [family, setFamily] = useState([])
  const [durVal, setDurVal]   = useState('')
  const [durUnit, setDurUnit] = useState('days')
  const [parsing, setParsing] = useState(false)
  const [parseInfo, setParseInfo] = useState(null)
  const [parseErr, setParseErr]   = useState('')
  const keyCtr = useRef(0)

  const newRow = (id, { eye = 'OU', severity, onset } = {}) => {
    const cfg = SYMPTOM_BY_ID[id] || { id, label: id }
    return {
      key: `r${keyCtr.current++}`, id, label: cfg.label, graded: cfg.graded || null,
      eye, severity: severity ?? (cfg.graded ? 'moderate' : null),
      onset: onset ?? (cfg.impliesOnset || 'unknown'),
    }
  }
  const addRow    = (id) => setRows(rs => [...rs, newRow(id)])
  const removeRow = (key) => setRows(rs => rs.filter(r => r.key !== key))
  const updateRow = (key, patch) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r))
  const countOf   = (id) => rows.filter(r => r.id === id).length

  function buildContext() {
    return {
      ageYears: age ? Number(age) : null,
      sex,
      isContactLensWearer: cl,
      recentTrauma: trauma,
      recentIntraocularSurgeryOrInjection: postOp,
      pregnantOrLactating: sex === 'F' ? pregnant : null,
      smoker,
      systemic, medications: meds, familyHistory: family, allergies: [],
    }
  }

  async function runParser() {
    if (!text.trim()) return
    setParsing(true); setParseErr(''); setParseInfo(null)
    try {
      const result = await dxParseComplaint(text.trim())
      const c = result.complaint
      const eye = c.eyeAffected && c.eyeAffected !== 'unknown' ? c.eyeAffected : 'OU'
      const onset = c.onset && c.onset !== 'unknown' ? c.onset : undefined
      const have = new Set(rows.map(r => r.id))   // don't double-add symptoms already present
      const added = []
      const addRowParsed = (id, severity) => {
        if (have.has(id)) return
        have.add(id)
        added.push(newRow(id, { eye, severity, onset }))
      }
      for (const tag of c.symptoms || []) {
        if (tag === 'pain_severe') addRowParsed('pain', 'severe')
        else if (tag === 'pain_severe_or_moderate') addRowParsed('pain', 'moderate')
        else if (tag === 'pain') addRowParsed('pain', c.pain !== 'unknown' ? c.pain : 'mild')
        else addRowParsed(tag)
      }
      if (c.pain && !['unknown', 'none'].includes(c.pain)) addRowParsed('pain', c.pain)
      if (c.redness && !['unknown', 'none'].includes(c.redness)) addRowParsed('redness', c.redness)
      if (added.length) setRows(rs => [...rs, ...added])
      if (c.patientContext?.ageYears) setAge(String(c.patientContext.ageYears))
      if (c.patientContext?.sex && c.patientContext.sex !== 'unknown') setSex(c.patientContext.sex)
      if (typeof c.patientContext?.isContactLensWearer === 'boolean')  setCL(c.patientContext.isContactLensWearer)
      if (typeof c.patientContext?.recentTrauma === 'boolean')         setTrauma(c.patientContext.recentTrauma)
      if (typeof c.patientContext?.recentIntraocularSurgeryOrInjection === 'boolean') setPostOp(c.patientContext.recentIntraocularSurgeryOrInjection)
      setParseInfo({ confidence: result.confidence, explanationVi: result.explanationVi, dropped: result.droppedUnknownTags })
    } catch (err) {
      const code = err.response?.data?.code
      if (code === 'LLM_NOT_CONFIGURED') setParseErr(tr('Trình phân tích AI chưa được cấu hình. Vui lòng chọn triệu chứng thủ công bên dưới.'))
      else setParseErr(err.response?.data?.error || err.message)
    } finally { setParsing(false) }
  }

  function submit() {
    const complaint = buildComplaintFromRows(rows, text.trim(), buildContext())
    if (durVal && Number(durVal) > 0) complaint.durationDays = Number(durVal) * DURATION_TO_DAYS[durUnit]
    onSubmit(complaint)
  }

  const canRun = rows.length > 0 || text.trim().length > 5

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{tr('1. Lý do đến khám (tiếng Việt tự do)')}</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={tr('VD: "Mắt phải đau dữ dội 4 giờ nay, đỏ, thấy quầng sáng quanh đèn, buồn nôn"')}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-20 focus:border-blue-400 focus:ring-2 focus:ring-blue-50 focus:outline-none"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={runParser}
            disabled={parsing || !text.trim()}
            className="text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg"
          >
            {parsing ? tr('⏳ Đang phân tích...') : tr('✨ Phân tích bằng AI')}
          </button>
          <span className="text-xs text-gray-500">{tr('Tự thêm triệu chứng bên dưới. Bác sĩ kiểm tra mắt, khởi phát & mức độ trước khi chạy.')}</span>
        </div>
        {parseErr && <div className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">{parseErr}</div>}
        {parseInfo && (
          <div className={`mt-2 text-xs rounded-lg p-2 ${parseInfo.confidence === 'high' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-blue-50 border border-blue-200 text-blue-800'}`}>
            <strong>{tr('Độ tin cậy')}: {parseInfo.confidence}.</strong> {parseInfo.explanationVi}
            {parseInfo.dropped?.length > 0 && <div className="mt-1 text-amber-700">⚠ {tr('Bỏ qua tag không hợp lệ')}: {parseInfo.dropped.join(', ')}</div>}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {tr('2. Triệu chứng')} <span className="text-xs font-normal text-gray-500">{tr('— bấm để thêm (có thể thêm cùng triệu chứng cho 2 mắt); ghi rõ mắt, khởi phát & mức độ từng dòng')}</span>
        </label>
        <div className="flex flex-wrap gap-2 mb-3">
          {SYMPTOMS.map(s => {
            const n = countOf(s.id)
            return (
              <button
                key={s.id}
                onClick={() => addRow(s.id)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  n > 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300'
                }`}
              >+ {tr(s.label)}{n > 0 && <span className="ml-1 opacity-80">({n})</span>}</button>
            )
          })}
        </div>
        {rows.length === 0 ? (
          <div className="text-xs text-gray-400 italic">{tr('Chưa chọn triệu chứng nào.')}</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map(r => (
              <div key={r.key} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 flex-wrap">
                <span className="text-sm font-medium text-gray-800 w-32 shrink-0">{tr(r.label)}</span>
                <span className="text-xs text-gray-500">{tr('Mắt:')}</span>
                {EYE_TOGGLE.map(e => (
                  <button key={e} onClick={() => updateRow(r.key, { eye: e })}
                    className={`text-xs px-2 py-0.5 rounded ${r.eye === e ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 hover:bg-gray-100'}`}>{e}</button>
                ))}
                <span className="text-xs text-gray-500 ml-2">{tr('Khởi phát:')}</span>
                {ONSET_ROW.map(([v, l]) => (
                  <button key={v} onClick={() => updateRow(r.key, { onset: r.onset === v ? 'unknown' : v })}
                    className={`text-xs px-2 py-0.5 rounded ${r.onset === v ? 'bg-indigo-500 text-white' : 'bg-white border border-gray-200 hover:bg-gray-100'}`}>{tr(l)}</button>
                ))}
                {r.graded && (
                  <>
                    <span className="text-xs text-gray-500 ml-2">{tr('Mức độ:')}</span>
                    {SEVERITY[r.graded].map(([v, l]) => (
                      <button key={v} onClick={() => updateRow(r.key, { severity: v })}
                        className={`text-xs px-2 py-0.5 rounded ${r.severity === v ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 hover:bg-gray-100'}`}>{tr(l)}</button>
                    ))}
                  </>
                )}
                <button onClick={() => removeRow(r.key)} className="ml-auto text-gray-400 hover:text-red-500" title={tr('Bỏ')}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{tr('3. Tiền sử / bối cảnh')}</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 items-center mb-3">
          <input type="number" value={age} onChange={e => setAge(e.target.value)}
            placeholder={tr('Tuổi')} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <SelectField value={sex} onChange={setSex} opts={[['unknown', '— Giới —'], ['M', 'Nam'], ['F', 'Nữ']]} />
          <div className="flex items-center gap-1">
            <input type="number" value={durVal} onChange={e => setDurVal(e.target.value)}
              placeholder={tr('Thời gian bị')} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-24" />
            <SelectField value={durUnit} onChange={setDurUnit} opts={DURATION_UNITS} />
          </div>
          <TristateChip label="Đeo kính tiếp xúc" value={cl} onChange={setCL} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3">
          <TristateChip label="Chấn thương gần đây" value={trauma} onChange={setTrauma} />
          <TristateChip label="Mổ/tiêm nội nhãn gần đây" value={postOp} onChange={setPostOp} />
          <TristateChip label="Hút thuốc" value={smoker} onChange={setSmoker} />
          {sex === 'F' && <TristateChip label="Có thai / cho con bú" value={pregnant} onChange={setPregnant} />}
        </div>
        <div className="space-y-2">
          <ChipMultiSelect label="Bệnh nền" options={SYSTEMIC_CHIPS} value={systemic} onChange={setSystemic} />
          <ChipMultiSelect label="Thuốc đang dùng" options={MED_CHIPS} value={meds} onChange={setMeds} />
          <ChipMultiSelect label="Tiền sử gia đình" options={FAMILY_CHIPS} value={family} onChange={setFamily} />
        </div>
      </div>

      <div className="pt-2 border-t border-gray-100 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !canRun}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium px-5 py-2 rounded-lg text-sm"
        >
          {busy ? tr('⏳ Đang chạy...') : hasSession ? tr('↻ Cập nhật triệu chứng') : tr('Chạy phân tích chẩn đoán →')}
        </button>
        {!canRun && <span className="text-xs text-gray-500">{tr('Cần chọn ít nhất 1 triệu chứng hoặc nhập mô tả tự do.')}</span>}
        {hasSession && canRun && <span className="text-xs text-gray-500">{tr('Thêm/bớt triệu chứng rồi cập nhật — kết quả khám phía dưới được giữ nguyên.')}</span>}
      </div>
    </div>
  )
}

// Multi-select chips with a free-text "+ thêm" input. value/onChange is a string[].
function ChipMultiSelect({ label, options, value, onChange }) {
  const { t: tr } = useLanguage()
  const [custom, setCustom] = useState('')
  const has = (o) => value.includes(o)
  const toggle = (o) => onChange(has(o) ? value.filter(v => v !== o) : [...value, o])
  const addCustom = () => { const v = custom.trim(); if (v && !value.includes(v)) onChange([...value, v]); setCustom('') }
  const customs = value.filter(v => !options.includes(v))
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-gray-600 w-28 shrink-0 pt-1">{tr(label)}:</span>
      <div className="flex flex-wrap gap-1.5 items-center flex-1">
        {options.map(o => (
          <button key={o} onClick={() => toggle(o)}
            className={`px-2 py-0.5 rounded-full border ${has(o) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 hover:border-blue-300'}`}>{tr(o)}</button>
        ))}
        {customs.map(o => (
          <button key={o} onClick={() => toggle(o)}
            className="px-2 py-0.5 rounded-full border bg-blue-600 text-white border-blue-600">{o} ✕</button>
        ))}
        <input value={custom} onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
          placeholder={tr('+ thêm')} className="border border-gray-200 rounded px-2 py-0.5 w-24" />
      </div>
    </div>
  )
}

function SelectField({ value, onChange, opts }) {
  const { t: tr } = useLanguage()
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
      {opts.map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
    </select>
  )
}

function TristateChip({ label, value, onChange }) {
  // null = unknown, true = yes, false = no
  const { t: tr } = useLanguage()
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-600">{tr(label)}:</span>
      {[
        [null, '?', value === null],
        [true, tr('Có'), value === true],
        [false, tr('Không'), value === false],
      ].map(([v, l, active]) => (
        <button key={String(v)} onClick={() => onChange(v)}
          className={`px-2 py-0.5 rounded ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >{l}</button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Red-flag panel — sticky banner with exclude flow
// ─────────────────────────────────────────────────────────────────
function RedFlagPanel({ redFlags, onExclude, outcomeClosed }) {
  const { t: tr, lang } = useLanguage()
  const [showExclude, setShowExclude] = useState(null)  // redFlagId being excluded
  const [reason, setReason] = useState('')

  if (redFlags.length === 0) return null

  const active   = redFlags.filter(rf => !rf.excludedAt)
  const excluded = redFlags.filter(rf =>  rf.excludedAt)

  return (
    <div className="space-y-2">
      {active.map(rf => (
        <div key={rf.redFlagId} className={`rounded-xl border-2 p-4 ${URGENCY_LABEL[rf.urgency]?.cls || 'bg-red-50 border-red-300'} shadow-sm`}>
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-lg">{pickLang(rf, lang)}</span>
                <span className={`text-xs px-2 py-0.5 rounded border ${URGENCY_LABEL[rf.urgency]?.cls || ''}`}>
                  {tr(URGENCY_LABEL[rf.urgency]?.label || rf.urgency)}
                </span>
              </div>
              <p className="text-sm">{lang === 'en' ? (rf.actionGuidanceEn || rf.actionGuidance) : rf.actionGuidance}</p>
              {!outcomeClosed && (
                <button onClick={() => { setShowExclude(rf.redFlagId); setReason('') }}
                  className="mt-2 text-xs text-gray-700 underline hover:no-underline">{tr('Loại trừ với lý do →')}</button>
              )}
            </div>
          </div>
          {showExclude === rf.redFlagId && (
            <div className="mt-3 pt-3 border-t border-current/20 flex items-center gap-2">
              <input value={reason} onChange={e => setReason(e.target.value)}
                placeholder={tr("Lý do loại trừ (vd: 'gonioscopy: góc mở')")}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
              <button onClick={() => { onExclude(rf.redFlagId, reason); setShowExclude(null) }}
                disabled={!reason.trim()}
                className="bg-gray-700 hover:bg-gray-800 disabled:bg-gray-300 text-white text-sm px-3 py-1.5 rounded-lg">{tr('Loại trừ')}</button>
              <button onClick={() => setShowExclude(null)} className="text-sm text-gray-600 hover:underline">{tr('Huỷ')}</button>
            </div>
          )}
        </div>
      ))}
      {excluded.map(rf => (
        <div key={rf.redFlagId} className="rounded-xl border border-gray-200 bg-gray-50 p-3 opacity-60">
          <div className="text-sm">
            <span className="line-through font-medium">{pickLang(rf, lang)}</span>
            <span className="ml-2 text-xs text-gray-600">{tr('— đã loại trừ:')} <em>{rf.excludedReason || tr('(không có lý do)')}</em></span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Differential panel
// ─────────────────────────────────────────────────────────────────
function DifferentialPanel({ sessionId, differential, outcome, onConfirm, busy }) {
  const { t: tr, lang } = useLanguage()
  const [expanded, setExp] = useState(new Set())
  const [aiExplain, setAiExplain] = useState({})   // diseaseId -> { lang, loading, error, data }

  function toggle(id) {
    const n = new Set(expanded)
    if (n.has(id)) n.delete(id); else n.add(id)
    setExp(n)
  }

  async function explainOne(d) {
    setAiExplain(s => ({ ...s, [d.diseaseId]: { lang, loading: true } }))
    try {
      const data = await dxExplainDx(sessionId, d.diseaseId, lang)
      setAiExplain(s => ({ ...s, [d.diseaseId]: { lang, data } }))
    } catch (err) {
      const msg = err.response?.data?.code === 'LLM_NOT_CONFIGURED'
        ? tr('Trình giải thích AI chưa được cấu hình.')
        : (err.response?.data?.error || err.message)
      setAiExplain(s => ({ ...s, [d.diseaseId]: { lang, error: msg } }))
    }
  }

  const confirmedId = outcome?.confirmedDiseaseId

  // Safety net: if the top candidate is an emergency / urgent-referral disease but
  // no red-flag rule fired for it (e.g. onset/severity weren't entered, so the
  // strict trigger didn't match), still surface its urgency so it isn't missed.
  const top = differential[0]
  const urgentTopUnflagged = top && (top.urgency === 'emergency' || top.urgency === 'urgent_referral') && !top.isRedFlagCandidate

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h2 className="text-base font-semibold text-gray-800 mb-3">{tr('Chẩn đoán phân biệt')}</h2>
      {urgentTopUnflagged && (
        <div className={`mb-3 rounded-lg border p-2.5 text-sm ${top.urgency === 'emergency' ? 'bg-red-50 border-red-300 text-red-800' : 'bg-orange-50 border-orange-300 text-orange-800'}`}>
          <strong>{top.urgency === 'emergency' ? tr('⚠ Cấp cứu tiềm tàng') : tr('⚠ Cần khẩn')}:</strong>{' '}
          {tr('Ứng cử viên hàng đầu')} “{pickLang(top, lang)}” {tr('được phân loại')} {tr(URGENCY_LABEL[top.urgency]?.label || top.urgency)}. {tr('Nếu lâm sàng phù hợp, xử trí khẩn; kiểm tra lại khởi phát & mức độ để bật cảnh báo đầy đủ.')}
        </div>
      )}
      {differential.length === 0 ? (
        <div className="text-sm text-gray-500 italic">{tr('Chưa có ứng cử viên — cần thêm triệu chứng hoặc dữ liệu khám.')}</div>
      ) : (
        <div className="space-y-1.5">
          {differential.map((d, i) => {
            const isConfirmed = confirmedId === d.diseaseId
            return (
              <div key={d.diseaseId}
                className={`rounded-lg border p-2.5 ${isConfirmed ? 'border-green-400 bg-green-50' : d.isRedFlagCandidate ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400 w-5">{i+1}</span>
                  {(d.services || []).slice(0, 2).map(s => (
                    <span key={s} className={`w-2.5 h-2.5 rounded-full ${SERVICE_DOT[s] || 'bg-gray-400'}`} title={s} />
                  ))}
                  <span className="flex-1 text-sm font-medium text-gray-800">{pickLang(d, lang)}</span>
                  {d.urgency && d.urgency !== 'routine' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${URGENCY_LABEL[d.urgency]?.cls || ''}`}>
                      {tr(URGENCY_LABEL[d.urgency]?.label || d.urgency)}
                    </span>
                  )}
                  {d.isRedFlagCandidate && <span className="text-xs text-orange-700">⚠</span>}
                  <span className="text-xs font-mono text-gray-600 w-12 text-right">{d.score.toFixed(2)}</span>
                  <button onClick={() => toggle(d.diseaseId)}
                    className="text-xs text-blue-600 hover:underline w-12 text-right">{expanded.has(d.diseaseId) ? '↑' : tr('Vì sao?')}</button>
                  {!outcome?.closedAt && (
                    <button onClick={() => onConfirm({ confirmedDiseaseId: d.diseaseId, confirmedDiseaseName: d.nameVi || d.name, accepted: true })}
                      disabled={busy || isConfirmed}
                      className={`text-xs px-2 py-1 rounded ${isConfirmed ? 'bg-green-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                      {isConfirmed ? tr('✓ Đã xác nhận') : tr('Xác nhận')}
                    </button>
                  )}
                </div>
                {expanded.has(d.diseaseId) && (() => {
                  const ai = aiExplain[d.diseaseId]
                  const fresh = ai && ai.lang === lang   // cached reasoning is for the current language
                  return (
                  <div className="mt-2 pl-7 text-xs text-gray-600 space-y-1">
                    <div><strong>{tr('Tóm tắt:')}</strong> {d.summary}</div>
                    {d.supportingFindings?.length > 0 && (
                      <div><strong>{tr('Bằng chứng:')}</strong> <span className="font-mono">{d.supportingFindings.join(', ')}</span></div>
                    )}
                    <div><strong>{tr('Mức độ khẩn:')}</strong> {tr(URGENCY_LABEL[d.urgency]?.label || d.urgency)}</div>
                    {!fresh && (
                      <button onClick={() => explainOne(d)} disabled={ai?.loading}
                        className="text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-2.5 py-1 rounded-lg mt-1">
                        {ai?.loading ? tr('⏳ Đang giải thích...') : tr('✨ Giải thích bằng AI')}
                      </button>
                    )}
                    {fresh && ai.error && <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5">{ai.error}</div>}
                    {fresh && ai.data && (
                      <div className="mt-1 p-2 bg-blue-50/60 border border-blue-100 rounded space-y-1 text-gray-700">
                        <div><strong>{tr('Lý do xếp hạng:')}</strong> {ai.data.rankingReason}</div>
                        {ai.data.supports?.length > 0 && <div><strong className="text-green-700">{tr('Ủng hộ:')}</strong> {ai.data.supports.join('; ')}</div>}
                        {ai.data.against?.length > 0 && <div><strong className="text-amber-700">{tr('Phản đối / lưu ý:')}</strong> {ai.data.against.join('; ')}</div>}
                        {ai.data.nextStep && <div><strong className="text-blue-700">{tr('Bước xác nhận:')}</strong> {ai.data.nextStep}</div>}
                      </div>
                    )}
                  </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Next tests panel — per-eye observation entry
// ─────────────────────────────────────────────────────────────────
function NextTestsPanel({ tests, observations, onAddObservation, busy }) {
  const { t: tr } = useLanguage()
  // Superseded rows (a re-entered measurement) are kept for audit but excluded here.
  const liveObs = useMemo(() => observations.filter(o => !o.amended && !o.supersededBy), [observations])
  const observedFindings = useMemo(() => new Set(liveObs.map(o => o.findingId).filter(Boolean)), [liveObs])
  const inClinic = tests.filter(t => t.availableInClinic !== false)
  const referral = tests.filter(t => t.availableInClinic === false)
  const hero = inClinic[0]
  const rest = inClinic.slice(1)

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold text-gray-800">{tr('🎯 Bước tiếp theo')}</h2>
        <span className="text-xs text-gray-500">{tr('Nhập kết quả → danh sách chẩn đoán cập nhật tự động')}</span>
      </div>
      {tests.length === 0 ? (
        <div className="text-sm text-gray-500 italic py-2">{tr('Đã có đủ thông tin — không cần thêm xét nghiệm. Chuyển sang xác nhận chẩn đoán.')}</div>
      ) : (
        <>
          {/* Hero card for the highest-utility test */}
          {hero && (
            <TestCard
              t={hero}
              isHero={true}
              observedFindings={observedFindings}
              onAddObservation={onAddObservation}
              busy={busy}
            />
          )}
          {rest.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {rest.map(t => (
                <TestCard
                  key={t.testId}
                  t={t}
                  isHero={false}
                  observedFindings={observedFindings}
                  onAddObservation={onAddObservation}
                  busy={busy}
                />
              ))}
            </div>
          )}
          {/* Gold-standard tests not done in-clinic — order or refer; result can
              still be entered when it comes back. */}
          {referral.length > 0 && (
            <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
              <div className="text-xs font-semibold text-amber-700 mb-1.5">↗ {tr('Cần chỉ định / chuyển (ngoài phòng khám)')}</div>
              <div className="space-y-1.5">
                {referral.map(t => (
                  <TestCard
                    key={t.testId}
                    t={t}
                    isHero={false}
                    observedFindings={observedFindings}
                    onAddObservation={onAddObservation}
                    busy={busy}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {liveObs.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="text-xs font-medium text-gray-600 mb-1">{tr('Đã ghi nhận')} ({liveObs.length}):</div>
          <div className="space-y-0.5">
            {liveObs.map((o, i) => (
              <div key={i} className="text-xs flex items-center gap-2">
                <span className="font-mono w-12 text-gray-600">{o.eye || '—'}</span>
                <span className="flex-1 font-mono">
                  {o.findingId || o.measurementKey}
                  {o.source === 'derived' && <span className="ml-1 text-blue-500 not-italic">{tr('↳ tự suy ra')}</span>}
                </span>
                {o.value !== undefined && o.value !== null && o.value !== '' && (
                  <span className="text-gray-700">{o.value} {o.unit}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// One card per recommended test. Measurement-aware: tests with a `measurements`
// spec render per-eye numeric/enum inputs (the engine derives findings from the
// values via thresholds); tests with qualitative signs render finding chips. A
// test can have BOTH (e.g. OCT macula: CMT value + fluid signs).
function TestCard({ t, isHero, observedFindings, onAddObservation, busy }) {
  const { t: tr, lang } = useLanguage()
  const [open, setOpen] = useState(isHero)  // hero auto-expands

  // Typed measurement fields (skip computed/derived-only like SE).
  const measurements = (t.measurements || []).filter(m => m.input !== false)
  // Findings produced by a measurement threshold — entered as numbers, not chips.
  const derivedIds = useMemo(
    () => new Set((t.measurements || []).flatMap(m => (m.derives || []).map(d => d.finding))),
    [t.testId])
  // Qualitative signs the clinician records directly.
  const manualFindings = (t.producesFindings || []).filter(f => !derivedIds.has(f))

  // Per-eye measurement values, keyed "OD:sphere" → string.
  const [mvals, setMvals] = useState({})
  const setMv = (eye, key, v) => setMvals(s => ({ ...s, [`${eye}:${key}`]: v }))
  useEffect(() => { setMvals({}) }, [t.testId])

  async function submitMeasurements() {
    const byEye = {}
    for (const m of measurements) {
      const eyes = m.perEye === false ? ['OU'] : ['OD', 'OS', 'OU']
      for (const eye of eyes) {
        const raw = mvals[`${eye}:${m.key}`]
        if (raw === undefined || raw === '') continue
        byEye[eye] = byEye[eye] || {}
        byEye[eye][m.key] = m.valueType === 'number' ? Number(raw) : raw
      }
    }
    if (Object.keys(byEye).length === 0) return
    await onAddObservation({ testId: t.testId, measurements: byEye })
    setMvals({})
  }

  // Categorical-sign entry.
  const [eye, setEye] = useState('OD')
  const [picked, setPicked] = useState(manualFindings[0] || '')
  useEffect(() => { setPicked(manualFindings[0] || '') }, [t.testId])
  async function submitFinding() {
    if (!picked) return
    await onAddObservation({ findingId: picked, eye, source: 'manual', testId: t.testId })
  }

  // Free-text result → AI parse → reviewable suggested findings (clinician confirms).
  const [desc, setDesc] = useState('')
  const [descParsing, setDescParsing] = useState(false)
  const [descErr, setDescErr] = useState('')
  const [parsed, setParsed] = useState([])   // [{findingId, eye, confidence}]
  async function runResultParser() {
    if (!desc.trim()) return
    setDescParsing(true); setDescErr(''); setParsed([])
    try {
      const r = await dxParseTestResult(t.testId, desc.trim())
      setParsed(r.findings || [])
      if (!(r.findings || []).length) setDescErr(r.explanationVi || 'AI không tìm thấy dấu hiệu nào trong mô tả.')
    } catch (err) {
      setDescErr(err.response?.data?.code === 'LLM_NOT_CONFIGURED'
        ? 'Trình phân tích AI chưa được cấu hình. Vui lòng chọn dấu hiệu thủ công.'
        : (err.response?.data?.error || err.message))
    } finally { setDescParsing(false) }
  }
  async function addParsed(f) {
    await onAddObservation({ findingId: f.findingId, eye: f.eye || eye, source: 'llm_assisted', testId: t.testId })
    setParsed(ps => ps.filter(x => x !== f))
  }

  const wrap = isHero
    ? 'rounded-xl border-2 border-blue-400 bg-blue-50/40 p-3 shadow-sm'
    : 'rounded-lg border border-gray-200 bg-white p-2.5'
  const hasPerEye = measurements.some(m => m.perEye !== false)

  return (
    <div className={wrap}>
      <div className="flex items-center gap-2">
        {isHero && <span className="text-blue-600 text-sm font-semibold">{tr('⭐ Ưu tiên')}</span>}
        <span className={`flex-1 ${isHero ? 'text-base font-semibold' : 'text-sm font-medium'} text-gray-800`}>{pickLang(t, lang)}</span>
        {t.availableInClinic === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">{tr('↗ chuyển')}</span>}
        <span className="text-xs text-gray-500 font-mono">{t.svcCode}</span>
        <span className="text-xs font-mono text-gray-600 w-12 text-right">{t.expectedUtility.toFixed(2)}</span>
        <button onClick={() => setOpen(!open)}
          className={`text-xs px-2.5 py-1 rounded ${isHero ? 'bg-blue-600 hover:bg-blue-700 text-white font-medium' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
          {open ? '↑' : tr('💾 Nhập KQ')}
        </button>
      </div>
      <div className="pl-1 mt-1 text-xs text-gray-500">{t.rationale}</div>
      {open && (
        <div className="mt-2 pt-2 border-t border-gray-200 space-y-3">
          {/* ── Numeric / structured measurements (per-eye) ── */}
          {measurements.length > 0 && (
            <div className="space-y-1">
              {hasPerEye && (
                <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium">
                  <span className="flex-1" />
                  <span className="w-16 text-center">OD (P)</span>
                  <span className="w-16 text-center">OS (T)</span>
                  <span className="w-16 text-center">OU</span>
                </div>
              )}
              {measurements.map(m => (
                <div key={m.key} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 text-gray-700">
                    {lang === 'en' ? (m.label || m.labelVi) : (m.labelVi || m.label)}{m.unit && <span className="text-gray-400"> ({m.unit})</span>}
                  </span>
                  {(m.perEye === false ? ['OU'] : ['OD', 'OS', 'OU']).map(e => (
                    <input
                      key={e}
                      type={m.valueType === 'number' ? 'number' : 'text'}
                      step={m.step} min={m.min} max={m.max}
                      placeholder={m.perEye === false ? '' : e}
                      value={mvals[`${e}:${m.key}`] ?? ''}
                      onChange={ev => setMv(e, m.key, ev.target.value)}
                      className={`border border-gray-200 rounded px-2 py-1 text-xs text-right ${m.perEye === false ? 'w-24' : 'w-16'} focus:border-blue-400 focus:outline-none`}
                    />
                  ))}
                </div>
              ))}
              <div className="pt-1">
                <button onClick={submitMeasurements} disabled={busy}
                  className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg">
                  {tr('💾 Lưu kết quả')}
                </button>
              </div>
            </div>
          )}

          {/* ── Qualitative signs (chips) ── */}
          {manualFindings.length > 0 && (
            <div className="space-y-2">
              {measurements.length > 0 && <div className="text-xs text-gray-500 font-medium">{tr('Dấu hiệu quan sát:')}</div>}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-600">{tr('Mắt:')}</span>
                {['OD', 'OS', 'OU'].map(e => (
                  <button key={e} onClick={() => setEye(e)}
                    className={`px-2 py-0.5 rounded ${eye === e ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{e}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {manualFindings.map(f => (
                  <button key={f} onClick={() => setPicked(f)}
                    className={`text-xs px-2 py-1 rounded border ${picked === f ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-gray-200 hover:border-blue-300'} ${observedFindings.has(f) ? 'opacity-60' : ''}`}>
                    {f} {observedFindings.has(f) && '✓'}
                  </button>
                ))}
              </div>
              <button onClick={submitFinding} disabled={busy || !picked}
                className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg">{tr('Lưu dấu hiệu')}</button>

              {/* Free-text result → AI → reviewable findings (clinician confirms each). */}
              <div className="pt-2 mt-1 border-t border-dashed border-gray-200 space-y-1.5">
                <textarea value={desc} onChange={e => setDesc(e.target.value)}
                  placeholder={tr('Mô tả kết quả khám (tự do)...')}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs h-14 focus:border-purple-400 focus:outline-none" />
                <button onClick={runResultParser} disabled={descParsing || !desc.trim()}
                  className="text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg">
                  {descParsing ? tr('⏳ Đang phân tích KQ...') : tr('✨ Phân tích KQ bằng AI')}
                </button>
                {descErr && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5">{descErr}</div>}
                {parsed.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">{tr('AI gợi ý — bấm để thêm dấu hiệu:')}</span>
                      <button onClick={() => parsed.slice().forEach(addParsed)} disabled={busy}
                        className="text-[11px] text-blue-600 hover:underline">{tr('Thêm tất cả')}</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {parsed.map((f, i) => (
                        <button key={i} onClick={() => addParsed(f)} disabled={busy}
                          className={`text-xs px-2 py-1 rounded border border-purple-300 hover:bg-purple-50 ${f.confidence === 'low' ? 'opacity-60' : ''}`}
                          title={`confidence: ${f.confidence}`}>
                          + {f.findingId}{f.eye ? ` (${f.eye})` : ''} {f.confidence !== 'high' && <span className="text-amber-600">?</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Outcome panel + treatment suggestions
// ─────────────────────────────────────────────────────────────────
// Treatment categories — display label + ordering for the grouped suggestion list.
const TREATMENT_CATEGORY = {
  spectacles:    { label: 'Kính gọng',               icon: '👓', order: 1 },
  contact_lens:  { label: 'Kính tiếp xúc',           icon: '👁️', order: 2 },
  optical_other: { label: 'Quang học khác',          icon: '🔭', order: 3 },
  medication:    { label: 'Thuốc',                   icon: '💊', order: 4 },
  procedure:     { label: 'Thủ thuật',               icon: '🩹', order: 5 },
  laser:         { label: 'Laser',                   icon: '⚡', order: 6 },
  injection:     { label: 'Tiêm',                    icon: '💉', order: 7 },
  surgery:       { label: 'Phẫu thuật',              icon: '🔪', order: 8 },
  systemic:      { label: 'Toàn thân / bệnh nền',    icon: '🩺', order: 9 },
  referral:      { label: 'Chuyển khám / hội chẩn',  icon: '➡️', order: 10 },
  lifestyle:     { label: 'Chăm sóc & lối sống',     icon: '🌿', order: 11 },
  monitoring:    { label: 'Theo dõi',                icon: '👀', order: 12 },
  supportive:    { label: 'Hỗ trợ',                  icon: '🤝', order: 13 },
}

// Treatment vocabulary (token → {nameVi, category}) fetched once, process-cached.
let _txVocabCache = null
function useTreatmentVocab() {
  const [vocab, setVocab] = useState(_txVocabCache || {})
  useEffect(() => {
    if (_txVocabCache) return
    dxGetTreatments()
      .then(list => { _txVocabCache = Object.fromEntries(list.map(t => [t._id, t])); setVocab(_txVocabCache) })
      .catch(() => {})
  }, [])
  return vocab
}

// Group an array of treatment tokens by category, ordered, with localized labels.
function groupTreatments(tokens, vocab, lang) {
  const g = {}
  for (const tok of tokens) {
    const meta = vocab[tok] || { nameVi: tok, category: 'supportive' }
    const cat = meta.category || 'supportive'
    const label = lang === 'en' ? (meta.name || meta.nameVi || tok) : (meta.nameVi || meta.name || tok)
    ;(g[cat] = g[cat] || []).push({ tok, label })
  }
  return Object.entries(g).sort((a, b) => (TREATMENT_CATEGORY[a[0]]?.order || 99) - (TREATMENT_CATEGORY[b[0]]?.order || 99))
}

function OutcomePanel({ session, onConfirm, busy }) {
  const { t: tr, lang } = useLanguage()
  const outcome = session.clinicianOutcome || {}
  const closed = !!outcome.closedAt
  const [notes, setNotes] = useState(outcome.notes || '')
  const [referred, setReferred] = useState(outcome.referred || false)
  const [referredReason, setRefReason] = useState(outcome.referredReason || '')
  const [chosenTreatments, setRx] = useState(new Set())
  const vocab = useTreatmentVocab()

  // Confirmed disease's suggested treatments (tokens surfaced on the differential entry).
  const confirmedDx = (session.differential || []).find(d => d.diseaseId === outcome.confirmedDiseaseId)
  const confirmedTreatments = confirmedDx?.treatments || []
  const grouped = useMemo(() => groupTreatments(confirmedTreatments, vocab, lang), [confirmedTreatments, vocab, lang])
  const chosenGrouped = useMemo(() => groupTreatments([...(outcome.selectedTreatments || [])], vocab, lang), [outcome.selectedTreatments, vocab, lang])

  function toggleRx(id) {
    const n = new Set(chosenTreatments)
    if (n.has(id)) n.delete(id); else n.add(id)
    setRx(n)
  }

  async function finalize() {
    await onConfirm({
      confirmedDiseaseId: outcome.confirmedDiseaseId,
      confirmedDiseaseName: outcome.confirmedDiseaseName,
      accepted: !referred,
      referred,
      referredReason: referred ? referredReason : '',
      selectedTreatments: [...chosenTreatments],
      notes,
      close: true,   // the final save is what closes the session
    })
  }

  if (!outcome.confirmedDiseaseId && !closed) return null

  return (
    <div className={`rounded-xl shadow-sm p-4 ${closed ? 'bg-green-50 border border-green-200' : 'bg-white'}`}>
      <h2 className="text-base font-semibold text-gray-800 mb-3">{tr('Kết luận & điều trị')}</h2>
      {outcome.confirmedDiseaseName && (
        <div className="text-sm mb-3">
          <strong>{tr('✓ Chẩn đoán xác nhận:')}</strong> {outcome.confirmedDiseaseName}
          <span className="ml-2 font-mono text-xs text-gray-500">{outcome.confirmedDiseaseId}</span>
        </div>
      )}
      {closed && (
        <div className="text-xs text-gray-600 mb-2">
          {tr('Đã đóng phiên lúc')} {new Date(outcome.closedAt).toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN')} · {outcome.closedBy || '—'}
        </div>
      )}

      {!closed && grouped.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-medium text-gray-700 mb-2">
            {tr('Đề xuất điều trị')} <span className="text-xs font-normal text-gray-500">{tr('— chọn nhóm phù hợp; bác sĩ kê đơn cụ thể')}</span>
          </div>
          <div className="space-y-2">
            {grouped.map(([cat, items]) => (
              <div key={cat} className="flex items-start gap-2">
                <span className="text-xs text-gray-500 w-40 shrink-0 pt-1.5">
                  {TREATMENT_CATEGORY[cat]?.icon} {tr(TREATMENT_CATEGORY[cat]?.label || cat)}
                </span>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {items.map(({ tok, label }) => (
                    <button key={tok} onClick={() => toggleRx(tok)} title={tok}
                      className={`text-xs px-2.5 py-1 rounded-full border ${chosenTreatments.has(tok) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!closed && (
        <>
          <div className="mb-3">
            <label className="block text-sm text-gray-700 mb-1">{tr('Ghi chú')}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={tr('Ghi chú lâm sàng, kế hoạch theo dõi...')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-20 focus:border-blue-400 focus:ring-2 focus:ring-blue-50 focus:outline-none" />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={referred} onChange={e => setReferred(e.target.checked)} />
              {tr('Chuyển khám chuyên khoa')}
            </label>
            {referred && (
              <input value={referredReason} onChange={e => setRefReason(e.target.value)}
                placeholder={tr('Lý do chuyển')}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            )}
          </div>
          <button onClick={finalize} disabled={busy}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-medium px-5 py-2 rounded-lg text-sm">
            {busy ? tr('⏳ Đang lưu...') : tr('Lưu vào hồ sơ & đóng phiên')}
          </button>
        </>
      )}

      {closed && chosenGrouped.length > 0 && (
        <div className="mt-3 mb-1">
          <div className="text-sm font-medium text-gray-700 mb-1.5">{tr('Điều trị đã chọn:')}</div>
          <div className="space-y-1">
            {chosenGrouped.map(([cat, items]) => (
              <div key={cat} className="flex items-start gap-2 text-sm">
                <span className="text-xs text-gray-500 w-40 shrink-0 pt-0.5">{TREATMENT_CATEGORY[cat]?.icon} {tr(TREATMENT_CATEGORY[cat]?.label || cat)}</span>
                <span className="flex-1 text-gray-800">{items.map(i => i.label).join(' · ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {closed && outcome.notes && (
        <div className="mt-3 text-sm text-gray-700 whitespace-pre-wrap bg-white rounded-lg p-3 border border-gray-200">{outcome.notes}</div>
      )}
    </div>
  )
}
