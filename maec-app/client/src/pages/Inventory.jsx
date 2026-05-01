import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

// ─── constants ──────────────────────────────────────────────────────────────
const TX_TYPES = {
  import: 'Nhập kho', export: 'Xuất kho', adjustment: 'Điều chỉnh',
  auto_deduct: 'Trừ tự động', transfer_out: 'Chuyển đi', transfer_in: 'Chuyển đến',
}
const TX_CLS = {
  import: 'bg-teal-50 text-teal-700 border-teal-200',
  export: 'bg-orange-50 text-orange-700 border-orange-200',
  adjustment: 'bg-slate-50 text-slate-700 border-slate-200',
  auto_deduct: 'bg-purple-50 text-purple-700 border-purple-200',
  transfer_out: 'bg-amber-50 text-amber-700 border-amber-200',
  transfer_in: 'bg-blue-50 text-blue-700 border-blue-200',
}
const ST_CLS = { draft: 'bg-gray-100 text-gray-700', confirmed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700' }
const ST_LBL = { draft: 'Nháp', confirmed: 'Đã xác nhận', cancelled: 'Đã hủy' }

const REASON_PRESETS = {
  export: [
    { code: 'expired',  name: 'Tiêu hủy — hết hạn' },
    { code: 'damaged',  name: 'Hỏng / vỡ' },
    { code: 'return',   name: 'Trả NCC' },
    { code: 'other',    name: 'Khác' },
  ],
  adjustment: [
    { code: 'stocktake', name: 'Kiểm kê định kỳ' },
    { code: 'count_error', name: 'Sai số đếm' },
    { code: 'other', name: 'Khác' },
  ],
  stocktake: [
    { code: 'count_error', name: 'Sai số đếm' },
    { code: 'loss', name: 'Thất thoát' },
    { code: 'found', name: 'Tìm thấy dôi dư' },
    { code: 'damaged', name: 'Hỏng / vỡ' },
    { code: 'other', name: 'Khác' },
  ],
}

const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')
const fmtDate = (iso) => {
  if (!iso) return '—'
  const s = (iso || '').toString()
  if (s.length === 7 && s.includes('/')) return s
  const d = s.slice(0, 10)
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}
const daysUntil = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

// ─── tiny atoms ─────────────────────────────────────────────────────────────
const Pill = ({ children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}>{children}</span>
)
const TabBtn = ({ active, children, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
  >
    {children}
    {badge != null && badge > 0 && (
      <span className={`ml-1.5 px-1.5 rounded-full text-xs font-semibold ${active ? 'bg-white/20' : 'bg-red-100 text-red-700'}`}>{badge}</span>
    )}
  </button>
)
const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-200 ${className}`}>{children}</div>
)

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function Inventory() {
  const { auth } = useAuth()

  // Warehouse scope: the module's core state.
  //  - warehouses: list of warehouses the current user can see
  //  - supervisor: true if this user gets the "all" option + matrix tab
  //  - activeWh: currently selected warehouse, or null = "all accessible" (supervisor only)
  const [warehouses, setWarehouses] = useState([])
  const [supervisor, setSupervisor] = useState(false)
  const [activeWhId, setActiveWhId] = useState(null)  // null = "all" (supervisor only)
  const [tab, setTab] = useState('overview')
  const [bootError, setBootError] = useState('')

  useEffect(() => {
    api.get('/inventory/warehouses/accessible').then(({ data }) => {
      setWarehouses(data.warehouses || [])
      setSupervisor(!!data.supervisor)
      // Default scope: nv_kho → their only warehouse; supervisor → "all"
      if (data.supervisor) setActiveWhId(null)
      else if (data.defaultWarehouseId) setActiveWhId(data.defaultWarehouseId)
      else if (data.warehouses?.length === 1) setActiveWhId(data.warehouses[0]._id)
    }).catch(e => setBootError(e.response?.data?.error || 'Không tải được kho'))
  }, [])

  const activeWh = useMemo(() => warehouses.find(w => w._id === activeWhId), [warehouses, activeWhId])

  // Query param shared by all scope-bound endpoints
  const whParam = activeWhId ? `?warehouseId=${activeWhId}` : ''

  if (bootError) {
    return <div className="p-8"><div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{bootError}</div></div>
  }
  if (!warehouses.length) {
    return <div className="p-8 text-gray-500 text-sm">Đang tải kho...</div>
  }
  if (!supervisor && !activeWh) {
    return <div className="p-8"><div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">Bạn chưa được gán kho nào. Liên hệ quản trị viên.</div></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        activeWh={activeWh}
        auth={auth}
        supervisor={supervisor}
        warehouses={warehouses}
        onSwitch={setActiveWhId}
        activeWhId={activeWhId}
      />
      <div className="max-w-[1600px] mx-auto p-6">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>Tổng quan</TabBtn>
          <TabBtn active={tab === 'stock'} onClick={() => setTab('stock')}>Tồn kho</TabBtn>
          <TabBtn active={tab === 'transactions'} onClick={() => setTab('transactions')}>Giao dịch</TabBtn>
          <TabBtn active={tab === 'stocktake'} onClick={() => setTab('stocktake')}>Kiểm kê</TabBtn>
          {supervisor && <TabBtn active={tab === 'matrix'} onClick={() => setTab('matrix')}>Tổng hợp chuỗi</TabBtn>}
        </div>

        {tab === 'overview' && <OverviewTab whParam={whParam} activeWh={activeWh} supervisor={supervisor} onNavigate={setTab} />}
        {tab === 'stock' && <StockTab whParam={whParam} supervisor={supervisor} activeWh={activeWh} />}
        {tab === 'transactions' && <TransactionsTab whParam={whParam} warehouses={warehouses} activeWh={activeWh} supervisor={supervisor} />}
        {tab === 'stocktake' && <StocktakeTab whParam={whParam} warehouses={warehouses} activeWh={activeWh} supervisor={supervisor} />}
        {tab === 'matrix' && supervisor && <MatrixTab warehouses={warehouses} />}
      </div>
    </div>
  )
}

// ─── PageHeader ────────────────────────────────────────────────────────────
// Matches the Đăng ký / Billing / Ca đọc header strip: title + breadcrumb +
// context chip + user/date pills. The warehouse switcher (supervisor only)
// sits in the right cluster next to those pills.
function PageHeader({ activeWh, auth, supervisor, warehouses, onSwitch, activeWhId }) {
  const date = new Date()
  const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
  const scopeLabel = activeWh ? activeWh.name : (supervisor ? `Tất cả kho (${warehouses.length})` : '')
  const userName = auth?.displayName || auth?.username
  return (
    <div className="flex items-center gap-6 px-4 py-2 border-b bg-white">
      <div className="flex items-baseline gap-2">
        <div className="text-lg font-semibold text-gray-800">Quản lý kho</div>
        <div className="text-xs text-gray-400 font-mono">/vận hành</div>
      </div>
      <div className="flex-1 text-xs text-gray-500">
        {scopeLabel && <span>Phạm vi: <b className="text-gray-700">{scopeLabel}</b></span>}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {supervisor && (
          <select
            className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={activeWhId || ''}
            onChange={e => onSwitch(e.target.value || null)}
          >
            <option value="">Tất cả kho ({warehouses.length})</option>
            {warehouses.map(w => (
              <option key={w._id} value={w._id}>{w.name}</option>
            ))}
          </select>
        )}
        {userName && <span className="px-2 py-1 bg-gray-100 rounded-md">👤 {userName}</span>}
        <span className="px-2 py-1 bg-gray-100 rounded-md">{dateStr}</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. TỔNG QUAN
// ═══════════════════════════════════════════════════════════════════════════
function OverviewTab({ whParam, activeWh, supervisor, onNavigate }) {
  const [alerts, setAlerts] = useState(null)
  const [activity, setActivity] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      api.get(`/inventory/alerts${whParam}`),
      api.get(`/inventory/activity-today${whParam}`),
    ]).then(([a, b]) => {
      if (!alive) return
      setAlerts(a.data); setActivity(b.data); setLoading(false)
    }).catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [whParam])

  if (loading) return <SkeletonBlock />
  if (!alerts) return null

  const actionCount = alerts.pendingTransfers.count + alerts.autoDeductVariance.count
  const expiringCount = alerts.expiringSoon.lots.length
  const belowMinCount = alerts.belowMinimum.supplies.length

  return (
    <div className="space-y-4">
      {/* Cần xử lý */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div className="font-semibold text-gray-900">Cần xử lý</div>
          {actionCount > 0 && <div className="text-xs text-gray-400">{actionCount} mục đang chờ</div>}
        </div>
        <div className="divide-y divide-gray-100">
          {alerts.pendingTransfers.transfers.map(t => (
            <ActionRow key={t._id}
              dot="blue"
              title={`Nhận hàng ${t.counterpartyWarehouseName || ''} · ${t.transactionNumber}`}
              hint={`${(t.items || []).length} dòng VT`}
              time={fmtDate(t.createdAt)}
              action="Nhận →"
            />
          ))}
          {alerts.autoDeductVariance.transactions.map(t => (
            <ActionRow key={t._id}
              dot="red"
              title={`Sai khác định mức · ${t.transactionNumber}`}
              hint={t.reason || ''}
              time={fmtDate(t.createdAt)}
              action="Xác nhận →"
            />
          ))}
          {actionCount === 0 && (
            <div className="text-sm text-gray-400 py-6 text-center">Không có mục nào cần xử lý. ✨</div>
          )}
        </div>
      </Card>

      {/* Sắp hết hạn + Dưới định mức */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-semibold text-gray-900">Sắp hết hạn</div>
            {expiringCount > 0 && <div className="text-xs text-gray-400">{expiringCount} lô</div>}
          </div>
          {expiringCount === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center">Không có lô sắp hết hạn trong 60 ngày tới.</div>
          ) : (
            <div className="space-y-3">
              {alerts.expiringSoon.lots.map(lot => {
                const days = daysUntil(lot.expiryDate)
                const cls = days <= 10 ? 'text-red-700' : days <= 30 ? 'text-amber-700' : 'text-gray-600'
                return (
                  <div key={lot._id} className="flex justify-between items-start">
                    <div>
                      <div className="text-sm text-gray-900">{lot.supplyId}</div>
                      <div className="text-xs text-gray-500">Lô {lot.lotNumber} · {lot.currentQuantity} còn lại</div>
                    </div>
                    <div className={`text-sm font-medium ${cls}`}>{days != null ? `${days} ngày` : '—'}</div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-semibold text-gray-900">Dưới định mức</div>
            {belowMinCount > 0 && <div className="text-xs text-gray-400">{belowMinCount} vật tư</div>}
          </div>
          {belowMinCount === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center">Không có vật tư dưới định mức.</div>
          ) : (
            <div className="space-y-3">
              {alerts.belowMinimum.supplies.map(s => {
                const ratio = s.qty / (s.minimumStock || 1)
                const cls = ratio < 0.3 ? 'text-red-700' : 'text-amber-700'
                return (
                  <div key={s.supplyId} className="flex justify-between items-start">
                    <div>
                      <div className="text-sm text-gray-900">{s.name}</div>
                      <div className="text-xs text-gray-500">{s.code}</div>
                    </div>
                    <div className={`text-sm font-medium ${cls}`}>{s.qty} / {s.minimumStock}</div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Hoạt động hôm nay */}
      {activity && (
        <Card className="p-4">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs text-gray-500">Hoạt động hôm nay</div>
              <div className="text-sm text-gray-900 mt-1">
                {activity.counts.import || 0} phiếu nhập · {activity.counts.export || 0} phiếu xuất · {activity.counts.auto_deduct || 0} ca quét · {activity.counts.transfer_in + activity.counts.transfer_out || 0} điều chuyển
              </div>
            </div>
            <button onClick={() => onNavigate('transactions')} className="text-sm text-blue-600 hover:underline">Nhật ký đầy đủ →</button>
          </div>
        </Card>
      )}
    </div>
  )
}

function ActionRow({ dot, title, hint, time, action }) {
  const dotCls = { blue: 'bg-blue-500', red: 'bg-red-500', amber: 'bg-amber-500', green: 'bg-green-500' }[dot] || 'bg-gray-400'
  return (
    <div className="flex items-center py-3 gap-3">
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 truncate">{title}</div>
        {hint && <div className="text-xs text-gray-500 truncate">{hint}</div>}
      </div>
      <div className="text-xs text-gray-400 shrink-0">{time}</div>
      <button className="text-xs text-blue-600 hover:underline shrink-0">{action}</button>
    </div>
  )
}

const SkeletonBlock = () => (
  <div className="space-y-3 animate-pulse">
    <div className="h-40 bg-white rounded-xl border border-gray-200" />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="h-48 bg-white rounded-xl border border-gray-200" />
      <div className="h-48 bg-white rounded-xl border border-gray-200" />
    </div>
  </div>
)

// ═══════════════════════════════════════════════════════════════════════════
//  2. TỒN KHO
// ═══════════════════════════════════════════════════════════════════════════
function StockTab({ whParam }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [belowMin, setBelowMin] = useState(false)
  const [drawerSupplyId, setDrawerSupplyId] = useState(null)
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [productKind, setProductKind] = useState('')  // '' / thuoc / kinh / supply

  useEffect(() => { api.get('/inventory/categories').then(({ data }) => setCategories(data || [])) }, [])

  const load = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (whParam) qs.set('warehouseId', whParam.replace('?warehouseId=', ''))
    if (q) qs.set('q', q)
    if (belowMin) qs.set('belowMin', 'true')
    if (categoryId) qs.set('categoryId', categoryId)
    if (productKind) qs.set('productKind', productKind)
    api.get(`/inventory/stock?${qs}`).then(({ data }) => {
      setRows(data.rows || []); setLoading(false)
    }).catch(() => setLoading(false))
  }, [whParam, q, belowMin, categoryId, productKind])

  useEffect(() => { load() }, [load])

  const KIND_TABS = [
    { k: '',       label: 'Tất cả' },
    { k: 'thuoc',  label: 'Thuốc 💊' },
    { k: 'kinh',   label: 'Kính 👓' },
    { k: 'supply', label: 'Vật tư' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {KIND_TABS.map(t => (
          <button key={t.k} onClick={() => setProductKind(t.k)}
            className={`px-3 py-1.5 text-sm rounded-lg font-semibold ${productKind === t.k ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <Card className="p-3 flex items-center gap-2 flex-wrap">
        <input
          className="flex-1 min-w-[240px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Tìm theo tên hoặc mã..."
          value={q} onChange={e => setQ(e.target.value)}
        />
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">Tất cả nhóm VT</option>
          {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 px-2">
          <input type="checkbox" checked={belowMin} onChange={e => setBelowMin(e.target.checked)} />
          Chỉ hiển thị dưới định mức
        </label>
      </Card>

      <Card>
        <div className="grid grid-cols-[1fr_100px_100px_140px_80px] gap-3 px-4 py-3 text-xs text-gray-500 border-b border-gray-100">
          <div>Vật tư</div>
          <div className="text-right">Tồn</div>
          <div className="text-right">Định mức</div>
          <div className="text-right">HSD gần nhất</div>
          <div className="text-right">Số lô</div>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-sm">Đang tải...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">Không có vật tư nào.</div>
        ) : (
          rows.map(r => {
            const days = daysUntil(r.nearestExpiry)
            const expiryCls = days == null ? 'text-gray-400' : days <= 10 ? 'text-red-700' : days <= 30 ? 'text-amber-700' : 'text-gray-700'
            return (
              <button
                key={r.supply._id}
                onClick={() => setDrawerSupplyId(r.supply._id)}
                className="w-full grid grid-cols-[1fr_100px_100px_140px_80px] gap-3 px-4 py-3 text-sm border-b border-gray-50 hover:bg-gray-50 text-left"
              >
                <div>
                  <div className="text-gray-900">{r.supply.name}</div>
                  <div className="text-xs text-gray-500">{r.supply.code} · {r.supply.unit}</div>
                </div>
                <div className="text-right tabular-nums text-gray-900">{r.qty}</div>
                <div className={`text-right tabular-nums ${r.belowMin ? 'text-red-700 font-medium' : 'text-gray-500'}`}>{r.supply.minimumStock || '—'}</div>
                <div className={`text-right text-xs ${expiryCls}`}>
                  {r.nearestExpiry ? `${fmtDate(r.nearestExpiry)} ${days != null ? `(${days}d)` : ''}` : '—'}
                </div>
                <div className="text-right tabular-nums text-gray-500">{r.lotCount}</div>
              </button>
            )
          })
        )}
      </Card>

      {drawerSupplyId && (
        <LotDrawer supplyId={drawerSupplyId} whParam={whParam} onClose={() => setDrawerSupplyId(null)} />
      )}
    </div>
  )
}

function LotDrawer({ supplyId, whParam, onClose }) {
  const [lots, setLots] = useState([])
  const [card, setCard] = useState(null)

  useEffect(() => {
    api.get(`/inventory/lots${whParam}${whParam ? '&' : '?'}supplyId=${supplyId}`).then(({ data }) => setLots(data || []))
    api.get(`/inventory/reports/card/${supplyId}${whParam}`).then(({ data }) => setCard(data))
  }, [supplyId, whParam])

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 bg-white">
          <div>
            <div className="text-xs text-gray-500">{card?.supply?.code}</div>
            <div className="font-semibold text-gray-900">{card?.supply?.name || 'Đang tải...'}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <div className="text-sm font-medium text-gray-900 mb-2">Các lô (FEFO)</div>
            {lots.length === 0 ? (
              <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">Không có lô nào trong kho.</div>
            ) : (
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                {lots.map(lot => {
                  const days = daysUntil(lot.expiryDate)
                  const cls = lot.status === 'depleted' || lot.status === 'expired' ? 'opacity-60' : ''
                  return (
                    <div key={lot._id} className={`px-4 py-3 text-sm ${cls}`}>
                      <div className="flex justify-between">
                        <div className="font-medium text-gray-900">Lô {lot.lotNumber}</div>
                        <div className="tabular-nums">{lot.currentQuantity} / {lot.initialQuantity}</div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex justify-between">
                        <span>HSD {fmtDate(lot.expiryDate)}{days != null ? ` (${days}d)` : ''}</span>
                        <span>{lot.status}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <div className="text-sm font-medium text-gray-900 mb-2">Sổ kho</div>
            <div className="text-xs text-gray-500 mb-2">Tồn hiện tại: <span className="font-medium text-gray-900">{card?.currentBalance ?? 0}</span></div>
            {card?.entries?.length ? (
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[80px_1fr_60px_60px_60px] px-3 py-2 bg-gray-50 text-xs text-gray-500">
                  <div>Ngày</div><div>Phiếu</div><div className="text-right">Nhập</div><div className="text-right">Xuất</div><div className="text-right">Tồn</div>
                </div>
                {card.entries.slice(-20).reverse().map((e, i) => (
                  <div key={i} className="grid grid-cols-[80px_1fr_60px_60px_60px] px-3 py-1.5 text-xs border-t border-gray-50">
                    <div className="text-gray-600">{e.date}</div>
                    <div className="text-gray-900 truncate">{e.transactionNumber} <span className="text-gray-400">{TX_TYPES[e.type] || e.type}</span></div>
                    <div className="text-right text-teal-700">{e.inQty || ''}</div>
                    <div className="text-right text-orange-700">{e.outQty || ''}</div>
                    <div className="text-right tabular-nums text-gray-900">{e.balance}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">Chưa có giao dịch.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. GIAO DỊCH
// ═══════════════════════════════════════════════════════════════════════════
function TransactionsTab({ whParam, warehouses, activeWh, supervisor }) {
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [createKind, setCreateKind] = useState(null) // 'import' | 'export' | 'adjustment' | 'transfer'

  const load = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (whParam) qs.set('warehouseId', whParam.replace('?warehouseId=', ''))
    if (type) qs.set('type', type)
    if (status) qs.set('status', status)
    if (dateFrom) qs.set('dateFrom', dateFrom)
    if (dateTo) qs.set('dateTo', dateTo)
    api.get(`/inventory/transactions?${qs}`).then(({ data }) => {
      setTxs(data || []); setLoading(false)
    }).catch(() => setLoading(false))
  }, [whParam, type, status, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Card className="p-3 flex items-center gap-2 flex-wrap flex-1 min-w-[300px]">
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={type} onChange={e => setType(e.target.value)}>
            <option value="">Tất cả loại</option>
            {Object.entries(TX_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(ST_LBL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-gray-400">→</span>
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </Card>
        <div className="relative">
          <button
            onClick={() => setCreateMenuOpen(v => !v)}
            disabled={!activeWh}
            className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={!activeWh ? 'Chọn một kho để tạo phiếu' : ''}
          >
            ＋ Tạo giao dịch ▾
          </button>
          {createMenuOpen && (
            <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[180px]">
              {[
                ['import', 'Nhập kho'],
                ['export', 'Xuất kho'],
                ['transfer', 'Điều chuyển'],
                ['adjustment', 'Điều chỉnh'],
              ].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => { setCreateKind(k); setCreateMenuOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >{label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-[130px_1fr_140px_100px_120px_90px] gap-3 px-4 py-3 text-xs text-gray-500 border-b border-gray-100">
          <div>Ngày</div>
          <div>Số phiếu / ghi chú</div>
          <div>Loại</div>
          <div>Dòng VT</div>
          <div className="text-right">Tổng tiền</div>
          <div className="text-right">Trạng thái</div>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-sm">Đang tải...</div>
        ) : txs.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">Chưa có giao dịch nào.</div>
        ) : (
          txs.map(t => (
            <button
              key={t._id}
              onClick={() => setDetailId(t._id)}
              className="w-full grid grid-cols-[130px_1fr_140px_100px_120px_90px] gap-3 px-4 py-3 text-sm border-b border-gray-50 hover:bg-gray-50 text-left"
            >
              <div className="text-gray-500 text-xs">{fmtDate(t.createdAt)}</div>
              <div>
                <div className="text-gray-900 truncate">{t.transactionNumber}{supervisor ? ` · ${t.warehouseName || ''}` : ''}</div>
                <div className="text-xs text-gray-500 truncate">{t.reason || t.supplierName || t.counterpartyWarehouseName || '—'}</div>
              </div>
              <div><Pill className={TX_CLS[t.type] || 'bg-gray-50 border-gray-200'}>{TX_TYPES[t.type] || t.type}</Pill></div>
              <div className="text-gray-500 tabular-nums">{(t.items || []).length}</div>
              <div className="text-right tabular-nums text-gray-900">{fmtMoney(t.totalAmount)}</div>
              <div className="text-right"><Pill className={ST_CLS[t.status]}>{ST_LBL[t.status]}</Pill></div>
            </button>
          ))
        )}
      </Card>

      {detailId && <TransactionDetailDrawer id={detailId} onClose={() => setDetailId(null)} onChanged={load} />}
      {createKind && (
        <CreateTransactionModal
          kind={createKind}
          warehouse={activeWh}
          warehouses={warehouses}
          onClose={() => setCreateKind(null)}
          onSaved={() => { setCreateKind(null); load() }}
        />
      )}
    </div>
  )
}

function TransactionDetailDrawer({ id, onClose, onChanged }) {
  const [tx, setTx] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get(`/inventory/transactions/${id}`).then(({ data }) => setTx(data)) }, [id])
  const confirm = async () => {
    if (!window.confirm('Xác nhận phiếu này? Sẽ cập nhật tồn kho ngay.')) return
    setBusy(true)
    try { await api.put(`/inventory/transactions/${id}/confirm`); onChanged(); onClose() }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); setBusy(false) }
  }
  const cancel = async () => {
    if (!window.confirm('Hủy phiếu này?')) return
    setBusy(true)
    try { await api.put(`/inventory/transactions/${id}/cancel`); onChanged(); onClose() }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 bg-white">
          <div>
            <div className="text-xs text-gray-500">{tx ? TX_TYPES[tx.type] : ''}</div>
            <div className="font-semibold text-gray-900">{tx?.transactionNumber || 'Đang tải...'}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        {tx && (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Kho">{tx.warehouseName}</Field>
              {tx.counterpartyWarehouseName && <Field label="Kho đối ứng">{tx.counterpartyWarehouseName}</Field>}
              {tx.supplierName && <Field label="Nhà cung cấp">{tx.supplierName}</Field>}
              <Field label="Trạng thái"><Pill className={ST_CLS[tx.status]}>{ST_LBL[tx.status]}</Pill></Field>
              <Field label="Tạo bởi">{tx.createdBy} · {fmtDate(tx.createdAt)}</Field>
              {tx.confirmedBy && <Field label="Xác nhận bởi">{tx.confirmedBy} · {fmtDate(tx.confirmedAt)}</Field>}
              {tx.reason && <Field label="Lý do" full>{tx.reason}</Field>}
              {tx.notes && <Field label="Ghi chú" full>{tx.notes}</Field>}
            </div>

            <div>
              <div className="text-sm font-medium text-gray-900 mb-2">Dòng vật tư ({tx.items.length})</div>
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_90px_70px_100px] px-3 py-2 bg-gray-50 text-xs text-gray-500">
                  <div>Vật tư</div><div>Số lô</div><div className="text-right">SL</div><div className="text-right">Tổng</div>
                </div>
                {tx.items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_70px_100px] px-3 py-2 text-sm border-t border-gray-50">
                    <div>
                      <div className="text-gray-900">{it.supplyName}</div>
                      <div className="text-xs text-gray-500">{it.supplyCode} · {it.unit}</div>
                      {it.notes && <div className="text-xs text-amber-700 mt-0.5">{it.notes}</div>}
                    </div>
                    <div className="text-xs text-gray-600">{it.lotNumber || '—'}</div>
                    <div className="text-right tabular-nums">{it.quantity}</div>
                    <div className="text-right tabular-nums">{fmtMoney(it.amount)}</div>
                  </div>
                ))}
              </div>
            </div>

            {tx.status === 'draft' && (
              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                <button onClick={cancel} disabled={busy} className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Hủy phiếu</button>
                <button onClick={confirm} disabled={busy} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Xác nhận</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
const Field = ({ label, children, full }) => (
  <div className={full ? 'col-span-2' : ''}>
    <div className="text-xs text-gray-500">{label}</div>
    <div className="text-gray-900 mt-0.5">{children}</div>
  </div>
)

// ─── Create Transaction Modal (Nhập / Xuất / Điều chỉnh / Điều chuyển) ─────
function CreateTransactionModal({ kind, warehouse, warehouses, onClose, onSaved }) {
  const isImport = kind === 'import'
  const isExport = kind === 'export'
  const isTransfer = kind === 'transfer'
  const isAdjustment = kind === 'adjustment'

  const [supplies, setSupplies] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [reasonCode, setReasonCode] = useState(REASON_PRESETS[kind]?.[0]?.code || '')
  const [toWhId, setToWhId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/inventory/supplies?status=active').then(({ data }) => setSupplies(data || []))
    if (isImport) api.get('/inventory/suppliers?status=active').then(({ data }) => setSuppliers(data || []))
  }, [isImport])

  function emptyLine() {
    return { supplyId: '', supplyName: '', supplyCode: '', unit: '', packagingSpec: '', quantity: 1, lotNumber: '', expiryDate: '', manufacturingDate: '', purchasePrice: 0, vatRate: 0, notes: '' }
  }
  const updateItem = (i, patch) => setItems(p => p.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  const pickSupply = (i, supplyId) => {
    const s = supplies.find(x => x._id === supplyId)
    updateItem(i, { supplyId, supplyName: s?.name || '', supplyCode: s?.code || '', unit: s?.unit || '' })
  }

  const titleMap = { import: 'Phiếu nhập kho', export: 'Phiếu xuất kho', adjustment: 'Phiếu điều chỉnh', transfer: 'Phiếu điều chuyển' }
  const canSave = items.every(it => it.supplyId && Number(it.quantity)) &&
    (!isImport || supplierId) &&
    (!isTransfer || toWhId) &&
    ((isExport || isAdjustment) ? !!reasonCode : true)

  const save = async () => {
    setSaving(true); setError('')
    try {
      if (isTransfer) {
        await api.post('/inventory/transfers', {
          fromWarehouseId: warehouse._id,
          toWarehouseId: toWhId,
          items,
          notes,
        })
      } else {
        await api.post('/inventory/transactions', {
          type: kind,
          warehouseId: warehouse._id,
          items,
          supplierId,
          supplierName: suppliers.find(s => s._id === supplierId)?.name || '',
          reasonCode,
          reason: REASON_PRESETS[kind]?.find(r => r.code === reasonCode)?.name || '',
          notes,
          accountingPeriod: (() => {
            const d = new Date()
            return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
          })(),
        })
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi lưu phiếu')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white">
          <div>
            <div className="font-semibold text-gray-900">{titleMap[kind]}</div>
            <div className="text-xs text-gray-500 mt-0.5">{warehouse?.name} · {new Date().toLocaleDateString('vi-VN')}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

          <Card className="p-4">
            <div className="text-xs text-gray-500 mb-3">Thông tin chung</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {isImport && (
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs text-gray-500 mb-1">Nhà cung cấp *</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                    <option value="">-- Chọn NCC --</option>
                    {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {(isExport || isAdjustment) && (
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs text-gray-500 mb-1">Lý do *</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={reasonCode} onChange={e => setReasonCode(e.target.value)}>
                    {REASON_PRESETS[kind].map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </select>
                </div>
              )}
              {isTransfer && (
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs text-gray-500 mb-1">Kho đích *</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={toWhId} onChange={e => setToWhId(e.target.value)}>
                    <option value="">-- Chọn kho --</option>
                    {warehouses.filter(w => w._id !== warehouse._id).map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-2 md:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Ghi chú</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm font-medium text-gray-900">Danh sách vật tư</div>
              <div className="text-xs text-gray-500">{items.length} dòng</div>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_100px_100px_100px_80px_30px] gap-2 items-start">
                  <div>
                    <select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white" value={it.supplyId} onChange={e => pickSupply(i, e.target.value)}>
                      <option value="">-- Chọn vật tư --</option>
                      {supplies.map(s => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}
                    </select>
                  </div>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    placeholder="Số lô"
                    value={it.lotNumber} onChange={e => updateItem(i, { lotNumber: e.target.value })}
                  />
                  <input
                    type="month"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    placeholder="HSD"
                    value={it.expiryDate} onChange={e => updateItem(i, { expiryDate: e.target.value })}
                    disabled={!isImport}
                  />
                  <input
                    type="number"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right"
                    placeholder="SL"
                    value={it.quantity} onChange={e => updateItem(i, { quantity: +e.target.value })}
                  />
                  <input
                    type="number"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right"
                    placeholder="Đơn giá"
                    value={it.purchasePrice} onChange={e => updateItem(i, { purchasePrice: +e.target.value })}
                    disabled={!isImport}
                  />
                  <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-600 text-lg">×</button>
                </div>
              ))}
            </div>
            <button onClick={() => setItems(p => [...p, emptyLine()])} className="text-sm text-blue-600 hover:underline mt-3">+ Thêm dòng</button>
          </Card>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Hủy</button>
          <button onClick={save} disabled={!canSave || saving} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Đang lưu...' : 'Lưu phiếu'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. KIỂM KÊ
// ═══════════════════════════════════════════════════════════════════════════
function StocktakeTab({ whParam, warehouses, activeWh }) {
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/inventory/stocktakes${whParam}`).then(({ data }) => { setSessions(data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [whParam])

  useEffect(() => { load() }, [load])

  if (activeSessionId) {
    return <StocktakeSession id={activeSessionId} onClose={() => { setActiveSessionId(null); load() }} />
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setNewOpen(true)}
          disabled={!activeWh}
          className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40"
        >＋ Bắt đầu kiểm kê mới</button>
      </div>

      <Card>
        <div className="grid grid-cols-[1fr_120px_100px_120px_120px] px-4 py-3 text-xs text-gray-500 border-b border-gray-100">
          <div>Tên / Số phiên</div>
          <div>Ngày bắt đầu</div>
          <div>Số dòng</div>
          <div>Trạng thái</div>
          <div className="text-right">Người tạo</div>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-sm">Đang tải...</div>
        ) : sessions.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">Chưa có phiên kiểm kê nào.</div>
        ) : (
          sessions.map(s => (
            <button key={s._id} onClick={() => setActiveSessionId(s._id)}
              className="w-full grid grid-cols-[1fr_120px_100px_120px_120px] px-4 py-3 text-sm border-b border-gray-50 hover:bg-gray-50 text-left">
              <div>
                <div className="text-gray-900">{s.name}</div>
                <div className="text-xs text-gray-500">{s.sessionNumber}</div>
              </div>
              <div className="text-gray-600 text-xs">{fmtDate(s.startedAt)}</div>
              <div className="text-gray-600 text-xs">{(s.items || []).length} VT</div>
              <div><Pill className={stocktakeStatusCls(s.status)}>{stocktakeStatusLbl(s.status)}</Pill></div>
              <div className="text-right text-gray-500 text-xs">{s.startedBy}</div>
            </button>
          ))
        )}
      </Card>

      {newOpen && (
        <StocktakeNewModal
          warehouse={activeWh}
          onClose={() => setNewOpen(false)}
          onCreated={(id) => { setNewOpen(false); setActiveSessionId(id); load() }}
        />
      )}
    </div>
  )
}

function stocktakeStatusCls(s) {
  return {
    open: 'bg-amber-50 text-amber-700 border-amber-200',
    submitted: 'bg-blue-50 text-blue-700 border-blue-200',
    approved: 'bg-teal-50 text-teal-700 border-teal-200',
    applied: 'bg-green-50 text-green-700 border-green-200',
    cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
  }[s] || 'bg-gray-50 text-gray-700 border-gray-200'
}
function stocktakeStatusLbl(s) {
  return ({ open: 'Đang đếm', submitted: 'Đã nộp', approved: 'Đã duyệt', applied: 'Đã áp dụng', cancelled: 'Đã hủy' })[s] || s
}

function StocktakeNewModal({ warehouse, onClose, onCreated }) {
  const [name, setName] = useState(`Kiểm kê ${new Date().toISOString().slice(0, 7)}`)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const start = async () => {
    setSaving(true); setErr('')
    try {
      const { data } = await api.post('/inventory/stocktakes', { warehouseId: warehouse._id, name, scope: 'all' })
      onCreated(data._id)
    } catch (e) { setErr(e.response?.data?.error || 'Lỗi'); setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="font-semibold text-gray-900 mb-4">Bắt đầu kiểm kê mới</div>
        {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-3">{err}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tên phiên</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="text-xs text-gray-500">Kho: <span className="font-medium text-gray-900">{warehouse?.name}</span></div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Hủy</button>
          <button onClick={start} disabled={saving} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Bắt đầu</button>
        </div>
      </div>
    </div>
  )
}

function StocktakeSession({ id, onClose }) {
  const [session, setSession] = useState(null)
  const [dirty, setDirty] = useState({}) // { supplyId: { actualQty, reasonCode } }
  const [q, setQ] = useState('')
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.get(`/inventory/stocktakes/${id}`).then(({ data }) => setSession(data))
  }, [id])
  useEffect(() => { load() }, [load])

  if (!session) return <div className="p-8 text-gray-500 text-sm">Đang tải...</div>

  const applyDirty = (items) => items.map(it => {
    const d = dirty[it.supplyId]
    if (!d) return it
    const actualQty = d.actualQty !== undefined ? d.actualQty : it.actualQty
    const variance = actualQty != null ? (actualQty - it.systemQty) : 0
    return { ...it, actualQty, reasonCode: d.reasonCode !== undefined ? d.reasonCode : it.reasonCode, variance }
  })
  const items = applyDirty(session.items).filter(it => {
    if (onlyDiff && it.variance === 0) return false
    if (q && !(it.supplyName.toLowerCase().includes(q.toLowerCase()) || (it.supplyCode || '').toLowerCase().includes(q.toLowerCase()))) return false
    return true
  })
  const counted = applyDirty(session.items).filter(it => it.actualQty != null).length
  const varying = applyDirty(session.items).filter(it => (it.actualQty != null) && it.variance !== 0).length
  const readOnly = session.status !== 'open'

  const setActual = (supplyId, v) => setDirty(d => ({ ...d, [supplyId]: { ...(d[supplyId] || {}), actualQty: v } }))
  const setReason = (supplyId, v) => setDirty(d => ({ ...d, [supplyId]: { ...(d[supplyId] || {}), reasonCode: v } }))

  const save = async (andSubmit = false) => {
    setBusy(true)
    try {
      if (Object.keys(dirty).length > 0) {
        await api.put(`/inventory/stocktakes/${id}/counts`, { updates: dirty })
        setDirty({})
      }
      if (andSubmit) await api.put(`/inventory/stocktakes/${id}/submit`)
      await load()
    } catch (e) { alert(e.response?.data?.error || 'Lỗi') }
    setBusy(false)
  }
  const approve = async () => {
    if (!window.confirm('Duyệt phiên kiểm kê? Sẽ tạo phiếu điều chỉnh cho các chênh lệch.')) return
    setBusy(true)
    try {
      const { data } = await api.put(`/inventory/stocktakes/${id}/approve`)
      alert(`Đã duyệt. Tạo ${data.adjustmentCount} phiếu điều chỉnh.`)
      await load()
    } catch (e) { alert(e.response?.data?.error || 'Lỗi') }
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">← Quay lại</button>
            <h2 className="text-lg font-semibold text-gray-900">{session.name}</h2>
            <Pill className={stocktakeStatusCls(session.status)}>{stocktakeStatusLbl(session.status)}</Pill>
          </div>
          <div className="text-xs text-gray-500 mt-1">{session.warehouseName} · bắt đầu {fmtDate(session.startedAt)} · {session.startedBy}</div>
        </div>
        <div className="flex gap-2">
          {session.status === 'open' && (
            <>
              <button onClick={() => save(false)} disabled={busy} className="px-3 py-1.5 text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Lưu nháp</button>
              <button onClick={() => save(true)} disabled={busy} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Nộp ({session.items.length - counted} còn lại)</button>
            </>
          )}
          {session.status === 'submitted' && (
            <button onClick={approve} disabled={busy} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Duyệt & áp dụng</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs text-gray-500">Đã đếm</div><div className="mt-2 text-3xl font-medium">{counted} <span className="text-xs text-gray-500 font-normal">/ {session.items.length}</span></div></Card>
        <Card className="p-4"><div className="text-xs text-gray-500">Có chênh lệch</div><div className={`mt-2 text-3xl font-medium ${varying ? 'text-amber-700' : 'text-gray-300'}`}>{varying}</div></Card>
        <Card className="p-4"><div className="text-xs text-gray-500">Còn lại</div><div className="mt-2 text-3xl font-medium">{session.items.length - counted}</div></Card>
      </div>

      <Card className="p-3 flex gap-2 flex-wrap">
        <input className="flex-1 min-w-[240px] border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Tìm vật tư..." value={q} onChange={e => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} /> Chỉ chênh lệch</label>
      </Card>

      <Card>
        <div className="grid grid-cols-[1fr_80px_140px_80px_160px] gap-3 px-4 py-3 text-xs text-gray-500 border-b border-gray-100">
          <div>Vật tư</div><div className="text-center">Tồn HT</div><div className="text-center">Đã đếm</div><div className="text-center">Chênh</div><div>Lý do</div>
        </div>
        {items.map(it => {
          const variance = it.actualQty != null ? (it.actualQty - it.systemQty) : 0
          const varCls = variance > 0 ? 'text-blue-700' : variance < 0 ? 'text-red-700' : 'text-gray-400'
          const needReason = variance !== 0 && !it.reasonCode
          return (
            <div key={it.supplyId} className="grid grid-cols-[1fr_80px_140px_80px_160px] gap-3 px-4 py-3 text-sm border-b border-gray-50 items-center">
              <div>
                <div className="text-gray-900">{it.supplyName}</div>
                <div className="text-xs text-gray-500">{it.supplyCode}</div>
              </div>
              <div className="text-center tabular-nums">{it.systemQty}</div>
              <div className="flex items-center justify-center gap-1">
                <button
                  disabled={readOnly}
                  onClick={() => setActual(it.supplyId, Math.max(0, (it.actualQty ?? it.systemQty) - 1))}
                  className="w-7 h-7 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >−</button>
                <input
                  disabled={readOnly}
                  type="number" min="0"
                  value={it.actualQty ?? ''}
                  placeholder="—"
                  onChange={e => setActual(it.supplyId, e.target.value === '' ? null : +e.target.value)}
                  className="w-16 border border-gray-300 rounded px-1 py-1 text-sm text-center disabled:bg-gray-50"
                />
                <button
                  disabled={readOnly}
                  onClick={() => setActual(it.supplyId, (it.actualQty ?? it.systemQty) + 1)}
                  className="w-7 h-7 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >+</button>
              </div>
              <div className={`text-center tabular-nums font-medium ${varCls}`}>{variance > 0 ? `+${variance}` : variance || '—'}</div>
              <div>
                {variance !== 0 ? (
                  <select
                    disabled={readOnly}
                    value={it.reasonCode || ''}
                    onChange={e => setReason(it.supplyId, e.target.value)}
                    className={`w-full border rounded px-2 py-1 text-sm bg-white disabled:bg-gray-50 ${needReason ? 'border-amber-400' : 'border-gray-300'}`}
                  >
                    <option value="">Chọn lý do...</option>
                    {REASON_PRESETS.stocktake.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </select>
                ) : <span className="text-gray-300 text-xs">—</span>}
              </div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  5. DANH MỤC  (admin-editable, read-only for nv_kho)
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
//  6. TỔNG HỢP CHUỖI  (supervisor only)
// ═══════════════════════════════════════════════════════════════════════════
function MatrixTab({ warehouses }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [belowMinOnly, setBelowMinOnly] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (q) qs.set('q', q)
    if (belowMinOnly) qs.set('belowMin', 'true')
    api.get(`/inventory/stock/matrix?${qs}`).then(({ data }) => { setData(data); setLoading(false) }).catch(() => setLoading(false))
  }, [q, belowMinOnly])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <Card className="p-3 flex items-center gap-2 flex-wrap">
        <input className="flex-1 min-w-[240px] border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Tìm vật tư..." value={q} onChange={e => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={belowMinOnly} onChange={e => setBelowMinOnly(e.target.checked)} /> Chỉ dưới định mức</label>
      </Card>

      <Card className="overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-sm">Đang tải...</div>
        ) : !data || !data.rows.length ? (
          <div className="p-6 text-center text-gray-400 text-sm">Không có dữ liệu.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left px-4 py-3">Vật tư</th>
                {data.warehouses.map(w => (
                  <th key={w._id} className="text-center px-3 py-3 tabular-nums font-normal">{w.code || w.name}</th>
                ))}
                <th className="text-right px-4 py-3 font-normal">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(r => {
                const totalBelowMin = r.cells.every(c => c.belowMin)
                return (
                  <tr key={r.supply._id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{r.supply.name}</div>
                      <div className="text-xs text-gray-500">{r.supply.code} · min {r.supply.minimumStock}/kho</div>
                    </td>
                    {r.cells.map(c => {
                      const cls = c.belowMin ? 'text-red-700 font-medium' : 'text-gray-700'
                      return <td key={c.warehouseId} className={`text-center px-3 py-3 tabular-nums ${cls}`}>{c.qty || '—'}</td>
                    })}
                    <td className={`text-right px-4 py-3 tabular-nums ${totalBelowMin ? 'text-amber-700' : 'text-gray-500'}`}>{r.total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
