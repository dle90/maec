import React, { useEffect, useMemo, useState } from 'react'
import api from '../api'
import { useEscapeKey } from '../hooks/useEscapeKey'

const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')
const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('vi-VN') : '—'

// ── Phiếu Thu print (A4 receipt) ──────────────────────────────────────────
// Financial-only: bill items + discount + grand total + payments ledger +
// cashier signature. No clinical info, no service results — those belong on
// Phiếu Khám (printed from Khám). Designed to be printed any time at least
// one non-refund payment exists; refunds are folded into the ledger.
export function printPaymentReceipt(enc) {
  const w = window.open('', '_blank', 'width=820,height=1100')
  if (!w) { alert('Trình duyệt chặn cửa sổ in — vui lòng cho phép pop-up.'); return }
  const printedAt = new Date().toLocaleString('vi-VN')
  const visitAt = enc.createdAt ? new Date(enc.createdAt).toLocaleString('vi-VN') : '—'
  const esc = (s) => String(s || '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]))
  const money = (n) => Number(n || 0).toLocaleString('vi-VN')
  const kindLabel = (k) => ({ service: 'Dịch vụ', package: 'Gói khám', kinh: 'Kính', thuoc: 'Thuốc' }[k] || k)
  const methodLbl = (m) => ({ cash: 'Tiền mặt', transfer: 'Chuyển khoản', card: 'Thẻ', mixed: 'Hỗn hợp' }[m] || m || '—')

  const billItems = enc.billItems || []
  const subtotal = enc.billTotal || 0
  const discPct = enc.discountPercent || 0
  const discAmt = discPct > 0 ? Math.round(subtotal * discPct / 100) : (enc.discountAmount || 0)
  const grand = Math.max(0, subtotal - discAmt)
  const payments = enc.payments || []
  let paid = 0
  for (const p of payments) paid += (p.kind === 'refund' ? -1 : 1) * (p.amount || 0)
  paid = Math.max(0, paid)
  const remaining = Math.max(0, grand - paid)

  const billHtml = billItems.length === 0 ? `
    <div class="section">
      <h3>Chi tiết dịch vụ / sản phẩm</h3>
      <div class="muted" style="padding:10px">Chưa có khoản nào trên hóa đơn.</div>
    </div>` : `
    <div class="section">
      <h3>Chi tiết dịch vụ / sản phẩm</h3>
      <table class="data">
        <thead><tr>
          <th class="w8">#</th><th class="w16">Loại</th><th>Tên</th>
          <th class="w8 r">SL</th><th class="w16 r">Đơn giá</th><th class="w20 r">Thành tiền</th>
        </tr></thead>
        <tbody>
          ${billItems.map((b, i) => `<tr>
            <td class="c">${i + 1}</td>
            <td class="small">${kindLabel(b.kind)}</td>
            <td>${esc(b.name)}</td>
            <td class="r">${b.qty || 1}</td>
            <td class="r mono small">${money(b.unitPrice)}</td>
            <td class="r mono"><strong>${money(b.totalPrice)}</strong></td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="5" class="r">Tạm tính</td><td class="r mono">${money(subtotal)}</td></tr>
          ${discAmt > 0 ? `<tr><td colspan="5" class="r">Giảm giá${discPct > 0 ? ` (${discPct}%)` : ''}${enc.discountReason ? ` — ${esc(enc.discountReason)}` : ''}</td><td class="r mono" style="color:#dc2626">−${money(discAmt)}</td></tr>` : ''}
          <tr class="grand"><td colspan="5" class="r"><strong>Tổng cộng</strong></td><td class="r mono"><strong>${money(grand)} đ</strong></td></tr>
        </tfoot>
      </table>
    </div>`

  const payHtml = payments.length === 0 ? '' : `
    <div class="section">
      <h3>Lịch sử thanh toán</h3>
      <table class="data">
        <thead><tr>
          <th class="w8">#</th><th class="w20">Thời gian</th><th class="w16">Loại</th>
          <th class="w16">Phương thức</th><th>Người thu</th><th class="w20 r">Số tiền</th>
        </tr></thead>
        <tbody>
          ${payments.map((p, i) => {
            const isRefund = p.kind === 'refund'
            const amt = (isRefund ? '−' : '') + money(p.amount)
            const cls = isRefund ? 'style="color:#dc2626"' : ''
            return `<tr>
              <td class="c">${i + 1}</td>
              <td class="small">${esc(p.at ? new Date(p.at).toLocaleString('vi-VN') : '—')}</td>
              <td class="small">${isRefund ? 'Hoàn tiền' : 'Thu'}</td>
              <td class="small">${esc(methodLbl(p.method))}</td>
              <td class="small">${esc(p.byName || p.by || '—')}</td>
              <td class="r mono" ${cls}><strong>${amt}</strong></td>
            </tr>`
          }).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="5" class="r">Tổng đã thu (ròng)</td><td class="r mono"><strong>${money(paid)} đ</strong></td></tr>
          ${remaining > 0 ? `<tr><td colspan="5" class="r" style="color:#b45309">Còn lại</td><td class="r mono" style="color:#b45309"><strong>${money(remaining)} đ</strong></td></tr>` : ''}
        </tfoot>
      </table>
    </div>`

  const statusBanner = enc.status === 'paid'
    ? `<div class="paid">Đã thanh toán đủ${enc.paidByName ? ` · Thu ngân: ${esc(enc.paidByName)}` : ''}${enc.paidAt ? ` · ${new Date(enc.paidAt).toLocaleString('vi-VN')}` : ''}</div>`
    : enc.status === 'partial'
      ? `<div class="partial">Đã thu một phần · Còn lại ${money(remaining)} đ</div>`
      : enc.status === 'completed'
        ? `<div class="cancelled">Đã hoàn tiền</div>`
        : ''

  const html = `
<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Phiếu thu ${esc(enc.patientName || '')}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; font-size: 12px; line-height: 1.45; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 14px; }
  .clinic { font-weight: 700; font-size: 17px; color: #1e3a5f; letter-spacing: -0.2px; }
  .clinic-sub { font-size: 11px; color: #666; margin-top: 2px; }
  .meta { text-align: right; font-size: 11px; color: #444; }
  .meta .num { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: 12px; font-weight: 700; color: #1e3a5f; }
  h1 { font-size: 20px; text-align: center; margin: 10px 0 4px; letter-spacing: 1px; color: #1e3a5f; }
  .subtitle { text-align: center; font-size: 11px; color: #666; margin-bottom: 14px; }
  .info { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  .info td { padding: 4px 6px; vertical-align: top; font-size: 12px; }
  .info td.k { color: #666; width: 100px; font-size: 11px; }
  .info td.v { font-weight: 500; }
  .section { margin-top: 12px; page-break-inside: avoid; }
  .section h3 { font-size: 12px; color: #1e3a5f; margin: 0 0 6px; padding: 4px 8px; background: #eef2f7; border-left: 3px solid #1e3a5f; text-transform: uppercase; letter-spacing: 0.5px; }
  table.data { width: 100%; border-collapse: collapse; }
  table.data th { background: #f3f4f6; color: #374151; font-size: 11px; font-weight: 600; padding: 5px 6px; border-bottom: 1.5px solid #1e3a5f; text-align: left; }
  table.data td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; font-size: 12px; vertical-align: top; }
  table.data td.c { text-align: center; }
  table.data td.r, table.data th.r { text-align: right; }
  table.data .mono { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; }
  table.data .small { font-size: 10px; }
  table.data .muted { color: #9ca3af; }
  table.data .w8  { width: 32px; }
  table.data .w16 { width: 80px; }
  table.data .w20 { width: 110px; }
  table.data tfoot td { padding: 4px 6px; font-size: 12px; }
  table.data tfoot tr.grand td { font-size: 13px; padding-top: 6px; border-top: 2px solid #1e3a5f; color: #1e3a5f; }
  .signs { display: flex; justify-content: space-around; margin-top: 36px; padding-top: 8px; }
  .signs > div { width: 45%; text-align: center; font-size: 12px; }
  .signs .role { color: #666; font-size: 11px; margin-bottom: 48px; }
  .signs .hint { font-size: 10px; color: #999; margin-top: 2px; font-style: italic; }
  .footer { margin-top: 14px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #e5e7eb; padding-top: 6px; }
  .paid { margin: 0 0 10px; padding: 5px 10px; background: #dcfce7; color: #166534; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .partial { margin: 0 0 10px; padding: 5px 10px; background: #fef3c7; color: #92400e; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .cancelled { margin: 0 0 10px; padding: 5px 10px; background: #fee2e2; color: #991b1b; border-radius: 4px; font-size: 11px; font-weight: 600; }
  @media print { .no-print { display: none; } }
</style>
</head><body>

<div class="header">
  <div>
    <div class="clinic">PHÒNG KHÁM MẮT MINH ANH${enc.site ? ' — ' + esc(String(enc.site).toUpperCase()) : ''}</div>
    <div class="clinic-sub">Hệ thống quản lý lâm sàng MAEC</div>
  </div>
  <div class="meta">
    <div>Mã lượt khám: <span class="num">${esc(enc._id || '')}</span></div>
    <div>Ngày khám: ${esc(visitAt)}</div>
    <div>In ngày: ${esc(printedAt)}</div>
  </div>
</div>

<h1>PHIẾU THU</h1>
<div class="subtitle">Bệnh nhân giữ phiếu này làm chứng từ thanh toán</div>

${statusBanner}

<table class="info"><tbody>
  <tr>
    <td class="k">Họ và tên</td><td class="v"><strong>${esc(enc.patientName || '')}</strong></td>
    <td class="k">Mã BN</td><td class="v mono">${esc(enc.patientId || '')}</td>
  </tr>
  <tr>
    <td class="k">Cơ sở</td><td class="v">${esc(enc.site || '—')}</td>
    <td class="k">SĐT</td><td class="v">${esc(enc.phone || '—')}</td>
  </tr>
</tbody></table>

${billHtml}
${payHtml}

<div class="signs">
  <div>
    <div class="role">Bệnh nhân / Người nhà</div>
    <div><strong>${esc(enc.patientName || '')}</strong></div>
    <div class="hint">(ký, ghi rõ họ tên)</div>
  </div>
  <div>
    <div class="role">Thu ngân</div>
    <div><strong>${esc(enc.paidByName || '')}</strong></div>
    <div class="hint">(ký, ghi rõ họ tên)</div>
  </div>
</div>

<div class="footer">Minh Anh Eye Clinic · ${esc(printedAt)} · Lượt khám ${esc(enc._id || '')}</div>

<script>
  window.onload = () => {
    window.focus()
    window.print()
    setTimeout(() => window.close(), 400)
  }
</script>

</body></html>`

  w.document.write(html)
  w.document.close()
}

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

// Q3 — net paid across the payments[] ledger (positive payments minus
// refunds). Falls back to legacy `paidAmount` when no ledger exists yet
// (encounters created before Sprint B). Mirrors server netPaidAmount().
function netPaid(enc) {
  if (!enc) return 0
  const pays = enc.payments || []
  if (pays.length === 0) return enc.paidAmount || 0
  let net = 0
  for (const p of pays) net += (p.kind === 'refund' ? -1 : 1) * (p.amount || 0)
  return Math.max(0, net)
}
function remainingAmount(enc) { return Math.max(0, grandTotal(enc) - netPaid(enc)) }

const PAY_METHODS = [
  { k: 'cash',     label: 'Tiền mặt' },
  { k: 'transfer', label: 'Chuyển khoản' },
  { k: 'card',     label: 'Thẻ' },
  { k: 'mixed',    label: 'Hỗn hợp' },
]
const methodLabel = (k) => PAY_METHODS.find(p => p.k === k)?.label || k

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

  // Q3 — partial-paid encounters need cashier action (still owe money) →
  // unpaid bucket. Fully-refunded ones (status='completed' with payments
  // history) belong to the paid bucket so cashier can review the history /
  // re-refund. cancelled stays out of all three buckets.
  const unpaid = useMemo(() =>
    list.filter(e => !['paid', 'completed', 'cancelled'].includes(e.status) && (e.billItems || []).length > 0),
  [list])
  const paid = useMemo(() => list.filter(e => e.status === 'paid' || e.status === 'completed'), [list])
  const empty = useMemo(() => list.filter(e => (e.billItems || []).length === 0 && e.status !== 'cancelled'), [list])

  const current = tab === 'unpaid' ? unpaid : tab === 'paid' ? paid : empty

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Thu ngân</h1>
          <p className="text-xs text-gray-500 mt-0.5">Xác nhận và thanh toán bill cho lượt khám hôm nay.</p>
        </div>
        <button onClick={load} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 whitespace-nowrap flex-shrink-0">⟳ Làm mới</button>
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {[
          { k: 'unpaid', label: 'Chờ thanh toán', count: unpaid.length, color: 'text-orange-600 border-orange-500' },
          { k: 'paid',   label: 'Đã thanh toán',  count: paid.length,   color: 'text-green-600 border-green-500' },
          { k: 'empty',  label: 'Chưa có bill',   count: empty.length,  color: 'text-gray-600 border-gray-400' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.k ? t.color : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
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
                <td className="px-3 py-2 text-right font-mono font-semibold">
                  <div className="text-blue-700">{fmtMoney(grandTotal(e))}</div>
                  {e.status === 'partial' && netPaid(e) > 0 && (
                    <div className="text-[10px] font-normal text-amber-700 font-mono">
                      Đã thu {fmtMoney(netPaid(e))} · còn {fmtMoney(remainingAmount(e))}
                    </div>
                  )}
                  {e.status === 'completed' && (
                    <div className="text-[10px] font-normal text-rose-700">Đã hoàn</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{tab === 'paid' ? fmtDateTime(e.paidAt) : fmtTime(e.createdAt)}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {(e.status === 'paid' || e.status === 'completed') ? (
                    <span className="inline-flex items-center gap-2">
                      <button
                        onClick={ev => { ev.stopPropagation(); printPaymentReceipt(e) }}
                        className="text-gray-600 hover:text-gray-900 text-xs px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-50"
                        title="In Phiếu Thu (chỉ thông tin thanh toán)"
                      >🖨 In Phiếu Thu</button>
                      <span className={e.status === 'paid' ? 'text-green-700' : 'text-rose-700'}>Xem →</span>
                    </span>
                  ) : e.status === 'partial' ? (
                    <span className="text-amber-700 font-semibold">Thu tiếp →</span>
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
  const [busy, setBusy] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [payAmount, setPayAmount] = useState('')
  const [showRefund, setShowRefund] = useState(false)
  // Disable Esc when child RefundModal is open so a single Esc only closes
  // the inner one.
  useEscapeKey(onClose, !showRefund)

  const load = async () => {
    setLoading(true)
    try {
      const [encRes, prevRes] = await Promise.all([
        api.get(`/encounters/${id}`),
        api.get(`/encounters/${id}/checkout-preview`).catch(() => ({ data: null })),
      ])
      setEnc(encRes.data)
      setPreview(prevRes.data)
      // Default the input to whatever's still owed; cashier can override.
      setPayAmount(String(remainingAmount(encRes.data) || ''))
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  const recordPayment = async () => {
    const amt = Math.round(Number(payAmount.toString().replace(/[^\d]/g, '')))
    if (!(amt > 0)) { alert('Số tiền không hợp lệ'); return }
    if (!confirm(`Thu ${fmtMoney(amt)}đ từ ${enc.patientName}?`)) return
    setBusy(true)
    try {
      await api.post(`/encounters/${id}/payment`, { amount: amt, method: paymentMethod })
      await load()
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi thanh toán')
    } finally { setBusy(false) }
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

  const paidNet = netPaid(enc)
  const remaining = remainingAmount(enc)
  const grand = grandTotal(enc)
  const isPaid = enc.status === 'paid'
  const isPartial = enc.status === 'partial'
  const isFullyRefunded = enc.status === 'completed' && (enc.payments || []).length > 0
  const hasPayments = (enc.payments || []).length > 0
  const hasStockItems = (enc.billItems || []).some(b => b.kind === 'thuoc' || b.kind === 'kinh')
  const hasNonRefundPayments = (enc.payments || []).some(p => p.kind !== 'refund')

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-start justify-between flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
              {enc.patientName} <span className="font-mono text-xs text-gray-400">{enc.patientId}</span>
              {isPaid && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">Đã thanh toán</span>}
              {isPartial && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Thu một phần</span>}
              {isFullyRefunded && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">Đã hoàn</span>}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{enc.site || '—'} · {enc._id}</div>
            {hasNonRefundPayments && (
              <div className="text-xs text-green-700 mt-0.5">
                Đã thu: <b>{fmtMoney(paidNet)}đ</b>
                {remaining > 0 && <span className="text-amber-700"> · Còn lại: <b>{fmtMoney(remaining)}đ</b></span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasNonRefundPayments && (
              <button
                onClick={() => printPaymentReceipt(enc)}
                className="text-xs text-gray-700 hover:text-gray-900 px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
                title="In Phiếu Thu (chỉ thông tin thanh toán)"
              >🖨 In Phiếu Thu</button>
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

          {/* Stock-deduct preview shows ONLY for the first payment of an
              encounter. Subsequent payments and refunds don't touch stock here. */}
          {!hasNonRefundPayments && hasStockItems && preview && preview.items.length > 0 && (
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
                    <td className="py-2 text-right font-mono text-blue-700">{fmtMoney(grand)} đ</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>

          {/* Payments ledger — chronological list of every collect / refund */}
          {hasPayments && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Lịch sử thu chi ({(enc.payments || []).length})
              </h3>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {(enc.payments || []).map((p, i) => {
                  const isRefund = p.kind === 'refund'
                  return (
                    <div key={i} className={`px-3 py-2 text-sm flex items-baseline gap-3 ${isRefund ? 'bg-rose-50/40' : ''}`}>
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${isRefund ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isRefund ? 'Hoàn' : 'Thu'}
                      </span>
                      <span className={`font-mono font-semibold ${isRefund ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {isRefund ? '−' : '+'}{fmtMoney(p.amount)}đ
                      </span>
                      <span className="text-xs text-gray-500">{methodLabel(p.method)}</span>
                      <span className="text-xs text-gray-500 flex-1 truncate">{p.reason || ''}</span>
                      <span className="text-xs text-gray-400">{p.byName || p.by} · {fmtDateTime(p.at)}</span>
                    </div>
                  )
                })}
                <div className="px-3 py-2 text-sm font-semibold flex items-center gap-3 bg-gray-50">
                  <span className="text-gray-700">Tổng đã thu (net):</span>
                  <span className="font-mono text-blue-700 ml-auto">{fmtMoney(paidNet)}đ</span>
                  {remaining > 0 && <span className="font-mono text-amber-700">/ Còn {fmtMoney(remaining)}đ</span>}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Footer — payment input + actions */}
        {(enc.billItems || []).length > 0 && enc.status !== 'cancelled' && (
          <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0 space-y-3">
            {remaining > 0 && (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="text-sm text-gray-600 font-medium whitespace-nowrap">Hình thức:</label>
                  <div className="flex gap-1 flex-wrap">
                    {PAY_METHODS.map(p => (
                      <button key={p.k} onClick={() => setPaymentMethod(p.k)}
                        className={`px-3 py-1.5 text-xs rounded-lg ${paymentMethod === p.k ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-sm text-gray-600 font-medium whitespace-nowrap">Số tiền thu:</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value.replace(/[^\d]/g, ''))}
                    className="w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono text-right"
                    placeholder="0"
                  />
                  <span className="text-xs text-gray-500">đ</span>
                  <button onClick={() => setPayAmount(String(remaining))}
                    className="text-xs text-blue-600 hover:underline">
                    = Còn lại ({fmtMoney(remaining)}đ)
                  </button>
                </div>
                <button onClick={recordPayment} disabled={busy || (preview?.hasStockIssues && !hasNonRefundPayments)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg text-base disabled:opacity-50">
                  {busy ? 'Đang xử lý...'
                    : (preview?.hasStockIssues && !hasNonRefundPayments) ? 'Không đủ tồn kho — xử lý trước'
                    : `${hasNonRefundPayments ? 'Thu thêm' : 'Xác nhận thu'} ${fmtMoney(Number(payAmount) || 0)}đ`}
                </button>
              </>
            )}
            {paidNet > 0 && (
              <button
                onClick={() => setShowRefund(true)}
                className="w-full text-sm text-rose-700 border border-rose-300 hover:bg-rose-50 rounded-lg py-2"
              >↩ Hoàn tiền</button>
            )}
          </div>
        )}
      </div>

      {showRefund && (
        <RefundModal
          enc={enc}
          onClose={() => setShowRefund(false)}
          onDone={async () => { setShowRefund(false); await load() }}
        />
      )}
    </div>
  )
}

// Hoàn tiền modal — captures amount + reason + method + optional stock-return.
// The stock-return checkbox only renders when the encounter has a previous
// auto_deduct transaction; ticking it triggers a reverse 'import' tx that
// puts the kính/thuốc lots back on the shelf at the original warehouse.
function RefundModal({ enc, onClose, onDone }) {
  useEscapeKey(onClose)
  const [amount, setAmount] = useState(String(netPaid(enc)))
  const [method, setMethod] = useState('cash')
  const [reason, setReason] = useState('')
  const [returnStock, setReturnStock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const canReturnStock = !!enc.consumablesTransactionId
  const max = netPaid(enc)

  const submit = async () => {
    setErr('')
    const amt = Math.round(Number(amount.toString().replace(/[^\d]/g, '')))
    if (!(amt > 0)) { setErr('Số tiền không hợp lệ'); return }
    if (amt > max) { setErr(`Vượt mức đã thu (${fmtMoney(max)}đ)`); return }
    if (!reason.trim()) { setErr('Cần nhập lý do hoàn tiền'); return }
    setBusy(true)
    try {
      await api.post(`/encounters/${enc._id}/refund`, { amount: amt, method, reason, returnStock })
      onDone()
    } catch (e) {
      setErr(e.response?.data?.error || 'Lỗi hoàn tiền')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="font-semibold text-gray-900">Hoàn tiền cho {enc.patientName}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-xs text-gray-500">Đã thu (net): <b className="text-gray-800">{fmtMoney(max)}đ</b></div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Số tiền hoàn</label>
            <div className="flex items-center gap-2">
              <input
                type="text" inputMode="numeric"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-right"
              />
              <span className="text-xs text-gray-500">đ</span>
              <button onClick={() => setAmount(String(max))} className="text-xs text-blue-600 hover:underline">Hoàn tất cả</button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Hình thức</label>
            <div className="flex gap-1 flex-wrap">
              {PAY_METHODS.map(p => (
                <button key={p.k} onClick={() => setMethod(p.k)}
                  className={`px-3 py-1.5 text-xs rounded-lg ${method === p.k ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Lý do <span className="text-rose-600">*</span></label>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="VD: BN trả lại kính chưa lấy / hủy đơn ortho-K..."
            />
          </div>

          {canReturnStock && (
            <label className="flex items-start gap-2 text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded-lg p-3 cursor-pointer">
              <input type="checkbox" checked={returnStock} onChange={e => setReturnStock(e.target.checked)} className="mt-0.5" />
              <span>
                <b>Hoàn lại kho</b> — tạo phiếu nhập tự động đưa kính/thuốc đã trừ trở lại tồn kho.
                <span className="block text-xs text-gray-500 mt-0.5">Chỉ tick khi BN thực sự trả lại hàng.</span>
              </span>
            </label>
          )}

          {err && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{err}</div>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Hủy</button>
          <button onClick={submit} disabled={busy}
            className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded text-sm font-semibold">
            {busy ? 'Đang xử lý…' : 'Xác nhận hoàn tiền'}
          </button>
        </div>
      </div>
    </div>
  )
}
