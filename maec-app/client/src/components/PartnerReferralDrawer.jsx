import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const STATUS = {
  pending:             { label: 'Chờ xử lý',   cls: 'bg-yellow-100 text-yellow-700' },
  accepted:            { label: 'Đã tiếp nhận', cls: 'bg-blue-100 text-blue-700' },
  appointment_created: { label: 'Đã tạo lịch', cls: 'bg-cyan-100 text-cyan-700' },
  completed:           { label: 'Hoàn thành',  cls: 'bg-green-100 text-green-700' },
  cancelled:           { label: 'Đã huỷ',      cls: 'bg-red-100 text-red-700' },
}

const GENDER_LABELS = { M: 'Nam', F: 'Nữ', other: 'Khác' }
const MODALITIES = ['US', 'XR', 'CT', 'MRI']
const SITES = ['Hải Dương', 'Hải Phòng', 'Hà Nội']

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const toLocalISO = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return ''
  return `${dateStr}T${timeStr}:00`
}

export function StatusPill({ status }) {
  const s = STATUS[status] || { label: status, cls: 'bg-gray-100 text-gray-700' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
}

export function AcceptDialog({ referral, onClose, onDone }) {
  const navigate = useNavigate()
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const [form, setForm] = useState({
    scheduledDate: tomorrow,
    scheduledTime: '08:30',
    site: referral.site || 'Hải Dương',
    modality: referral.modality || 'US',
    room: '',
    duration: 30,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setSaving(true)
    try {
      const res = await api.put(`/partner-admin/referrals/${referral._id}/accept`, {
        scheduledAt: toLocalISO(form.scheduledDate, form.scheduledTime),
        site: form.site,
        modality: form.modality,
        room: form.room,
        duration: Number(form.duration) || 30,
      })
      onDone(res.data)
    } catch (e) {
      setErr(e.response?.data?.error || e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold text-gray-800">Chấp nhận chuyển gửi</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Tạo lịch hẹn cho <b>{referral.patientName}</b> — bệnh nhân sẽ qua Đăng ký khi tới phòng khám.
            </p>
          </div>
          <div className="px-5 py-4 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Ngày hẹn *</label>
                <input type="date" value={form.scheduledDate} onChange={e => set('scheduledDate', e.target.value)}
                  required className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Giờ hẹn *</label>
                <input type="time" value={form.scheduledTime} onChange={e => set('scheduledTime', e.target.value)}
                  required className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Chi nhánh</label>
                <select value={form.site} onChange={e => set('site', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  {SITES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Modality</label>
                <select value={form.modality} onChange={e => set('modality', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  {MODALITIES.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Phòng (tuỳ chọn)</label>
                <input value={form.room} onChange={e => set('room', e.target.value)}
                  placeholder="VD: Phòng CT 1" className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Thời lượng (phút)</label>
                <input type="number" min="10" step="5" value={form.duration} onChange={e => set('duration', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
            </div>
            {err && <div className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded">{err}</div>}
            <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded px-3 py-2">
              Sau khi chấp nhận: lịch hẹn hiện trong danh sách Đăng ký vào ngày đã chọn. Khi bệnh nhân tới, nhân viên
              xác nhận thông tin, chọn dịch vụ và thu tiền như quy trình bình thường.
            </div>
          </div>
          <div className="px-5 py-3 border-t flex justify-end gap-2 bg-gray-50 rounded-b-xl">
            <button type="button" onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-100">
              Huỷ
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Đang tạo…' : 'Chấp nhận & tạo lịch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function RejectDialog({ referral, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setSaving(true)
    try {
      const res = await api.put(`/partner-admin/referrals/${referral._id}/reject`, { reason })
      onDone(res.data)
    } catch (e) {
      setErr(e.response?.data?.error || e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold text-gray-800">Từ chối chuyển gửi</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Bệnh nhân <b>{referral.patientName}</b> — lý do sẽ được ghi lại và gửi đối tác.
            </p>
          </div>
          <div className="px-5 py-4 space-y-3 text-sm">
            <div>
              <label className="text-xs text-gray-500 block mb-0.5">Lý do từ chối</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows="4"
                placeholder="VD: Hết chỗ ngày BN yêu cầu, dịch vụ chưa có tại site…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            {err && <div className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded">{err}</div>}
          </div>
          <div className="px-5 py-3 border-t flex justify-end gap-2 bg-gray-50 rounded-b-xl">
            <button type="button" onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-100">
              Huỷ
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              {saving ? 'Đang lưu…' : 'Từ chối'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-1.5">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}
function KV({ label, value }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-gray-500 w-32 flex-shrink-0">{label}</span>
      <span className="text-gray-800">{value || '—'}</span>
    </div>
  )
}

export function ReferralDetailDrawer({ referral, onClose, onAccept, onReject }) {
  if (!referral) return null
  const r = referral
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute right-0 top-0 h-full w-[460px] bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-800">{r.patientName}</h3>
              <StatusPill status={r.status} />
            </div>
            <div className="text-xs text-gray-500">Tạo lúc: {fmtDateTime(r.createdAt)}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
          <Section title="Nguồn chuyển gửi">
            <KV label="Cơ sở đối tác" value={r.facilityName} />
            <KV label="Bác sĩ / Người gửi" value={r.partnerDisplayName} />
          </Section>

          <Section title="Bệnh nhân">
            <KV label="Họ tên" value={r.patientName} />
            <KV label="SĐT" value={r.patientPhone} />
            <KV label="Ngày sinh" value={fmtDate(r.patientDob)} />
            <KV label="Giới tính" value={GENDER_LABELS[r.patientGender] || '—'} />
            <KV label="CCCD" value={r.patientIdCard || '—'} />
          </Section>

          <Section title="Yêu cầu chụp">
            <KV label="Dịch vụ đề nghị" value={r.requestedServiceName || '—'} />
            <KV label="Modality" value={r.modality || '—'} />
            <KV label="Chi nhánh" value={r.site || '—'} />
          </Section>

          <Section title="Thông tin lâm sàng">
            <div className="text-gray-700 whitespace-pre-wrap">{r.clinicalInfo || '—'}</div>
          </Section>

          {r.notes && (
            <Section title="Ghi chú">
              <div className="text-gray-700 whitespace-pre-wrap">{r.notes}</div>
            </Section>
          )}

          {r.appointmentId && (
            <Section title="Lịch hẹn đã tạo">
              <KV label="Mã lịch" value={r.appointmentId} />
            </Section>
          )}
        </div>

        {r.status === 'pending' && (
          <div className="px-5 py-3 border-t bg-gray-50 flex gap-2">
            <button onClick={() => onReject(r)}
              className="flex-1 py-2 text-sm rounded-lg border border-red-300 text-red-700 hover:bg-red-50">
              Từ chối
            </button>
            <button onClick={() => onAccept(r)}
              className="flex-1 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              Chấp nhận & tạo lịch
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
