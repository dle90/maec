import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')
const fmtDate = (s) => s ? s.slice(0, 10) : ''
const todayISO = () => new Date().toISOString().slice(0, 10)

const STATUS_TABS = [
  { key: 'cho_thu', label: 'Chờ thu' },
  { key: 'da_thu', label: 'Đã thu' },
  { key: 'hoan_tra', label: 'Hoàn trả' },
  { key: 'all', label: 'Tất cả' },
]

const PAY_METHODS = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'transfer', label: 'Chuyển khoản' },
  { value: 'card', label: 'Thẻ' },
  { value: 'mixed', label: 'Kết hợp' },
]

const PAY_STATUS_MAP = {
  cho_thu: ['draft', 'issued', 'partially_paid'],
  da_thu: ['paid'],
  hoan_tra: ['cancelled', 'refunded'],
}

const STATUS_PILL = {
  draft:           { label: 'Nháp',     cls: 'bg-gray-100 text-gray-700' },
  issued:          { label: 'Đã phát hành', cls: 'bg-blue-100 text-blue-700' },
  partially_paid:  { label: 'Thu một phần', cls: 'bg-amber-100 text-amber-700' },
  paid:            { label: 'Đã thu',   cls: 'bg-emerald-100 text-emerald-700' },
  cancelled:       { label: 'Đã hủy',   cls: 'bg-gray-200 text-gray-600' },
  refunded:        { label: 'Đã hoàn',  cls: 'bg-rose-100 text-rose-700' },
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ── Page header ──────────────────────────────────────────────────────────────

function PageHeader({ userName, date, onCreate, invoiceCounts }) {
  return (
    <div className="flex items-center gap-6 px-4 py-2 border-b bg-white">
      <div className="flex items-baseline gap-2">
        <div className="text-lg font-semibold text-gray-800">Phiếu thu</div>
        <div className="text-xs text-gray-400 font-mono">/tiếp đón</div>
      </div>
      <div className="flex-1 text-xs text-gray-500">
        {invoiceCounts && (
          <span>
            <b className="text-gray-700">{invoiceCounts.cho_thu}</b> chờ thu ·
            <b className="text-gray-700 ml-1">{invoiceCounts.da_thu}</b> đã thu hôm nay
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {userName && <span className="px-2 py-1 bg-gray-100 rounded-md">👤 {userName}</span>}
        <span className="px-2 py-1 bg-gray-100 rounded-md">{fmtDate(date)}</span>
        <button onClick={onCreate}
          className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          ＋ Tạo phiếu thu
        </button>
      </div>
    </div>
  )
}

// ── Left panel: Invoice list ─────────────────────────────────────────────────

function InvoiceListPanel({ invoices, loading, selectedId, onSelect, statusTab, onStatusTab,
  dateFrom, dateTo, onDateFrom, onDateTo, searchQ, onSearchQ, onRefresh }) {
  return (
    <div className="w-80 flex-shrink-0 flex flex-col bg-white border-r border-gray-200">
      {/* Status tabs as pills */}
      <div className="px-3 py-2 border-b border-gray-200">
        <div className="flex gap-1">
          {STATUS_TABS.map(t => (
            <button key={t.key} onClick={() => onStatusTab(t.key)}
              className={`px-2 py-0.5 text-xs rounded-md transition-colors
                ${statusTab === t.key
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="px-3 py-2 border-b border-gray-200 space-y-1.5">
        <div className="relative">
          <input
            placeholder="Tìm theo tên, SĐT, số phiếu…"
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400"
            value={searchQ} onChange={e => onSearchQ(e.target.value)} />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔎</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span className="text-gray-400">Từ</span>
          <input type="date" className="flex-1 border border-gray-200 rounded px-1.5 py-1 text-xs outline-none focus:border-blue-400"
            value={dateFrom} onChange={e => onDateFrom(e.target.value)} />
          <span className="text-gray-400">đến</span>
          <input type="date" className="flex-1 border border-gray-200 rounded px-1.5 py-1 text-xs outline-none focus:border-blue-400"
            value={dateTo} onChange={e => onDateTo(e.target.value)} />
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-400 font-mono">{invoices.length} phiếu</span>
          <button onClick={onRefresh} className="text-blue-600 hover:text-blue-800">⟳ Làm mới</button>
        </div>
      </div>

      {/* Invoice rows */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loading && (
          <div className="text-center text-xs text-gray-400 py-6">Đang tải…</div>
        )}
        {!loading && invoices.length === 0 && (
          <div className="text-center text-xs text-gray-400 py-6">Không có phiếu thu</div>
        )}
        {invoices.map(inv => {
          const pill = STATUS_PILL[inv.status] || { label: inv.status, cls: 'bg-gray-100 text-gray-700' }
          return (
            <button key={inv._id} onClick={() => onSelect(inv._id)}
              className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors
                ${selectedId === inv._id
                  ? 'bg-blue-50 border-blue-400 shadow-sm'
                  : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
              <div className="flex justify-between items-baseline gap-2">
                <div className="font-semibold text-sm text-gray-800 truncate">{inv.patientName}</div>
                <div className="text-xs text-gray-400 font-mono flex-shrink-0">{fmtDate(inv.createdAt)}</div>
              </div>
              <div className="flex justify-between items-center gap-2 mt-0.5">
                <div className="text-xs text-gray-500 truncate">{inv.phone || '—'}</div>
                <div className="text-xs font-mono text-gray-400 flex-shrink-0">{inv.invoiceNumber}</div>
              </div>
              <div className="flex justify-between items-center gap-2 mt-1">
                <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${pill.cls}`}>{pill.label}</span>
                <span className="text-xs font-mono text-gray-700">{fmtMoney(inv.grandTotal)} đ</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Patient summary card (matches Đăng ký Screen C) ──────────────────────────

function PatientSummary({ invoice }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center">
        {initials(invoice.patientName)}
      </div>
      <div>
        <div className="font-semibold text-gray-800">{invoice.patientName || '—'}</div>
        <div className="text-xs text-gray-500 font-mono">
          {invoice.patientId || '—'}
          {invoice.phone && ` · ${invoice.phone}`}
          {invoice.site && ` · ${invoice.site}`}
        </div>
      </div>
      <div className="w-px h-8 bg-gray-200" />
      <div>
        <div className="text-[10px] uppercase text-gray-400 tracking-wide">Số phiếu</div>
        <div className="text-sm font-mono text-gray-700">{invoice.invoiceNumber}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-gray-400 tracking-wide">Nguồn KH</div>
        <div className="text-sm text-gray-700">{invoice.sourceName || '—'}</div>
      </div>
      {invoice.referralName && (
        <div>
          <div className="text-[10px] uppercase text-gray-400 tracking-wide">Giới thiệu</div>
          <div className="text-sm text-gray-700">{invoice.referralName}</div>
        </div>
      )}
      <div className="flex-1" />
      {(() => {
        const pill = STATUS_PILL[invoice.status] || { label: invoice.status, cls: 'bg-gray-100 text-gray-700' }
        return <span className={`px-2 py-1 text-xs font-semibold rounded-md ${pill.cls}`}>{pill.label}</span>
      })()}
    </div>
  )
}

// ── Center: Payment form + services ──────────────────────────────────────────

function PaymentFormPanel({ invoice, setInvoice, promotions, onCollect, onPrint, onRefund, saving }) {
  const { auth } = useAuth()
  const [payMethod, setPayMethod] = useState('transfer')
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountPct, setDiscountPct] = useState(0)
  const [promoId, setPromoId] = useState('')
  const [promoCodeInput, setPromoCodeInput] = useState('')
  const [promoResult, setPromoResult] = useState(null)
  const [promoError, setPromoError] = useState('')
  const [note, setNote] = useState('')
  const [partner, setPartner] = useState('')
  const [quickDiscountPct, setQuickDiscountPct] = useState(0)
  const [selectedRows, setSelectedRows] = useState(new Set())

  useEffect(() => {
    if (invoice) {
      setDiscountAmount(invoice.totalDiscount || 0)
      setNote(invoice.notes || '')
      setPromoId('')
      setPromoCodeInput('')
      setPromoResult(null)
      setPromoError('')
      setSelectedRows(new Set())
      setQuickDiscountPct(0)
      setPayMethod(invoice.paymentMethod || 'transfer')
    }
  }, [invoice?._id])

  useEffect(() => {
    if (!promoId || !invoice) return
    const promo = promotions.find(p => p._id === promoId)
    if (!promo) return
    if (promo.type === 'percentage') {
      setDiscountPct(promo.discountValue)
      let amt = Math.round(invoice.subtotal * promo.discountValue / 100)
      if (promo.maxDiscountAmount && amt > promo.maxDiscountAmount) amt = promo.maxDiscountAmount
      setDiscountAmount(amt)
    } else {
      setDiscountPct(0)
      setDiscountAmount(promo.discountValue)
    }
  }, [promoId])

  const handleValidateCode = async () => {
    if (!promoCodeInput.trim()) return
    setPromoError('')
    try {
      const res = await api.post('/promotions/validate', {
        code: promoCodeInput.trim(),
        totalAmount: invoice?.subtotal || 0,
        site: invoice?.site || '',
      })
      setPromoResult(res.data)
      setDiscountAmount(res.data.discountAmount)
      if (res.data.promotion?.type === 'percentage') {
        setDiscountPct(res.data.promotion.discountValue)
      }
    } catch (err) {
      setPromoError(err.response?.data?.error || 'Mã không hợp lệ')
      setPromoResult(null)
    }
  }

  const handleDiscountPctChange = (val) => {
    setDiscountPct(val)
    if (invoice) setDiscountAmount(Math.round(invoice.subtotal * val / 100))
  }
  const handleDiscountAmountChange = (val) => {
    setDiscountAmount(val)
    if (invoice && invoice.subtotal > 0) setDiscountPct(Math.round(val / invoice.subtotal * 100 * 100) / 100)
  }

  const applyQuickDiscount = () => {
    if (!invoice || selectedRows.size === 0) return
    const updated = invoice.items.map((it, i) => {
      if (!selectedRows.has(i)) return it
      const lineDiscount = Math.round(it.amount * quickDiscountPct / 100)
      return { ...it, discountAmount: lineDiscount, discountPct: quickDiscountPct }
    })
    const totalLineDiscount = updated.reduce((s, it) => s + (it.discountAmount || 0), 0)
    setInvoice({ ...invoice, items: updated })
    setDiscountAmount(totalLineDiscount)
    setDiscountPct(0)
  }

  const toggleRow = (i) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }
  const toggleAll = () => {
    if (!invoice) return
    if (selectedRows.size === invoice.items.length) setSelectedRows(new Set())
    else setSelectedRows(new Set(invoice.items.map((_, i) => i)))
  }

  if (!invoice) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-8">
        Chọn phiếu thu từ danh sách bên trái hoặc tạo mới
      </div>
    )
  }

  const isPaid = invoice.status === 'paid'
  const isCancelled = invoice.status === 'cancelled' || invoice.status === 'refunded'
  const subtotal = invoice.subtotal || 0
  const actualCollect = subtotal - discountAmount

  const handleCollect = () => {
    onCollect({
      paymentMethod: payMethod,
      totalDiscount: discountAmount,
      notes: note,
      promoCodeId: promoResult?.promoCode?._id,
      promotionId: promoResult?.promotion?._id || promoId,
      partner,
    })
  }

  return (
    <div className="flex-1 p-5 overflow-y-auto space-y-4 min-w-0">
      <PatientSummary invoice={invoice} />

      {/* Action bar */}
      <div className="flex items-center gap-2">
        <button onClick={handleCollect} disabled={saving || isPaid || isCancelled}
          className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
          💰 Thu tiền (F1)
        </button>
        <button onClick={onPrint} disabled={!isPaid}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40">
          🖨️ In phiếu thu
        </button>
        <button disabled={isCancelled}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40">
          🔄 Đổi dịch vụ
        </button>
        <div className="flex-1" />
        <button onClick={onRefund} disabled={!isPaid}
          className="px-3 py-2 text-sm text-rose-600 hover:text-rose-800 disabled:opacity-40">
          ↩️ Hoàn trả
        </button>
      </div>

      {/* Payment details card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Field label="Người thu">
            <input readOnly value={auth?.displayName || auth?.username || ''}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50" />
          </Field>
          <Field label="Ngày thu">
            <input readOnly value={fmtDate(invoice.paidAt || todayISO())}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 font-mono" />
          </Field>

          <Field label="Hình thức thanh toán" required>
            <select value={payMethod} onChange={e => setPayMethod(e.target.value)} disabled={isPaid}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 disabled:bg-gray-50">
              {PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Giảm giá">
            <div className="flex gap-2">
              <input type="number" value={discountAmount}
                onChange={e => handleDiscountAmountChange(+e.target.value)} disabled={isPaid}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right font-mono outline-none focus:border-blue-400 disabled:bg-gray-50" />
              <div className="text-xs text-gray-400 self-center">đ</div>
              <input type="number" value={discountPct} min={0} max={100}
                onChange={e => handleDiscountPctChange(+e.target.value)} disabled={isPaid}
                className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right font-mono outline-none focus:border-blue-400 disabled:bg-gray-50" />
              <div className="text-xs text-gray-400 self-center">%</div>
            </div>
          </Field>

          <Field label="Chương trình khuyến mãi">
            <select value={promoId} onChange={e => setPromoId(e.target.value)} disabled={isPaid}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 disabled:bg-gray-50">
              <option value="">—</option>
              {promotions.map(p => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.type === 'percentage' ? `${p.discountValue}%` : fmtMoney(p.discountValue)})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mã giảm giá">
            <div className="flex gap-1">
              <input value={promoCodeInput} onChange={e => setPromoCodeInput(e.target.value)} disabled={isPaid}
                placeholder="Nhập mã…" onKeyDown={e => e.key === 'Enter' && handleValidateCode()}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 disabled:bg-gray-50" />
              <button onClick={handleValidateCode} disabled={isPaid}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40">
                Áp
              </button>
            </div>
          </Field>

          <Field label="Ghi chú" className="col-span-2">
            <input value={note} onChange={e => setNote(e.target.value)} disabled={isPaid}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 disabled:bg-gray-50" />
          </Field>
        </div>

        {promoError && (
          <div className="mt-3 px-3 py-2 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">{promoError}</div>
        )}
        {promoResult && (
          <div className="mt-3 px-3 py-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg">
            ✓ Áp dụng <b>{promoResult.promotion.name}</b> — giảm {fmtMoney(promoResult.discountAmount)} đ
          </div>
        )}
      </div>

      {/* Services card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-800">Danh sách dịch vụ</h3>
            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">{invoice.items?.length || 0} dịch vụ</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Giảm nhanh</span>
            <input type="number" value={quickDiscountPct} min={0} max={100} placeholder="%"
              onChange={e => setQuickDiscountPct(+e.target.value)} disabled={isPaid}
              className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-right" />
            <span className="text-gray-400">%</span>
            <button onClick={applyQuickDiscount} disabled={isPaid || selectedRows.size === 0}
              className="px-2 py-0.5 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40">
              áp {selectedRows.size > 0 ? `(${selectedRows.size})` : ''}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-2 py-2 w-8">
                  <input type="checkbox"
                    checked={invoice.items?.length > 0 && selectedRows.size === invoice.items.length}
                    onChange={toggleAll} className="w-3 h-3" />
                </th>
                <th className="px-2 py-2 w-8 text-left">#</th>
                <th className="px-2 py-2 text-left">Mã DV</th>
                <th className="px-2 py-2 text-left">Tên dịch vụ</th>
                <th className="px-2 py-2 text-right">Đơn giá</th>
                <th className="px-2 py-2 text-right w-10">SL</th>
                <th className="px-2 py-2 text-right">Thành tiền</th>
                <th className="px-2 py-2 text-right">Giảm</th>
                <th className="px-2 py-2 text-right">Thực thu</th>
              </tr>
            </thead>
            <tbody>
              {(!invoice.items || invoice.items.length === 0) && (
                <tr><td colSpan={9} className="text-center text-gray-400 py-6 text-xs">Không có dịch vụ</td></tr>
              )}
              {invoice.items?.map((it, i) => {
                const lineTotal = (it.unitPrice || 0) * (it.quantity || 1)
                const lineDiscount = it.discountAmount || 0
                const lineFinal = lineTotal - lineDiscount
                const on = selectedRows.has(i)
                return (
                  <tr key={i} className={`border-t border-gray-100 ${on ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={on} onChange={() => toggleRow(i)} className="w-3 h-3" />
                    </td>
                    <td className="px-2 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-2 py-2 font-mono text-xs text-gray-500">{it.serviceCode || ''}</td>
                    <td className="px-2 py-2">{it.serviceName}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtMoney(it.unitPrice)}</td>
                    <td className="px-2 py-2 text-right">{it.quantity || 1}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtMoney(lineTotal)}</td>
                    <td className="px-2 py-2 text-right font-mono text-rose-600">{lineDiscount > 0 ? fmtMoney(lineDiscount) : ''}</td>
                    <td className="px-2 py-2 text-right font-mono font-semibold">{fmtMoney(lineFinal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Field({ label, required, children, className = '' }) {
  return (
    <div className={className}>
      <label className="text-xs text-gray-500 mb-0.5 block">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  )
}

// ── Right panel: Totals ──────────────────────────────────────────────────────

function TotalsSummaryPanel({ invoice, discountAmount }) {
  const subtotal = invoice?.subtotal || 0
  const discount = discountAmount || invoice?.totalDiscount || 0
  const actual = subtotal - discount
  const paid = invoice?.paidAmount || 0
  const owed = Math.max(0, actual - paid)

  return (
    <div className="w-64 flex-shrink-0 p-4 bg-white border-l border-gray-200 space-y-4">
      <div className="text-sm font-semibold text-gray-800 pb-2 border-b border-gray-100">Tổng kết</div>
      <div>
        <div className="text-xs text-gray-500 mb-1">Tổng tiền</div>
        <div className="text-xl font-bold text-gray-800 font-mono">{fmtMoney(subtotal)} đ</div>
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">Tổng giảm</div>
        <div className="text-xl font-bold text-rose-600 font-mono">-{fmtMoney(discount)} đ</div>
      </div>
      {paid > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Đã thanh toán</div>
          <div className="text-lg font-semibold text-emerald-700 font-mono">{fmtMoney(paid)} đ</div>
        </div>
      )}
      <div className="pt-3 border-t border-gray-200">
        <div className="text-xs text-gray-500 mb-1">{owed > 0 ? 'Còn phải thu' : 'Thực thu'}</div>
        <div className="text-2xl font-bold text-blue-700 font-mono">{fmtMoney(owed > 0 ? owed : actual)} đ</div>
      </div>
    </div>
  )
}

// ── Create Invoice Modal ─────────────────────────────────────────────────────

function CreateInvoiceModal({ onClose, onCreated, userDept }) {
  const [form, setForm] = useState({ patientName: '', phone: '', site: userDept || '', notes: '' })
  const [items, setItems] = useState([{ serviceName: '', serviceCode: '', unitPrice: 0, quantity: 1 }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addItem = () => setItems(prev => [...prev, { serviceName: '', serviceCode: '', unitPrice: 0, quantity: 1 }])
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i, field, val) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))
  const subtotal = items.reduce((s, it) => s + (it.unitPrice || 0) * (it.quantity || 1), 0)

  const handleSave = async () => {
    if (!form.patientName.trim()) return setError('Vui lòng nhập tên bệnh nhân')
    if (items.length === 0 || !items[0].serviceName) return setError('Vui lòng thêm ít nhất 1 dịch vụ')
    setSaving(true); setError('')
    try {
      const res = await api.post('/billing/invoices', {
        ...form,
        items: items.map(it => ({
          serviceName: it.serviceName,
          serviceCode: it.serviceCode || '',
          unitPrice: +it.unitPrice,
          quantity: +it.quantity || 1,
        })),
      })
      onCreated(res.data)
    } catch (err) { setError(err.response?.data?.error || 'Lỗi tạo phiếu') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">Tạo phiếu thu mới</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <div className="px-3 py-2 text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tên bệnh nhân" required>
              <input value={form.patientName} onChange={e => setForm(p => ({ ...p, patientName: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </Field>
            <Field label="Số điện thoại">
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </Field>
            <Field label="Chi nhánh">
              <input value={form.site} onChange={e => setForm(p => ({ ...p, site: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </Field>
            <Field label="Ghi chú">
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Dịch vụ</label>
              <button onClick={addItem} className="text-xs text-blue-600 hover:text-blue-800">＋ Thêm dòng</button>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-2 py-2 w-8 text-left">#</th>
                    <th className="px-2 py-2 text-left w-24">Mã DV</th>
                    <th className="px-2 py-2 text-left">Tên dịch vụ</th>
                    <th className="px-2 py-2 text-right w-28">Đơn giá</th>
                    <th className="px-2 py-2 text-right w-14">SL</th>
                    <th className="px-2 py-2 text-right w-28">Thành tiền</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                      <td className="px-2 py-1">
                        <input value={it.serviceCode} onChange={e => updateItem(i, 'serviceCode', e.target.value)}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm font-mono outline-none focus:border-blue-400"
                          placeholder="Mã" />
                      </td>
                      <td className="px-2 py-1">
                        <input value={it.serviceName} onChange={e => updateItem(i, 'serviceName', e.target.value)}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm outline-none focus:border-blue-400"
                          placeholder="Tên dịch vụ" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" value={it.unitPrice} onChange={e => updateItem(i, 'unitPrice', +e.target.value)}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right font-mono outline-none focus:border-blue-400" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min={1} value={it.quantity} onChange={e => updateItem(i, 'quantity', +e.target.value)}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right font-mono outline-none focus:border-blue-400" />
                      </td>
                      <td className="px-2 py-1 text-right font-mono">
                        {fmtMoney((it.unitPrice || 0) * (it.quantity || 1))}
                      </td>
                      <td className="px-2 py-1 text-center">
                        {items.length > 1 && (
                          <button onClick={() => removeItem(i)} className="text-rose-400 hover:text-rose-600 text-sm">✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right mt-2 text-sm font-semibold text-gray-700">
              Tổng: <span className="text-blue-700 font-mono">{fmtMoney(subtotal)} đ</span>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Đang lưu…' : 'Tạo phiếu thu'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Billing() {
  const { auth } = useAuth()

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [statusTab, setStatusTab] = useState('cho_thu')
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo] = useState(todayISO())
  const [searchQ, setSearchQ] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [promotions, setPromotions] = useState([])
  const [counts, setCounts] = useState({ cho_thu: 0, da_thu: 0 })

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const params = { limit: 200 }
      if (statusTab !== 'all') {
        const statuses = PAY_STATUS_MAP[statusTab]
        if (statuses) params.status = statuses.join(',')
      }
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      if (searchQ) params.q = searchQ

      const res = await api.get('/billing/invoices', { params })
      let list = res.data.invoices || []
      if (statusTab !== 'all' && PAY_STATUS_MAP[statusTab]) {
        const allowed = PAY_STATUS_MAP[statusTab]
        list = list.filter(inv => allowed.includes(inv.status))
      }
      setInvoices(list)
    } catch { setInvoices([]) }
    setLoading(false)
  }, [statusTab, dateFrom, dateTo, searchQ])

  // Load today counts for the header (cheap — same endpoint)
  const loadCounts = useCallback(async () => {
    try {
      const today = todayISO()
      const res = await api.get('/billing/invoices', { params: { dateFrom: today, dateTo: today, limit: 500 } })
      const all = res.data.invoices || []
      setCounts({
        cho_thu: all.filter(i => PAY_STATUS_MAP.cho_thu.includes(i.status)).length,
        da_thu: all.filter(i => PAY_STATUS_MAP.da_thu.includes(i.status)).length,
      })
    } catch {}
  }, [])

  const loadPromotions = useCallback(async () => {
    try {
      const res = await api.get('/promotions/active')
      setPromotions(res.data)
    } catch { setPromotions([]) }
  }, [])

  useEffect(() => { loadInvoices() }, [loadInvoices])
  useEffect(() => { loadCounts() }, [loadCounts, invoices])
  useEffect(() => { loadPromotions() }, [loadPromotions])

  useEffect(() => {
    if (!selectedId) { setSelectedInvoice(null); return }
    api.get(`/billing/invoices/${selectedId}`).then(r => {
      setSelectedInvoice(r.data)
      setDiscountAmount(r.data.totalDiscount || 0)
    }).catch(() => setSelectedInvoice(null))
  }, [selectedId])

  const handleCollect = async (payData) => {
    if (!selectedInvoice) return
    setSaving(true)
    try {
      if (payData.totalDiscount !== selectedInvoice.totalDiscount) {
        await api.put(`/billing/invoices/${selectedInvoice._id}`, {
          totalDiscount: payData.totalDiscount,
          notes: payData.notes,
        })
      }
      const grandTotal = selectedInvoice.subtotal - (payData.totalDiscount || 0)
      const payAmount = grandTotal - selectedInvoice.paidAmount
      if (payAmount > 0) {
        await api.post(`/billing/invoices/${selectedInvoice._id}/pay`, {
          amount: payAmount,
          paymentMethod: payData.paymentMethod,
        })
      }
      if (payData.promoCodeId || payData.promotionId) {
        try {
          await api.post('/promotions/apply', {
            promoCodeId: payData.promoCodeId,
            promotionId: payData.promotionId,
          })
        } catch {}
      }
      const res = await api.get(`/billing/invoices/${selectedInvoice._id}`)
      setSelectedInvoice(res.data)
      loadInvoices()
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi thu tiền')
    }
    setSaving(false)
  }

  const handleRefund = async () => {
    if (!selectedInvoice) return
    if (!confirm('Bạn có chắc muốn hoàn trả phiếu thu này?')) return
    try {
      await api.post(`/billing/invoices/${selectedInvoice._id}/refund`, { reason: 'Hoàn trả theo yêu cầu' })
      const res = await api.get(`/billing/invoices/${selectedInvoice._id}`)
      setSelectedInvoice(res.data)
      loadInvoices()
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi hoàn trả')
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-4 bg-gray-50">
      <PageHeader
        userName={auth?.displayName || auth?.username}
        date={todayISO()}
        onCreate={() => setShowCreate(true)}
        invoiceCounts={counts}
      />
      <div className="flex-1 flex min-h-0">
        <InvoiceListPanel
          invoices={invoices} loading={loading}
          selectedId={selectedId} onSelect={setSelectedId}
          statusTab={statusTab} onStatusTab={setStatusTab}
          dateFrom={dateFrom} dateTo={dateTo}
          onDateFrom={setDateFrom} onDateTo={setDateTo}
          searchQ={searchQ} onSearchQ={setSearchQ}
          onRefresh={loadInvoices}
        />
        <PaymentFormPanel
          invoice={selectedInvoice}
          setInvoice={setSelectedInvoice}
          promotions={promotions}
          onCollect={handleCollect}
          onPrint={() => window.print()}
          onRefund={handleRefund}
          saving={saving}
        />
        {selectedInvoice && (
          <TotalsSummaryPanel invoice={selectedInvoice} discountAmount={discountAmount} />
        )}
      </div>

      {showCreate && (
        <CreateInvoiceModal
          userDept={auth?.department}
          onClose={() => setShowCreate(false)}
          onCreated={(inv) => { setShowCreate(false); loadInvoices(); setSelectedId(inv._id) }}
        />
      )}
    </div>
  )
}
