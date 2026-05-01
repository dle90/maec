import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getMarketing, saveMarketing } from '../api'

// ─── constants ───────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'idea',    label: 'Ý tưởng',       icon: '💡', color: '#8b5cf6', bg: 'bg-purple-50',  border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
  { key: 'content', label: 'Viết Content',   icon: '✍️',  color: '#0ea5e9', bg: 'bg-sky-50',     border: 'border-sky-200',    badge: 'bg-sky-100 text-sky-700' },
  { key: 'design',  label: 'Thiết kế',       icon: '🎨', color: '#f59e0b', bg: 'bg-amber-50',   border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700' },
  { key: 'setup',   label: 'Setup Quảng cáo',icon: '⚙️',  color: '#10b981', bg: 'bg-emerald-50', border: 'border-emerald-200',badge: 'bg-emerald-100 text-emerald-700' },
  { key: 'active',  label: 'Đang chạy',      icon: '🚀', color: '#3b82f6', bg: 'bg-blue-50',    border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700' },
  { key: 'done',    label: 'Kết thúc',       icon: '✅', color: '#6b7280', bg: 'bg-gray-50',    border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-600' },
]

const CHANNELS = [
  { key: 'facebook', label: 'Facebook', icon: '📘', color: '#1877f2' },
  { key: 'google',   label: 'Google',   icon: '🔍', color: '#ea4335' },
  { key: 'zalo',     label: 'Zalo',     icon: '💬', color: '#0068ff' },
  { key: 'tiktok',   label: 'TikTok',   icon: '🎵', color: '#000000' },
  { key: 'multi',    label: 'Đa kênh',  icon: '📡', color: '#8b5cf6' },
]

const TYPES = [
  { key: 'post',    label: 'Bài đăng' },
  { key: 'ads',     label: 'Quảng cáo' },
  { key: 'video',   label: 'Video' },
  { key: 'event',   label: 'Sự kiện' },
  { key: 'email',   label: 'Email' },
]

const PRIORITIES = [
  { key: 'high',   label: 'Cao',      cls: 'bg-red-100 text-red-700' },
  { key: 'medium', label: 'TB',       cls: 'bg-yellow-100 text-yellow-700' },
  { key: 'low',    label: 'Thấp',     cls: 'bg-gray-100 text-gray-500' },
]

const fmtBudget = n => {
  if (!n) return '—'
  return n >= 1e9 ? (n/1e9).toFixed(1) + ' tỷ' : n >= 1e6 ? (n/1e6).toFixed(0) + 'M' : n.toLocaleString('vi-VN')
}
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' }) : '—'
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

const stageOf  = key => STAGES.find(s => s.key === key) || STAGES[0]
const chanOf   = key => CHANNELS.find(c => c.key === key) || CHANNELS[0]
const prioOf   = key => PRIORITIES.find(p => p.key === key) || PRIORITIES[1]

// ─── Campaign Form Modal ──────────────────────────────────────────────────────
function CampaignModal({ campaign, onClose, onSave }) {
  const isNew = !campaign?.id
  const [f, setF] = useState({
    title: '', channel: 'facebook', type: 'ads', stage: 'idea',
    priority: 'medium', budget: '', startDate: '', endDate: '',
    target: '', description: '', assignee: '', tags: '',
    ...(campaign || {}),
  })
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h3 className="font-bold text-gray-800">{isNew ? '+ Chiến dịch mới' : 'Chỉnh sửa chiến dịch'}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Điền thông tin để theo dõi pipeline marketing</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tên chiến dịch *</label>
            <input value={f.title} onChange={e => upd('title', e.target.value)}
              placeholder="VD: Chiến dịch bác sĩ tháng 4 – Facebook Ads"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
          </div>

          {/* Channel + Type + Stage */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Kênh</label>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map(ch => (
                  <button key={ch.key} onClick={() => upd('channel', ch.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${f.channel === ch.key ? 'border-transparent text-white' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'}`}
                    style={f.channel === ch.key ? { background: ch.color } : {}}>
                    {ch.icon} {ch.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Loại nội dung</label>
              <select value={f.type} onChange={e => upd('type', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white">
                {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Giai đoạn</label>
              <select value={f.stage} onChange={e => upd('stage', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white">
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Priority + Assignee */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ưu tiên</label>
              <div className="flex gap-2">
                {PRIORITIES.map(p => (
                  <button key={p.key} onClick={() => upd('priority', p.key)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${f.priority === p.key ? p.cls + ' border-transparent' : 'border-gray-200 text-gray-500 bg-white'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Người phụ trách</label>
              <input value={f.assignee} onChange={e => upd('assignee', e.target.value)}
                placeholder="Tên nhân viên..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
            </div>
          </div>

          {/* Budget + Dates */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ngân sách (VND)</label>
              <input type="number" value={f.budget} onChange={e => upd('budget', Number(e.target.value))}
                placeholder="5000000"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ngày bắt đầu</label>
              <input type="date" value={f.startDate} onChange={e => upd('startDate', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ngày kết thúc</label>
              <input type="date" value={f.endDate} onChange={e => upd('endDate', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
            </div>
          </div>

          {/* Target audience */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Đối tượng mục tiêu</label>
            <input value={f.target} onChange={e => upd('target', e.target.value)}
              placeholder="VD: Bác sĩ chấn thương chỉnh hình khu vực Hà Nội"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mô tả / Ghi chú</label>
            <textarea value={f.description} onChange={e => upd('description', e.target.value)}
              rows={3} placeholder="Mô tả nội dung, chiến lược, ghi chú triển khai..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 resize-none" />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tags (phân cách bằng dấu phẩy)</label>
            <input value={f.tags} onChange={e => upd('tags', e.target.value)}
              placeholder="bác sĩ, tháng 4, nội khoa"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Hủy</button>
            <button disabled={!f.title.trim()}
              onClick={() => { onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }); onClose() }}
              className="px-6 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold disabled:opacity-40">
              {isNew ? 'Tạo chiến dịch' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Metrics Modal ────────────────────────────────────────────────────────────
function MetricsModal({ campaign, onClose, onSave }) {
  const [m, setM] = useState({ impressions: 0, reach: 0, clicks: 0, conversions: 0, spend: 0, ...(campaign.metrics || {}) })
  const upd = (k, v) => setM(p => ({ ...p, [k]: Number(v) || 0 }))
  const ctr  = m.impressions > 0 ? ((m.clicks / m.impressions) * 100).toFixed(2) : 0
  const cpc  = m.clicks > 0 ? Math.round(m.spend / m.clicks) : 0
  const roas = m.spend > 0 && m.conversions > 0 ? (m.conversions / m.spend * 2000000).toFixed(1) : 0

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800">📊 Metrics — {campaign.title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Nhập số liệu từ Facebook/Google Ads</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { k: 'impressions', l: '👁 Impressions' },
              { k: 'reach',       l: '📢 Reach' },
              { k: 'clicks',      l: '🖱 Clicks' },
              { k: 'conversions', l: '🎯 Conversions' },
              { k: 'spend',       l: '💸 Chi phí (VND)' },
            ].map(({ k, l }) => (
              <div key={k}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                <input type="number" value={m[k]} onChange={e => upd(k, e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </div>
            ))}
          </div>
          {/* Auto-calculated */}
          <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-3 gap-3 text-center">
            <div><p className="text-lg font-extrabold text-blue-700">{ctr}%</p><p className="text-xs text-gray-400">CTR</p></div>
            <div><p className="text-lg font-extrabold text-emerald-700">{cpc.toLocaleString('vi-VN')}</p><p className="text-xs text-gray-400">CPC (VND)</p></div>
            <div><p className="text-lg font-extrabold text-purple-700">{roas}x</p><p className="text-xs text-gray-400">ROAS ước tính</p></div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Hủy</button>
            <button onClick={() => { onSave(m); onClose() }}
              className="px-6 py-2 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold">
              Lưu metrics
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Campaign Card ────────────────────────────────────────────────────────────
function CampaignCard({ campaign, onClick, onMoveStage, onMetrics, stages }) {
  const ch   = chanOf(campaign.channel)
  const pr   = prioOf(campaign.priority)
  const st   = stageOf(campaign.stage)
  const curI = stages.findIndex(s => s.key === campaign.stage)
  const m    = campaign.metrics || {}
  const hasMetrics = m.impressions > 0 || m.clicks > 0 || m.spend > 0

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
      onClick={() => onClick(campaign)}>
      {/* Color strip */}
      <div className="h-1 rounded-t-xl" style={{ background: ch.color }} />

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-gray-800 leading-snug line-clamp-2">{campaign.title}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${pr.cls}`}>{pr.label}</span>
        </div>

        {/* Channel + Type badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-lg text-white"
            style={{ background: ch.color }}>{ch.icon} {ch.label}</span>
          <span className="text-xs px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600">
            {TYPES.find(t => t.key === campaign.type)?.label || campaign.type}
          </span>
          {campaign.assignee && (
            <span className="text-xs text-gray-400 ml-auto">👤 {campaign.assignee}</span>
          )}
        </div>

        {/* Target */}
        {campaign.target && (
          <p className="text-xs text-gray-500 line-clamp-1">🎯 {campaign.target}</p>
        )}

        {/* Budget + Dates */}
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="font-semibold text-gray-700">💰 {fmtBudget(campaign.budget)}</span>
          {campaign.startDate && (
            <span>{fmtDate(campaign.startDate)} → {fmtDate(campaign.endDate)}</span>
          )}
        </div>

        {/* Metrics preview */}
        {hasMetrics && (
          <div className="flex gap-3 pt-1 border-t border-gray-50 text-xs text-gray-500">
            {m.impressions > 0 && <span>👁 {m.impressions.toLocaleString('vi-VN')}</span>}
            {m.clicks > 0      && <span>🖱 {m.clicks.toLocaleString('vi-VN')}</span>}
            {m.spend > 0       && <span>💸 {fmtBudget(m.spend)}</span>}
          </div>
        )}

        {/* Pipeline move buttons */}
        <div className="flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}>
          {curI > 0 && (
            <button onClick={() => onMoveStage(campaign.id, stages[curI - 1].key)}
              className="flex-1 text-xs py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium">
              ← {stages[curI - 1].icon}
            </button>
          )}
          <button onClick={() => onMetrics(campaign)}
            className="px-2 py-1 text-xs rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium">
            📊
          </button>
          {curI < stages.length - 1 && (
            <button onClick={() => onMoveStage(campaign.id, stages[curI + 1].key)}
              className="flex-1 text-xs py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-medium">
              {stages[curI + 1].icon} →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Campaign Detail Panel ────────────────────────────────────────────────────
function DetailPanel({ campaign, onClose, onEdit, onDelete, onMoveStage, stages }) {
  const ch = chanOf(campaign.channel)
  const st = stageOf(campaign.stage)
  const m  = campaign.metrics || {}
  const ctr  = m.impressions > 0 ? ((m.clicks / m.impressions) * 100).toFixed(2) : null
  const cpc  = m.clicks > 0 ? Math.round(m.spend / m.clicks) : null

  const QUICK_LINKS = {
    facebook: { url: 'https://www.facebook.com/adsmanager', label: 'Facebook Ads Manager' },
    google:   { url: 'https://ads.google.com',              label: 'Google Ads' },
    zalo:     { url: 'https://oa.zalo.me',                  label: 'Zalo OA' },
    tiktok:   { url: 'https://ads.tiktok.com',              label: 'TikTok Ads' },
  }
  const link = QUICK_LINKS[campaign.channel]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-end" onClick={onClose}>
      <div className="bg-white h-full w-full max-w-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0"
          style={{ borderLeftWidth: 4, borderLeftColor: ch.color }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${st.badge}`}>{st.icon} {st.label}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg text-white"
                  style={{ background: ch.color }}>{ch.icon} {ch.label}</span>
              </div>
              <h3 className="font-bold text-gray-900 text-base mt-2 leading-snug">{campaign.title}</h3>
              {campaign.assignee && <p className="text-xs text-gray-400 mt-1">👤 {campaign.assignee}</p>}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Pipeline progress */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Tiến trình pipeline</p>
            <div className="flex items-center gap-1">
              {stages.map((s, i) => {
                const cur = s.key === campaign.stage
                const past = stages.findIndex(x => x.key === campaign.stage) > i
                return (
                  <React.Fragment key={s.key}>
                    <button onClick={() => onMoveStage(campaign.id, s.key)}
                      className={`flex flex-col items-center flex-1 py-1.5 px-1 rounded-lg text-xs font-semibold transition-all
                        ${cur ? 'text-white shadow-sm' : past ? 'text-gray-500 bg-gray-100' : 'text-gray-300 bg-gray-50 hover:bg-gray-100 hover:text-gray-500'}`}
                      style={cur ? { background: s.color } : {}}>
                      <span>{s.icon}</span>
                      <span className="text-[10px] mt-0.5 hidden sm:block">{s.label.split(' ')[0]}</span>
                    </button>
                    {i < stages.length - 1 && (
                      <div className={`h-0.5 w-3 shrink-0 ${past ? 'bg-gray-400' : 'bg-gray-200'}`} />
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Ngân sách',    value: fmtBudget(campaign.budget) },
              { label: 'Loại',         value: TYPES.find(t => t.key === campaign.type)?.label },
              { label: 'Bắt đầu',      value: fmtDate(campaign.startDate) },
              { label: 'Kết thúc',     value: fmtDate(campaign.endDate) },
              { label: 'Ưu tiên',      value: prioOf(campaign.priority).label },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-gray-800">{value || '—'}</p>
              </div>
            ))}
          </div>

          {/* Target */}
          {campaign.target && (
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">Đối tượng mục tiêu</p>
              <p className="text-sm text-blue-900">{campaign.target}</p>
            </div>
          )}

          {/* Description */}
          {campaign.description && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Mô tả</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-xl p-3">{campaign.description}</p>
            </div>
          )}

          {/* Tags */}
          {campaign.tags && (
            <div className="flex flex-wrap gap-1.5">
              {campaign.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                <span key={t} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">#{t}</span>
              ))}
            </div>
          )}

          {/* Metrics */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Metrics</p>
            {!m.impressions && !m.clicks && !m.spend ? (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">
                Chưa có số liệu · Nhập từ Facebook/Google Ads
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Impressions', value: m.impressions?.toLocaleString('vi-VN'), icon: '👁' },
                  { label: 'Reach',       value: m.reach?.toLocaleString('vi-VN'),       icon: '📢' },
                  { label: 'Clicks',      value: m.clicks?.toLocaleString('vi-VN'),      icon: '🖱' },
                  { label: 'Conversions', value: m.conversions?.toLocaleString('vi-VN'), icon: '🎯' },
                  { label: 'Chi phí',     value: fmtBudget(m.spend),                    icon: '💸' },
                  { label: 'CTR',         value: ctr ? ctr + '%' : '—',                  icon: '📈' },
                  { label: 'CPC',         value: cpc ? cpc.toLocaleString('vi-VN') + 'đ' : '—', icon: '💰' },
                ].map(({ label, value, icon }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <p className="text-xs text-gray-400">{icon} {label}</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5">{value || '—'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick link */}
          {link && (
            <a href={link.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: ch.color }}>
              {ch.icon} Mở {link.label}
              <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2 flex-shrink-0">
          <button onClick={() => onDelete(campaign.id)}
            className="text-xs px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-medium">
            Xóa
          </button>
          <button onClick={() => onEdit(campaign)}
            className="ml-auto flex items-center gap-1.5 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
            ✏️ Chỉnh sửa
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Marketing() {
  const { auth } = useAuth()
  const isManager = auth?.role === 'admin' || auth?.role === 'giamdoc' || auth?.role === 'truongphong'

  const [campaigns, setCampaigns] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [modal,     setModal]     = useState(null) // 'new' | 'edit' | 'metrics'
  const [selected,  setSelected]  = useState(null)
  const [detail,    setDetail]    = useState(null)
  const [filterCh,  setFilterCh]  = useState('all')
  const [filterSt,  setFilterSt]  = useState('all')
  const [view,      setView]      = useState('kanban') // 'kanban' | 'list'

  useEffect(() => {
    getMarketing()
      .then(d => { setCampaigns(d?.campaigns || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const persist = useCallback(async (list) => {
    setSaving(true)
    try { await saveMarketing({ campaigns: list }); setCampaigns(list) }
    finally { setSaving(false) }
  }, [])

  const saveCampaign = (c) => {
    const list = campaigns.find(x => x.id === c.id)
      ? campaigns.map(x => x.id === c.id ? c : x)
      : [...campaigns, c]
    persist(list)
  }

  const deleteCampaign = (id) => {
    setDetail(null)
    persist(campaigns.filter(c => c.id !== id))
  }

  const moveStage = (id, stage) => {
    const list = campaigns.map(c => c.id === id ? { ...c, stage, updatedAt: new Date().toISOString() } : c)
    persist(list)
    if (detail?.id === id) setDetail(prev => ({ ...prev, stage }))
  }

  const saveMetrics = (metrics) => {
    const list = campaigns.map(c => c.id === selected.id ? { ...c, metrics, updatedAt: new Date().toISOString() } : c)
    persist(list)
    if (detail?.id === selected.id) setDetail(prev => ({ ...prev, metrics }))
  }

  const filtered = useMemo(() => campaigns.filter(c => {
    if (filterCh !== 'all' && c.channel !== filterCh) return false
    if (filterSt !== 'all' && c.stage !== filterSt) return false
    return true
  }), [campaigns, filterCh, filterSt])

  // stats
  const stats = useMemo(() => ({
    total:    campaigns.length,
    active:   campaigns.filter(c => c.stage === 'active').length,
    budget:   campaigns.reduce((s, c) => s + (Number(c.budget) || 0), 0),
    spend:    campaigns.reduce((s, c) => s + (Number(c.metrics?.spend) || 0), 0),
  }), [campaigns])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="rounded-2xl p-5 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 60%, #0e7490 100%)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-xl">📣</div>
              <h2 className="text-white font-extrabold text-xl tracking-tight">Marketing Pipeline</h2>
            </div>
            <p className="text-indigo-200 text-sm ml-12">Ý tưởng → Content → Thiết kế → Setup → Đang chạy</p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-yellow-300 text-xs animate-pulse font-semibold">💾 Đang lưu...</span>}
            {isManager && (
              <button onClick={() => { setSelected(null); setModal('new') }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-white text-indigo-700 hover:bg-indigo-50 shadow-lg transition-all hover:scale-105">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Chiến dịch mới
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Tổng chiến dịch', value: stats.total,           icon: '📋', sub: 'tất cả giai đoạn' },
            { label: 'Đang chạy',       value: stats.active,          icon: '🚀', sub: 'active campaigns' },
            { label: 'Tổng ngân sách',  value: fmtBudget(stats.budget), icon: '💰', sub: 'toàn bộ campaigns' },
            { label: 'Đã chi tiêu',     value: fmtBudget(stats.spend),  icon: '💸', sub: 'theo metrics nhập' },
          ].map(s => (
            <div key={s.label} className="rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <p className="text-white/60 text-xs mb-1">{s.icon} {s.label}</p>
              <p className="text-white font-extrabold text-xl">{s.value}</p>
              <p className="text-white/40 text-xs mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters + View toggle ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Lọc:</span>

        {/* Channel filter */}
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setFilterCh('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${filterCh === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Tất cả kênh
          </button>
          {CHANNELS.map(ch => (
            <button key={ch.key} onClick={() => setFilterCh(ch.key)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${filterCh === ch.key ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
              style={filterCh === ch.key ? { background: ch.color } : {}}>
              {ch.icon} {ch.label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-gray-200 mx-1" />

        {/* Stage filter */}
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setFilterSt('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${filterSt === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Tất cả giai đoạn
          </button>
          {STAGES.map(s => (
            <button key={s.key} onClick={() => setFilterSt(s.key)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${filterSt === s.key ? s.badge : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="ml-auto flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {[{ key: 'kanban', icon: '⊞', label: 'Kanban' }, { key: 'list', icon: '☰', label: 'Danh sách' }].map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`px-3 py-1 text-xs font-semibold rounded transition-all ${view === v.key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              {v.icon} {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Kanban board ── */}
      {view === 'kanban' && (
        <div className="grid grid-cols-6 gap-3 items-start">
          {STAGES.map(stage => {
            const cols = filtered.filter(c => c.stage === stage.key)
            return (
              <div key={stage.key} className={`rounded-2xl border ${stage.border} ${stage.bg} p-3 min-h-32`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{stage.icon}</span>
                    <span className="text-xs font-bold text-gray-700">{stage.label}</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stage.badge}`}>{cols.length}</span>
                </div>
                <div className="space-y-2">
                  {cols.map(c => (
                    <CampaignCard key={c.id} campaign={c} stages={STAGES}
                      onClick={setDetail}
                      onMoveStage={moveStage}
                      onMetrics={c => { setSelected(c); setModal('metrics') }}
                    />
                  ))}
                  {cols.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">Trống</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── List view ── */}
      {view === 'list' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <p className="text-center py-12 text-sm text-gray-400">Chưa có chiến dịch nào</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Chiến dịch', 'Kênh', 'Giai đoạn', 'Ưu tiên', 'Ngân sách', 'Thời gian', 'Người phụ trách'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const ch = chanOf(c.channel)
                  const st = stageOf(c.stage)
                  const pr = prioOf(c.priority)
                  return (
                    <tr key={c.id} onClick={() => setDetail(c)}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800 max-w-xs truncate">{c.title}</p>
                        {c.target && <p className="text-xs text-gray-400 truncate">{c.target}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-1 rounded-lg text-white"
                          style={{ background: ch.color }}>{ch.icon} {ch.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${st.badge}`}>{st.icon} {st.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pr.cls}`}>{pr.label}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-700">{fmtBudget(c.budget)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {c.startDate ? `${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{c.assignee || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {campaigns.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-20 text-center">
          <p className="text-5xl mb-4">📣</p>
          <h3 className="text-lg font-bold text-gray-700 mb-2">Chưa có chiến dịch nào</h3>
          <p className="text-sm text-gray-400 mb-6">Tạo chiến dịch đầu tiên để bắt đầu theo dõi marketing pipeline</p>
          {isManager && (
            <button onClick={() => { setSelected(null); setModal('new') }}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 text-sm">
              + Tạo chiến dịch đầu tiên
            </button>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {(modal === 'new' || modal === 'edit') && (
        <CampaignModal
          campaign={modal === 'edit' ? selected : null}
          onClose={() => setModal(null)}
          onSave={saveCampaign}
        />
      )}
      {modal === 'metrics' && selected && (
        <MetricsModal campaign={selected} onClose={() => setModal(null)} onSave={saveMetrics} />
      )}

      {/* ── Detail panel ── */}
      {detail && (
        <DetailPanel
          campaign={detail} stages={STAGES}
          onClose={() => setDetail(null)}
          onEdit={c => { setSelected(c); setModal('edit'); setDetail(null) }}
          onDelete={deleteCampaign}
          onMoveStage={moveStage}
        />
      )}
    </div>
  )
}
