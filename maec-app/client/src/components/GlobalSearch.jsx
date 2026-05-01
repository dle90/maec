import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

// Cmd+K / Ctrl+K command palette — searches across patients, studies,
// services, employees, referral doctors, plus jumps to any page.
const PAGE_LINKS = [
  { label: 'Dashboard',                link: '/' },
  { label: 'Today (Bảng điều khiển hôm nay)', link: '/today' },
  { label: 'Ca chụp (RIS Worklist)',   link: '/ris' },
  { label: 'Đăng ký bệnh nhân',         link: '/registration' },
  { label: 'Phiếu thu (Billing)',      link: '/billing' },
  { label: 'Quản lý kho',              link: '/inventory' },
  { label: 'Khuyến mãi',               link: '/catalogs/promotions' },
  { label: 'Bệnh nhân (catalog)',      link: '/catalogs/patients' },
  { label: 'Bác sĩ giới thiệu',        link: '/catalogs/referral-doctors' },
  { label: 'Dịch vụ',                  link: '/catalogs/services' },
  { label: 'Báo cáo doanh thu',        link: '/reports/revenue-detail' },
  { label: 'BC Số ca theo bác sĩ đọc', link: '/rad-reports/cases-by-radiologist' },
  { label: 'BC Theo thời gian',        link: '/rad-reports/cases-by-time' },
  { label: 'Mẫu kết quả (Templates)',  link: '/report-templates' },
  { label: 'Nhật ký hệ thống (Audit)', link: '/audit-log' },
  { label: 'Phát hiện nghiêm trọng',   link: '/ris?view=critical' },
  { label: 'CRM',                      link: '/crm' },
  { label: 'KPI Sales',                link: '/kpi-sales' },
  { label: 'Marketing',                link: '/marketing' },
  { label: 'P&L',                      link: '/pl' },
  { label: 'Cash Flow',                link: '/cf' },
  { label: 'Balance Sheet',            link: '/bs' },
  { label: 'Breakeven',                link: '/breakeven' },
]

const SECTION_META = {
  pages:           { label: 'Trang',           icon: '📑' },
  patients:        { label: 'Bệnh nhân',       icon: '🧑' },
  studies:         { label: 'Ca chụp',         icon: '🩻' },
  services:        { label: 'Dịch vụ',         icon: '📄' },
  employees:       { label: 'Nhân viên',       icon: '👤' },
  referralDoctors: { label: 'BS giới thiệu',   icon: '👨‍⚕️' },
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  // Keyboard shortcut: Ctrl/Cmd+K
  useEffect(() => {
    const onKey = (e) => {
      const isCmdK = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)
      if (isCmdK) {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
    else { setQ(''); setResults({}); setActiveIdx(0) }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    if (term.length < 2) {
      setResults({ pages: PAGE_LINKS.slice(0, 10).map(p => ({ ...p, kind: 'pages' })) })
      return
    }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await api.get('/search', { params: { q: term } })
        const pages = PAGE_LINKS.filter(p => p.label.toLowerCase().includes(term.toLowerCase()))
          .slice(0, 5).map(p => ({ ...p, kind: 'pages' }))
        setResults({
          pages,
          patients:        (r.data.patients || []).map(x => ({ ...x, kind: 'patients' })),
          studies:         (r.data.studies || []).map(x => ({ ...x, kind: 'studies' })),
          services:        (r.data.services || []).map(x => ({ ...x, kind: 'services' })),
          employees:       (r.data.employees || []).map(x => ({ ...x, kind: 'employees' })),
          referralDoctors: (r.data.referralDoctors || []).map(x => ({ ...x, kind: 'referralDoctors' })),
        })
      } catch { setResults({}) }
      setLoading(false)
    }, 200)
    return () => clearTimeout(t)
  }, [q, open])

  // Flatten results for keyboard nav
  const flatList = Object.entries(results).flatMap(([k, items]) => (items || []).map(it => ({ ...it, kind: k })))

  const onKeyNav = useCallback((e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flatList.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flatList[activeIdx]
      if (item) { navigate(item.link); setOpen(false) }
    }
  }, [flatList, activeIdx, navigate])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-start justify-center pt-24" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[70vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <span className="text-gray-400">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={e => { setQ(e.target.value); setActiveIdx(0) }}
            onKeyDown={onKeyNav}
            placeholder="Tìm bệnh nhân, ca chụp, dịch vụ, hoặc trang... (ESC để đóng)"
            className="flex-1 outline-none text-sm"
          />
          {loading && <span className="text-xs text-gray-400">đang tìm...</span>}
          <kbd className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">⌘K</kbd>
        </div>
        <div className="flex-1 overflow-y-auto">
          {flatList.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">{q ? 'Không có kết quả' : 'Gõ để tìm…'}</div>
          ) : (
            Object.entries(results).map(([section, items]) => {
              if (!items || items.length === 0) return null
              const meta = SECTION_META[section] || { label: section, icon: '•' }
              return (
                <div key={section}>
                  <div className="px-4 py-1 text-[11px] uppercase tracking-wider text-gray-400 bg-gray-50">
                    {meta.icon} {meta.label}
                  </div>
                  {items.map((item, i) => {
                    const overall = flatList.indexOf(item)
                    const active = overall === activeIdx
                    return (
                      <button
                        key={(item.id || item.label) + i}
                        onMouseEnter={() => setActiveIdx(overall)}
                        onClick={() => { navigate(item.link); setOpen(false) }}
                        className={`w-full text-left px-4 py-2 flex items-center justify-between text-sm border-l-2 ${active ? 'bg-blue-50 border-blue-500' : 'border-transparent hover:bg-gray-50'}`}
                      >
                        <div>
                          <div className={active ? 'text-blue-700 font-medium' : 'text-gray-800'}>{item.label}</div>
                          {item.sub && <div className="text-xs text-gray-400 mt-0.5">{item.sub}</div>}
                        </div>
                        <span className="text-gray-300 text-xs">↵</span>
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
        <div className="px-4 py-2 border-t bg-gray-50 text-[11px] text-gray-500 flex gap-3">
          <span><kbd className="bg-white border border-gray-200 px-1 rounded">↑↓</kbd> điều hướng</span>
          <span><kbd className="bg-white border border-gray-200 px-1 rounded">↵</kbd> mở</span>
          <span><kbd className="bg-white border border-gray-200 px-1 rounded">Esc</kbd> đóng</span>
        </div>
      </div>
    </div>
  )
}
