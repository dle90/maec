import React, { useState, useEffect } from 'react'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })
const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')

export default function BookingForm() {
  const [step, setStep] = useState(1) // 1: info, 2: service, 3: schedule, 4: confirm, 5: done
  const [services, setServices] = useState([])
  const [sites, setSites] = useState([])
  const [slots, setSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const [form, setForm] = useState({
    name: '', phone: '', dob: '', gender: 'M',
    site: '', serviceId: '', serviceName: '', modality: '',
    scheduledDate: '', scheduledTime: '', clinicalInfo: '',
  })

  useEffect(() => {
    api.get('/booking/services').then(r => setServices(r.data)).catch(() => {})
    api.get('/booking/sites').then(r => setSites(r.data)).catch(() => {})
  }, [])

  // Load slots when site + date selected
  useEffect(() => {
    if (form.site && form.scheduledDate) {
      setLoadingSlots(true)
      api.get('/booking/slots', { params: { site: form.site, date: form.scheduledDate } })
        .then(r => { setSlots(r.data); setLoadingSlots(false) })
        .catch(() => { setSlots([]); setLoadingSlots(false) })
    }
  }, [form.site, form.scheduledDate])

  const selectService = (svc) => {
    setForm(p => ({ ...p, serviceId: svc._id, serviceName: svc.name, modality: svc.modality || '' }))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await api.post('/booking/submit', form)
      setResult(res.data)
      setStep(5)
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi đặt lịch')
    }
    setSubmitting(false)
  }

  const canNext = () => {
    if (step === 1) return form.name.trim() && form.phone.trim()
    if (step === 2) return form.site
    if (step === 3) return form.scheduledDate && form.scheduledTime
    return true
  }

  // Minimum date = tomorrow
  const minDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #0f2c6b, #1e3a5f)' }}>
          <h1 className="text-xl font-bold text-white">Đặt lịch khám — Phòng khám Mắt Minh Anh</h1>
          <p className="text-blue-200 text-sm mt-1">Dat lich kham truc tuyen</p>
        </div>

        {/* Progress */}
        {step < 5 && (
          <div className="px-6 pt-4">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map(s => (
                <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Thong tin</span><span>Dich vu</span><span>Lich hen</span><span>Xac nhan</span>
            </div>
          </div>
        )}

        <div className="p-6">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg mb-4">{error}</div>}

          {/* Step 1: Patient Info */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Thong tin benh nhan</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ho va ten *</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nguyen Van A" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">So dien thoai *</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="0901234567" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngay sinh</label>
                  <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gioi tinh</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}>
                    <option value="M">Nam</option>
                    <option value="F">Nu</option>
                    <option value="other">Khac</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Service + Site Selection */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Chon co so & dich vu</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Co so *</label>
                <div className="grid grid-cols-1 gap-2">
                  {sites.map(s => (
                    <button key={s} onClick={() => setForm(p => ({ ...p, site: s }))}
                      className={`text-left px-4 py-3 rounded-lg border-2 transition-colors text-sm ${
                        form.site === s ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-300'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {services.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dich vu (khong bat buoc)</label>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {services.map(svc => (
                      <button key={svc._id} onClick={() => selectService(svc)}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors text-sm flex justify-between items-center ${
                          form.serviceId === svc._id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                        }`}>
                        <span>{svc.name}</span>
                        <span className="text-gray-500 text-xs">{fmtMoney(svc.basePrice)} VND</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trieu chung / Ly do kham</label>
                <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  rows={2} value={form.clinicalInfo} onChange={e => setForm(p => ({ ...p, clinicalInfo: e.target.value }))}
                  placeholder="Mo ta trieu chung cua ban..." />
              </div>
            </div>
          )}

          {/* Step 3: Schedule */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Chon ngay & gio hen</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngay hen *</label>
                <input type="date" min={minDate}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  value={form.scheduledDate} onChange={e => setForm(p => ({ ...p, scheduledDate: e.target.value, scheduledTime: '' }))} />
              </div>
              {form.scheduledDate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gio hen *</label>
                  {loadingSlots ? (
                    <p className="text-gray-400 text-sm">Dang tai lich trong...</p>
                  ) : slots.length === 0 ? (
                    <p className="text-orange-500 text-sm">Khong con khung gio trong ngay nay. Vui long chon ngay khac.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {slots.map(time => (
                        <button key={time} onClick={() => setForm(p => ({ ...p, scheduledTime: time }))}
                          className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            form.scheduledTime === time ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 hover:border-blue-300 text-gray-700'
                          }`}>
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Xac nhan dat lich</h2>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Ho ten:</span><span className="font-medium">{form.name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Dien thoai:</span><span className="font-medium">{form.phone}</span></div>
                {form.dob && <div className="flex justify-between"><span className="text-gray-500">Ngay sinh:</span><span>{form.dob}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">Co so:</span><span className="font-medium">{form.site}</span></div>
                {form.serviceName && <div className="flex justify-between"><span className="text-gray-500">Dich vu:</span><span>{form.serviceName}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">Ngay hen:</span><span className="font-medium">{form.scheduledDate}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Gio hen:</span><span className="font-medium text-blue-600">{form.scheduledTime}</span></div>
                {form.clinicalInfo && <div><span className="text-gray-500">Trieu chung:</span> <span>{form.clinicalInfo}</span></div>}
              </div>
            </div>
          )}

          {/* Step 5: Success */}
          {step === 5 && result && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-green-700">Dat lich thanh cong!</h2>
              <p className="text-gray-600 text-sm">{result.message}</p>
              <div className="bg-green-50 rounded-lg p-4 text-sm space-y-1">
                <div><span className="text-gray-500">Ma lich hen:</span> <span className="font-mono font-medium">{result.bookingId}</span></div>
                <div><span className="text-gray-500">Thoi gian:</span> <span className="font-medium">{result.scheduledAt?.replace('T', ' ')}</span></div>
                <div><span className="text-gray-500">Co so:</span> <span className="font-medium">{result.site}</span></div>
              </div>
              <p className="text-xs text-gray-400">Chung toi se lien he xac nhan qua dien thoai.</p>
              <button onClick={() => { setStep(1); setForm({ name: '', phone: '', dob: '', gender: 'M', site: '', serviceId: '', serviceName: '', modality: '', scheduledDate: '', scheduledTime: '', clinicalInfo: '' }); setResult(null) }}
                className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Dat lich moi
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        {step < 5 && (
          <div className="px-6 pb-6 flex justify-between">
            {step > 1 ? (
              <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Quay lai
              </button>
            ) : <div />}
            {step < 4 ? (
              <button onClick={() => setStep(s => s + 1)} disabled={!canNext()}
                className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                Tiep tuc
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting}
                className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {submitting ? 'Dang xu ly...' : 'Xac nhan dat lich'}
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t text-center">
          <p className="text-xs text-gray-400">Minh Anh Eye Clinic - He thong quan ly phong kham</p>
        </div>
      </div>
    </div>
  )
}
