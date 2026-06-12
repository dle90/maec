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
  dxParseComplaint, dxCreateSession, dxGetSession,
  dxAddObservation, dxExcludeRedFlag, dxConfirmOutcome,
} from '../api'

// ── Quick-pick chips: 12 most common patient complaints, VN-first ──
// Each chip → finding tag. The order roughly follows clinic volume.
const SYMPTOM_CHIPS = [
  { id: 'pain',                  label: 'Đau' },
  { id: 'vision_blur_gradual',   label: 'Mờ tăng dần' },
  { id: 'vision_loss_sudden',    label: 'Mất TL đột ngột' },
  { id: 'halos',                 label: 'Quầng sáng' },
  { id: 'flashes',               label: 'Chớp sáng' },
  { id: 'floaters_new',          label: 'Ruồi bay mới' },
  { id: 'curtain',               label: 'Màn che' },
  { id: 'diplopia_binocular',    label: 'Nhìn đôi' },
  { id: 'gritty_burning',        label: 'Cộm rát' },
  { id: 'itching',               label: 'Ngứa' },
  { id: 'discharge',             label: 'Tiết dịch' },
  { id: 'photophobia',           label: 'Sợ ánh sáng' },
  { id: 'headache',              label: 'Đau đầu' },
  { id: 'nausea_vomiting',       label: 'Buồn nôn' },
]

const ONSET_OPTS    = [['unknown', '— Khởi phát —'], ['sudden', 'Đột ngột'], ['subacute', 'Bán cấp'], ['gradual', 'Từ từ']]
const PAIN_OPTS     = [['unknown', '— Đau —'], ['none', 'Không'], ['mild', 'Nhẹ'], ['moderate', 'Vừa'], ['severe', 'Dữ dội']]
const REDNESS_OPTS  = [['unknown', '— Đỏ —'], ['none', 'Không'], ['mild', 'Nhẹ'], ['moderate', 'Vừa'], ['severe', 'Nặng']]
const VISION_OPTS   = [['unknown', '— Thị lực —'], ['none', 'Không đổi'], ['mild', 'Mờ nhẹ'], ['severe', 'Mờ nhiều'], ['lost', 'Mất TL']]
const EYE_OPTS      = [['unknown', '—'], ['OD', 'OD (P)'], ['OS', 'OS (T)'], ['OU', 'OU (2 mắt)']]

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
// Top-level page
// ─────────────────────────────────────────────────────────────────
export default function Diagnostic() {
  const [searchParams] = useSearchParams()
  const seedPatientId  = searchParams.get('patientId')  || ''
  const seedEncounter  = searchParams.get('encounterId') || ''

  const [patient, setPatient]     = useState(null)   // {patientId, name, dob, gender}
  const [encounterId, setEncId]   = useState(seedEncounter)
  const [session, setSession]     = useState(null)   // engine response, or null before first run
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (!seedPatientId) return
    api.get('/registration/patients', { params: { q: seedPatientId, limit: 1 } })
      .then(r => { if (r.data?.[0]) setPatient(r.data[0]) })
      .catch(() => {})
  }, [seedPatientId])

  async function handleStart(complaint) {
    setBusy(true); setError('')
    try {
      const result = await dxCreateSession({
        patientId: patient?.patientId || patient?._id || undefined,
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
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally { setBusy(false) }
  }

  function handleReset() {
    if (!confirm('Bắt đầu phiên mới? Phiên hiện tại đã lưu trong hệ thống.')) return
    setSession(null)
    setError('')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-4">
        <Header
          patient={patient}
          setPatient={setPatient}
          encounterId={encounterId}
          setEncId={setEncId}
          session={session}
          onReset={handleReset}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
            <strong>Lỗi:</strong> {error}
          </div>
        )}

        {!session && (
          <ComplaintForm onSubmit={handleStart} busy={busy} />
        )}

        {session && (
          <>
            <RedFlagPanel
              redFlags={session.redFlags || []}
              onExclude={handleExcludeRedFlag}
              outcomeClosed={!!session.clinicianOutcome?.closedAt}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DifferentialPanel
                differential={session.differential || []}
                outcome={session.clinicianOutcome}
                onConfirm={handleConfirmOutcome}
                busy={busy}
              />
              <NextTestsPanel
                tests={session.recommendedNextTests || []}
                observations={session.observations || []}
                onAddObservation={handleAddObservation}
                busy={busy}
              />
            </div>
            <OutcomePanel
              session={session}
              onConfirm={handleConfirmOutcome}
              busy={busy}
            />
          </>
        )}

        <footer className="text-xs text-gray-500 italic pt-4 border-t border-gray-200">
          ⚙ {DISCLAIMER_VI}
        </footer>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Header: patient picker + encounter id + session id
// ─────────────────────────────────────────────────────────────────
function Header({ patient, setPatient, encounterId, setEncId, session, onReset }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-3 sticky top-0 z-10">
      <div className="font-semibold text-lg text-gray-800">Hỗ trợ chẩn đoán</div>
      <div className="flex-1 min-w-[260px]">
        {patient ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{patient.name}</span>
            <span className="font-mono text-gray-500 text-xs">{patient.patientId || patient._id}</span>
            <button onClick={() => setPatient(null)} className="text-xs text-blue-600 hover:underline">Đổi</button>
          </div>
        ) : (
          <InlinePatientPicker onPick={setPatient} />
        )}
      </div>
      <input
        value={encounterId}
        onChange={e => setEncId(e.target.value)}
        placeholder="Lượt khám (tuỳ chọn)"
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 font-mono"
        disabled={!!session}
      />
      {session && (
        <>
          <span className="text-xs text-gray-500 font-mono">{session._id}</span>
          <button onClick={onReset} className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">+ Phiên mới</button>
        </>
      )}
    </div>
  )
}

function InlinePatientPicker({ onPick }) {
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
        placeholder="Tìm bệnh nhân (tên / SĐT / mã)..."
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
// Complaint form — free text + chips + qualifier dropdowns + LLM
// ─────────────────────────────────────────────────────────────────
function ComplaintForm({ onSubmit, busy }) {
  const [text, setText]       = useState('')
  const [symptoms, setSym]    = useState(new Set())
  const [onset, setOnset]     = useState('unknown')
  const [pain, setPain]       = useState('unknown')
  const [redness, setRedness] = useState('unknown')
  const [vision, setVision]   = useState('unknown')
  const [eye, setEye]         = useState('unknown')
  const [age, setAge]         = useState('')
  const [sex, setSex]         = useState('unknown')
  const [cl, setCL]           = useState(null)        // null | true | false
  const [trauma, setTrauma]   = useState(null)
  const [postOp, setPostOp]   = useState(null)
  const [parsing, setParsing] = useState(false)
  const [parseInfo, setParseInfo] = useState(null)  // confidence + explanation + dropped
  const [parseErr, setParseErr]   = useState('')

  function toggleSym(id) {
    const next = new Set(symptoms)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSym(next)
  }

  async function runParser() {
    if (!text.trim()) return
    setParsing(true); setParseErr(''); setParseInfo(null)
    try {
      const result = await dxParseComplaint(text.trim())
      const c = result.complaint
      // Merge LLM extraction with whatever the doctor already entered (LLM wins on unknowns)
      const llmSet = new Set([...(symptoms || []), ...(c.symptoms || [])])
      setSym(llmSet)
      if (c.onset && c.onset !== 'unknown')           setOnset(c.onset)
      if (c.pain && c.pain !== 'unknown')             setPain(c.pain)
      if (c.redness && c.redness !== 'unknown')       setRedness(c.redness)
      if (c.visionChange && c.visionChange !== 'unknown') setVision(c.visionChange)
      if (c.eyeAffected && c.eyeAffected !== 'unknown')   setEye(c.eyeAffected)
      if (c.patientContext?.ageYears) setAge(String(c.patientContext.ageYears))
      if (c.patientContext?.sex && c.patientContext.sex !== 'unknown') setSex(c.patientContext.sex)
      if (typeof c.patientContext?.isContactLensWearer === 'boolean')  setCL(c.patientContext.isContactLensWearer)
      if (typeof c.patientContext?.recentTrauma === 'boolean')         setTrauma(c.patientContext.recentTrauma)
      if (typeof c.patientContext?.recentIntraocularSurgeryOrInjection === 'boolean')
        setPostOp(c.patientContext.recentIntraocularSurgeryOrInjection)
      setParseInfo({ confidence: result.confidence, explanationVi: result.explanationVi, dropped: result.droppedUnknownTags })
    } catch (err) {
      const code = err.response?.data?.code
      if (code === 'LLM_NOT_CONFIGURED') {
        setParseErr('Trình phân tích LLM chưa được cấu hình. Vui lòng nhập thủ công bằng các chip bên dưới.')
      } else {
        setParseErr(err.response?.data?.error || err.message)
      }
    } finally { setParsing(false) }
  }

  function submit() {
    const complaint = {
      text: text.trim(),
      symptoms: [...symptoms],
      onset, pain, redness, visionChange: vision, eyeAffected: eye,
      patientContext: {
        ageYears: age ? Number(age) : null,
        sex,
        isContactLensWearer: cl,
        recentTrauma: trauma,
        recentIntraocularSurgeryOrInjection: postOp,
      },
    }
    onSubmit(complaint)
  }

  const canRun = symptoms.size > 0 || text.trim().length > 5
  const symptomsArr = useMemo(() => SYMPTOM_CHIPS, [])

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">1. Lý do đến khám (tiếng Việt tự do)</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder='VD: "Mắt phải đau dữ dội 4 giờ nay, đỏ, thấy quầng sáng quanh đèn, buồn nôn"'
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-20 focus:border-blue-400 focus:ring-2 focus:ring-blue-50 focus:outline-none"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={runParser}
            disabled={parsing || !text.trim()}
            className="text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg"
          >
            {parsing ? '⏳ Đang phân tích...' : '✨ Phân tích bằng AI'}
          </button>
          <span className="text-xs text-gray-500">Tự điền các chip & dropdown bên dưới. Bác sĩ kiểm tra trước khi chạy.</span>
        </div>
        {parseErr && <div className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">{parseErr}</div>}
        {parseInfo && (
          <div className={`mt-2 text-xs rounded-lg p-2 ${parseInfo.confidence === 'high' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-blue-50 border border-blue-200 text-blue-800'}`}>
            <strong>Độ tin cậy: {parseInfo.confidence}.</strong> {parseInfo.explanationVi}
            {parseInfo.dropped?.length > 0 && <div className="mt-1 text-amber-700">⚠ Bỏ qua tag không hợp lệ: {parseInfo.dropped.join(', ')}</div>}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">2. Triệu chứng (chọn nhanh)</label>
        <div className="flex flex-wrap gap-2">
          {symptomsArr.map(c => (
            <button
              key={c.id}
              onClick={() => toggleSym(c.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                symptoms.has(c.id)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300'
              }`}
            >{c.label}</button>
          ))}
        </div>
        {symptoms.size > 0 && (
          <div className="text-xs text-gray-500 mt-2 font-mono">Đã chọn: {[...symptoms].join(' · ')}</div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">3. Đặc điểm</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <SelectField value={onset}   onChange={setOnset}   opts={ONSET_OPTS} />
          <SelectField value={pain}    onChange={setPain}    opts={PAIN_OPTS} />
          <SelectField value={redness} onChange={setRedness} opts={REDNESS_OPTS} />
          <SelectField value={vision}  onChange={setVision}  opts={VISION_OPTS} />
          <SelectField value={eye}     onChange={setEye}     opts={EYE_OPTS} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">4. Tiền sử / bối cảnh</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 items-center">
          <input type="number" value={age} onChange={e => setAge(e.target.value)}
            placeholder="Tuổi" className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <SelectField value={sex} onChange={setSex} opts={[['unknown', '— Giới —'], ['M', 'Nam'], ['F', 'Nữ']]} />
          <TristateChip label="Đeo CL" value={cl} onChange={setCL} />
          <TristateChip label="Chấn thương gần đây" value={trauma} onChange={setTrauma} />
          <TristateChip label="Mổ/tiêm nội nhãn gần đây" value={postOp} onChange={setPostOp} />
        </div>
      </div>

      <div className="pt-2 border-t border-gray-100 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !canRun}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium px-5 py-2 rounded-lg text-sm"
        >
          {busy ? '⏳ Đang chạy...' : 'Chạy phân tích chẩn đoán →'}
        </button>
        {!canRun && <span className="text-xs text-gray-500">Cần chọn ít nhất 1 triệu chứng hoặc nhập mô tả tự do.</span>}
      </div>
    </div>
  )
}

function SelectField({ value, onChange, opts }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function TristateChip({ label, value, onChange }) {
  // null = unknown, true = yes, false = no
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-600">{label}:</span>
      {[
        [null, '?', value === null],
        [true, 'Có', value === true],
        [false, 'Không', value === false],
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
                <span className="font-bold text-lg">{rf.nameVi || rf.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded border ${URGENCY_LABEL[rf.urgency]?.cls || ''}`}>
                  {URGENCY_LABEL[rf.urgency]?.label || rf.urgency}
                </span>
              </div>
              <p className="text-sm">{rf.actionGuidance}</p>
              {!outcomeClosed && (
                <button onClick={() => { setShowExclude(rf.redFlagId); setReason('') }}
                  className="mt-2 text-xs text-gray-700 underline hover:no-underline">Loại trừ với lý do →</button>
              )}
            </div>
          </div>
          {showExclude === rf.redFlagId && (
            <div className="mt-3 pt-3 border-t border-current/20 flex items-center gap-2">
              <input value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Lý do loại trừ (vd: 'gonioscopy: góc mở')"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
              <button onClick={() => { onExclude(rf.redFlagId, reason); setShowExclude(null) }}
                disabled={!reason.trim()}
                className="bg-gray-700 hover:bg-gray-800 disabled:bg-gray-300 text-white text-sm px-3 py-1.5 rounded-lg">Loại trừ</button>
              <button onClick={() => setShowExclude(null)} className="text-sm text-gray-600 hover:underline">Huỷ</button>
            </div>
          )}
        </div>
      ))}
      {excluded.map(rf => (
        <div key={rf.redFlagId} className="rounded-xl border border-gray-200 bg-gray-50 p-3 opacity-60">
          <div className="text-sm">
            <span className="line-through font-medium">{rf.nameVi}</span>
            <span className="ml-2 text-xs text-gray-600">— đã loại trừ: <em>{rf.excludedReason || '(không có lý do)'}</em></span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Differential panel
// ─────────────────────────────────────────────────────────────────
function DifferentialPanel({ differential, outcome, onConfirm, busy }) {
  const [expanded, setExp] = useState(new Set())

  function toggle(id) {
    const n = new Set(expanded)
    if (n.has(id)) n.delete(id); else n.add(id)
    setExp(n)
  }

  const confirmedId = outcome?.confirmedDiseaseId

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h2 className="text-base font-semibold text-gray-800 mb-3">Chẩn đoán phân biệt</h2>
      {differential.length === 0 ? (
        <div className="text-sm text-gray-500 italic">Chưa có ứng cử viên — cần thêm triệu chứng hoặc dữ liệu khám.</div>
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
                  <span className="flex-1 text-sm font-medium text-gray-800">{d.nameVi || d.name}</span>
                  {d.isRedFlagCandidate && <span className="text-xs text-orange-700">⚠</span>}
                  <span className="text-xs font-mono text-gray-600 w-12 text-right">{d.score.toFixed(2)}</span>
                  <button onClick={() => toggle(d.diseaseId)}
                    className="text-xs text-blue-600 hover:underline w-12 text-right">{expanded.has(d.diseaseId) ? '↑' : 'Vì sao?'}</button>
                  {!outcome?.closedAt && (
                    <button onClick={() => onConfirm({ confirmedDiseaseId: d.diseaseId, confirmedDiseaseName: d.nameVi || d.name, accepted: true })}
                      disabled={busy || isConfirmed}
                      className={`text-xs px-2 py-1 rounded ${isConfirmed ? 'bg-green-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                      {isConfirmed ? '✓ Đã xác nhận' : 'Xác nhận'}
                    </button>
                  )}
                </div>
                {expanded.has(d.diseaseId) && (
                  <div className="mt-2 pl-7 text-xs text-gray-600 space-y-1">
                    <div><strong>Tóm tắt:</strong> {d.summary}</div>
                    {d.supportingFindings?.length > 0 && (
                      <div><strong>Bằng chứng:</strong> <span className="font-mono">{d.supportingFindings.join(', ')}</span></div>
                    )}
                    <div><strong>Mức độ khẩn:</strong> {URGENCY_LABEL[d.urgency]?.label || d.urgency}</div>
                  </div>
                )}
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
  const [showFindingFor, setShow] = useState(null)  // testId being expanded
  const [eye, setEye]             = useState('OD')
  const [value, setValue]         = useState('')
  const [unit, setUnit]           = useState('')

  const observedFindings = useMemo(() => new Set(observations.map(o => o.findingId)), [observations])

  async function submit(findingId) {
    if (!findingId) return
    await onAddObservation({ findingId, eye, value: value || undefined, unit: unit || undefined, source: 'manual' })
    setShow(null); setValue(''); setUnit('')
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h2 className="text-base font-semibold text-gray-800 mb-3">Xét nghiệm đề xuất tiếp theo</h2>
      {tests.length === 0 ? (
        <div className="text-sm text-gray-500 italic">Không còn xét nghiệm đề xuất — hệ thống đã có đủ thông tin để xếp hạng.</div>
      ) : (
        <div className="space-y-1.5">
          {tests.map(t => (
            <div key={t.testId} className="rounded-lg border border-gray-200 bg-white p-2.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium text-gray-800">{t.nameVi || t.name}</span>
                <span className="text-xs text-gray-500 font-mono">{t.svcCode}</span>
                <span className="text-xs font-mono text-gray-600 w-12 text-right">{t.expectedUtility.toFixed(2)}</span>
                <button onClick={() => setShow(t.testId === showFindingFor ? null : t.testId)}
                  className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-1 rounded">
                  💾 Nhập KQ
                </button>
              </div>
              <div className="pl-1 mt-1 text-xs text-gray-500">{t.rationale}</div>
              {showFindingFor === t.testId && (
                <ObservationInput
                  test={t}
                  observedFindings={observedFindings}
                  eye={eye} setEye={setEye}
                  value={value} setValue={setValue}
                  unit={unit} setUnit={setUnit}
                  onSubmit={submit}
                  busy={busy}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {observations.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="text-xs font-medium text-gray-600 mb-1">Đã ghi nhận ({observations.length}):</div>
          <div className="space-y-0.5">
            {observations.map((o, i) => (
              <div key={i} className="text-xs flex items-center gap-2">
                <span className="font-mono w-12 text-gray-600">{o.eye || '—'}</span>
                <span className="flex-1 font-mono">{o.findingId}</span>
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

function ObservationInput({ test, observedFindings, eye, setEye, value, setValue, unit, setUnit, onSubmit, busy }) {
  const candidates = test.producesFindings || []
  const [picked, setPicked] = useState(candidates[0] || '')
  useEffect(() => { setPicked(candidates[0] || '') }, [test.testId])

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-600">Mắt:</span>
        {['OD', 'OS', 'OU'].map(e => (
          <button key={e} onClick={() => setEye(e)}
            className={`px-2 py-0.5 rounded ${eye === e ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{e}</button>
        ))}
      </div>
      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {candidates.map(f => (
            <button key={f} onClick={() => setPicked(f)}
              className={`text-xs px-2 py-1 rounded border ${picked === f ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-gray-200 hover:border-blue-300'} ${observedFindings.has(f) ? 'opacity-60' : ''}`}>
              {f} {observedFindings.has(f) && '✓'}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={value} onChange={e => setValue(e.target.value)}
          placeholder="Giá trị (tuỳ chọn)"
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-32" />
        <input value={unit} onChange={e => setUnit(e.target.value)}
          placeholder="Đơn vị"
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-16" />
        <button onClick={() => onSubmit(picked)}
          disabled={busy || !picked}
          className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg">Lưu</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Outcome panel
// ─────────────────────────────────────────────────────────────────
function OutcomePanel({ session, onConfirm, busy }) {
  const outcome = session.clinicianOutcome || {}
  const closed = !!outcome.closedAt
  const [notes, setNotes] = useState(outcome.notes || '')
  const [referred, setReferred] = useState(outcome.referred || false)
  const [referredReason, setRefReason] = useState(outcome.referredReason || '')
  const [chosenTreatments, setRx] = useState(new Set())

  // Look up confirmed disease's treatments to suggest classes
  const confirmedDx = (session.differential || []).find(d => d.diseaseId === outcome.confirmedDiseaseId)
  const confirmedTreatments = confirmedDx?.treatments || []

  // Fall back to fetching full disease record for treatments not present in
  // the embedded differential entry — but for v0 we rely on what's there.

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
      notes: [
        notes,
        chosenTreatments.size > 0 ? `Điều trị (nhóm): ${[...chosenTreatments].join(', ')}` : '',
      ].filter(Boolean).join('\n'),
    })
  }

  if (!outcome.confirmedDiseaseId && !closed) return null

  return (
    <div className={`rounded-xl shadow-sm p-4 ${closed ? 'bg-green-50 border border-green-200' : 'bg-white'}`}>
      <h2 className="text-base font-semibold text-gray-800 mb-3">Kết luận & điều trị</h2>
      {outcome.confirmedDiseaseName && (
        <div className="text-sm mb-3">
          <strong>✓ Chẩn đoán xác nhận:</strong> {outcome.confirmedDiseaseName}
          <span className="ml-2 font-mono text-xs text-gray-500">{outcome.confirmedDiseaseId}</span>
        </div>
      )}
      {closed && (
        <div className="text-xs text-gray-600 mb-2">
          Đã đóng phiên lúc {new Date(outcome.closedAt).toLocaleString('vi-VN')} bởi {outcome.closedBy || '—'}
        </div>
      )}

      {!closed && confirmedTreatments.length > 0 && (
        <div className="mb-3">
          <div className="text-sm font-medium text-gray-700 mb-1.5">Nhóm điều trị (bác sĩ kê đơn cụ thể):</div>
          <div className="flex flex-wrap gap-1.5">
            {confirmedTreatments.map(t => (
              <button key={t} onClick={() => toggleRx(t)}
                className={`text-xs px-2.5 py-1 rounded-full border ${chosenTreatments.has(t) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {!closed && (
        <>
          <div className="mb-3">
            <label className="block text-sm text-gray-700 mb-1">Ghi chú</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Ghi chú lâm sàng, kế hoạch theo dõi..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-20 focus:border-blue-400 focus:ring-2 focus:ring-blue-50 focus:outline-none" />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={referred} onChange={e => setReferred(e.target.checked)} />
              Chuyển khám chuyên khoa
            </label>
            {referred && (
              <input value={referredReason} onChange={e => setRefReason(e.target.value)}
                placeholder="Lý do chuyển"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            )}
          </div>
          <button onClick={finalize} disabled={busy}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-medium px-5 py-2 rounded-lg text-sm">
            {busy ? '⏳ Đang lưu...' : 'Lưu vào hồ sơ & đóng phiên'}
          </button>
        </>
      )}

      {closed && outcome.notes && (
        <div className="mt-3 text-sm text-gray-700 whitespace-pre-wrap bg-white rounded-lg p-3 border border-gray-200">{outcome.notes}</div>
      )}
    </div>
  )
}
