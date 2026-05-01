import React, { useEffect, useMemo, useState } from 'react'
import api from '../api'

const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')
const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('vi-VN') : '—'

const KIND_BADGE = {
  service: { label: 'Dịch vụ', cls: 'bg-blue-100 text-blue-700' },
  package: { label: 'Gói khám', cls: 'bg-purple-100 text-purple-700' },
  kinh:    { label: 'Kính',     cls: 'bg-emerald-100 text-emerald-700' },
  thuoc:   { label: 'Thuốc',    cls: 'bg-amber-100 text-amber-700' },
}

export default function ThuNgan() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [tab, setTab] = useState('unpaid')

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/encounters/today')
      setList(r.data || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const unpaid = useMemo(() => list.filter(e => e.status !== 'paid' && e.status !== 'cancelled' && (e.billItems || []).length > 0), [list])
  const paid = useMemo(() => list.filter(e => e.status === 'paid'), [list])
  const empty = useMemo(() => list.filter(e => (e.billItems || []).length === 0 && e.status !== 'cancelled'), [list])

  const current = tab === 'unpaid' ? unpaid : tab === 'paid' ? paid : empty

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Thu ngân</h1>
          <p className="text-xs text-gray-500 mt-0.5">Xác nhận và thanh toán bill cho lượt khám hôm nay.</p>
        </div>
        <button onClick={load} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">⟳ Làm mới</button>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {[
          { k: 'unpaid', label: 'Chờ thanh toán', count: unpaid.length, color: 'text-orange-600 border-orange-500' },
          { k: 'paid',   label: 'Đã thanh toán',  count: paid.length,   color: 'text-green-600 border-green-500' },
          { k: 'empty',  label: 'Chưa có bill',   count: empty.length,  color: 'text-gray-600 border-gray-400' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? t.color : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label} <span className="ml-1 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">BN</th>
              <th className="px-3 py-2 text-left">Mã BN</th>
              <th className="px-3 py-2 text-left">Cơ sở</th>
              <th className="px-3 py-2 text-left">Gói</th>
              <th className="px-3 py-2 text-center">Mục bill</th>
              <th className="px-3 py-2 text-right">Tổng</th>
              <th className="px-3 py-2 text-left">{tab === 'paid' ? 'Đã trả lúc' : 'Tạo lúc'}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">Đang tải...</td></tr>
            ) : current.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">Không có lượt khám nào trong nhóm này</td></tr>
            ) : current.map(e => (
              <tr key={e._id} className="hover:bg-blue-50/30 cursor-pointer" onClick={() => setOpenId(e._id)}>
                <td className="px-3 py-2 font-medium text-gray-800">{e.patientName || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">{e.patientId || '—'}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{e.site || '—'}</td>
                <td className="px-3 py-2 text-xs">{e.packageName || <span className="text-gray-300 italic">—</span>}</td>
                <td className="px-3 py-2 text-center text-xs">{(e.billItems || []).length}</td>
                <td className="px-3 py-2 text-right font-mono text-blue-700 font-semibold">{fmtMoney(e.billTotal)}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{tab === 'paid' ? fmtDateTime(e.paidAt) : fmtTime(e.createdAt)}</td>
                <td className="px-3 py-2 text-xs">
                  {e.status === 'paid' ? (
                    <span className="text-green-700">Xem →</span>
                  ) : (
                    <span className="text-orange-600 font-semibold">Thanh toán →</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId && <PaymentDrawer id={openId} onClose={() => { setOpenId(null); load() }} />}
    </div>
  )
}

// ── Payment confirmation drawer ───────────────────────────

function PaymentDrawer({ id, onClose }) {
  const [enc, setEnc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/encounters/${id}`)
      setEnc(r.data)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  const checkout = async () => {
    if (!confirm(`Xác nhận thu ${fmtMoney(enc.billTotal)} đ từ ${enc.patientName}?\nSau khi xác nhận không thể chỉnh sửa bill.`)) return
    setPaying(true)
    try {
      await api.post(`/encounters/${id}/checkout`, { paymentMethod })
      await load()
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi thanh toán')
    } finally { setPaying(false) }
  }

  if (loading || !enc) {
    return (
      <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
        <div className="w-full max-w-2xl bg-white h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
          <div className="text-gray-400">Đang tải...</div>
        </div>
      </div>
    )
  }

  const isPaid = enc.status === 'paid'

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-start justify-between flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-gray-900 flex items-center gap-2">
              {enc.patientName} <span className="font-mono text-xs text-gray-400">{enc.patientId}</span>
              {isPaid && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">Đã thanh toán</span>}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{enc.site || '—'} · {enc._id}</div>
            {isPaid && enc.paidByName && (
              <div className="text-xs text-green-700 mt-0.5">Thu ngân: {enc.paidByName} · {fmtDateTime(enc.paidAt)} · {fmtMoney(enc.paidAmount)} đ</div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {enc.packageName && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-sm">
              <div className="font-semibold text-purple-900">{enc.packageName} {enc.packageTier && <span className="text-xs font-normal text-purple-700">— {enc.packageTier}</span>}</div>
            </div>
          )}

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Bill ({(enc.billItems || []).length} mục)</h3>
            {(enc.billItems || []).length === 0 ? (
              <div className="text-xs text-gray-400 italic">Chưa có mục nào trên bill — KTV/BS/Lễ tân cần thêm trước khi thanh toán.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr><th className="text-left py-1">Loại</th><th className="text-left">Tên</th><th className="text-right">SL</th><th className="text-right">Đơn giá</th><th className="text-right">Thành tiền</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(enc.billItems || []).map((b, i) => {
                    const kb = KIND_BADGE[b.kind] || { label: b.kind, cls: 'bg-gray-100 text-gray-600' }
                    return (
                      <tr key={i}>
                        <td className="py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded ${kb.cls}`}>{kb.label}</span></td>
                        <td className="py-1.5">{b.name}</td>
                        <td className="py-1.5 text-right">{b.qty}</td>
                        <td className="py-1.5 text-right font-mono text-xs">{fmtMoney(b.unitPrice)}</td>
                        <td className="py-1.5 text-right font-mono">{fmtMoney(b.totalPrice)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-semibold text-base">
                    <td colSpan={4} className="py-3 text-right">Tổng cộng</td>
                    <td className="py-3 text-right font-mono text-blue-700">{fmtMoney(enc.billTotal)} đ</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>
        </div>

        {!isPaid && (enc.billItems || []).length > 0 && (
          <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-3 mb-3">
              <label className="text-sm text-gray-600 font-medium">Hình thức:</label>
              <div className="flex gap-1">
                {[
                  { k: 'cash',     label: 'Tiền mặt' },
                  { k: 'transfer', label: 'Chuyển khoản' },
                  { k: 'card',     label: 'Thẻ' },
                  { k: 'mixed',    label: 'Hỗn hợp' },
                ].map(p => (
                  <button key={p.k} onClick={() => setPaymentMethod(p.k)}
                    className={`px-3 py-1.5 text-xs rounded-lg ${paymentMethod === p.k ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={checkout} disabled={paying}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg text-base disabled:opacity-50">
              {paying ? 'Đang xử lý...' : `Xác nhận thu ${fmtMoney(enc.billTotal)} đ`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
