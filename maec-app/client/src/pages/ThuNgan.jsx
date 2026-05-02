import React, { useEffect, useMemo, useState } from 'react'
import api from '../api'
import { printVisitReport } from './Kham'

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

// Mirrors server-side helper. Discount is either absolute (discountAmount)
// or percent (discountPercent, takes precedence when > 0).
function effectiveDiscount(enc) {
  if (!enc) return 0
  const pct = enc.discountPercent || 0
  if (pct > 0) return Math.round((enc.billTotal || 0) * pct / 100)
  return enc.discountAmount || 0
}
function grandTotal(enc) {
  return Math.max(0, (enc?.billTotal || 0) - effectiveDiscount(enc))
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

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
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
                <td className="px-3 py-2 text-xs">{(e.packages || []).length === 0 ? <span className="text-gray-300 italic">—</span> : (e.packages || []).map(p => p.name).join(' + ')}</td>
                <td className="px-3 py-2 text-center text-xs">{(e.billItems || []).length}</td>
                <td className="px-3 py-2 text-right font-mono text-blue-700 font-semibold">{fmtMoney(grandTotal(e))}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{tab === 'paid' ? fmtDateTime(e.paidAt) : fmtTime(e.createdAt)}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {e.status === 'paid' ? (
                    <span className="inline-flex items-center gap-2">
                      <button
                        onClick={ev => { ev.stopPropagation(); printVisitReport(e) }}
                        className="text-gray-600 hover:text-gray-900 text-xs px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-50"
                        title="In lại biên lai"
                      >🖨 In lại</button>
                      <span className="text-green-700">Xem →</span>
                    </span>
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
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')

  const load = async () => {
    setLoading(true)
    try {
      const [encRes, prevRes] = await Promise.all([
        api.get(`/encounters/${id}`),
        api.get(`/encounters/${id}/checkout-preview`).catch(() => ({ data: null })),
      ])
      setEnc(encRes.data)
      setPreview(prevRes.data)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  const checkout = async () => {
    const grand = grandTotal(enc)
    if (!confirm(`Xác nhận thu ${fmtMoney(grand)} đ từ ${enc.patientName}?\nSau khi xác nhận không thể chỉnh sửa bill.`)) return
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
          <div className="flex items-center gap-2 flex-shrink-0">
            {isPaid && (
              <button
                onClick={() => printVisitReport(enc)}
                className="text-xs text-gray-700 hover:text-gray-900 px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
                title="In lại biên lai"
              >🖨 In lại</button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {(enc.packages || []).length > 0 && (
            <div className="space-y-1.5">
              {enc.packages.map(p => (
                <div key={p.code} className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-sm">
                  <div className="font-semibold text-purple-900">{p.name} {p.tier && <span className="text-xs font-normal text-purple-700">— {p.tier}</span>}</div>
                </div>
              ))}
            </div>
          )}

          {!isPaid && preview && preview.items.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Trừ kho — {preview.warehouse?.name || '(không có kho)'}
              </h3>
              {preview.hasStockIssues && (
                <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  ⚠ Một số mục không đủ tồn kho — không thể thanh toán cho đến khi xử lý.
                </div>
              )}
              <div className="space-y-1.5">
                {preview.items.map((it, i) => (
                  <div key={i} className={`border rounded px-3 py-2 ${it.satisfied === false ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{it.code || '—'}</span>
                      <span className="text-sm font-medium flex-1">{it.name}</span>
                      <span className="text-xs text-gray-500">SL: {it.qty}</span>
                    </div>
                    {it.satisfied === false ? (
                      <div className="text-xs text-red-700 mt-1">
                        Thiếu {it.shortfall} (còn {it.totalAvailable ?? 0}). {it.note || 'Nhập kho thêm hoặc bỏ mục khỏi bill.'}
                      </div>
                    ) : it.note ? (
                      <div className="text-xs text-gray-500 mt-1">{it.note}</div>
                    ) : it.plan?.length ? (
                      <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                        {it.plan.map((p, j) => (
                          <div key={j}>
                            → Lot <span className="font-mono">{p.lotNumber || p.lotId.slice(-6)}</span> ×{p.quantity}
                            {p.expiryDate && <span className="text-gray-400 ml-1">(HSD {p.expiryDate})</span>}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
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
                <tfoot className="text-sm">
                  <tr className="border-t-2 border-gray-300">
                    <td colSpan={4} className="py-1.5 text-right text-gray-500">Tạm tính</td>
                    <td className="py-1.5 text-right font-mono text-gray-700">{fmtMoney(enc.billTotal)} đ</td>
                  </tr>
                  {effectiveDiscount(enc) > 0 && (
                    <tr>
                      <td colSpan={4} className="py-1.5 text-right text-gray-500">
                        Giảm giá{(enc.discountPercent || 0) > 0 ? ` (${enc.discountPercent}%)` : ''}{enc.discountReason ? ` — ${enc.discountReason}` : ''}
                      </td>
                      <td className="py-1.5 text-right font-mono text-rose-600">−{fmtMoney(effectiveDiscount(enc))} đ</td>
                    </tr>
                  )}
                  <tr className="border-t border-gray-200 font-bold text-base">
                    <td colSpan={4} className="py-2 text-right">Tổng cộng</td>
                    <td className="py-2 text-right font-mono text-blue-700">{fmtMoney(grandTotal(enc))} đ</td>
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
            <button onClick={checkout} disabled={paying || (preview?.hasStockIssues)}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg text-base disabled:opacity-50">
              {paying ? 'Đang xử lý...'
                : preview?.hasStockIssues ? 'Không đủ tồn kho — xử lý trước'
                : `Xác nhận thu ${fmtMoney(grandTotal(enc))} đ`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
