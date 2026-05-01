import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const SEVERITY_STYLES = {
  critical: { dot: 'bg-red-500', cls: 'border-l-4 border-red-500' },
  warning:  { dot: 'bg-amber-500', cls: 'border-l-4 border-amber-400' },
  info:     { dot: 'bg-blue-500', cls: 'border-l-4 border-blue-300' },
}

const TYPE_LABELS = {
  critical_finding: 'Phát hiện nghiêm trọng',
  system: 'Hệ thống',
  message: 'Tin nhắn',
  task: 'Công việc',
}

function timeAgo(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'vừa xong'
  if (ms < 3600_000) return Math.floor(ms / 60_000) + ' phút trước'
  if (ms < 86_400_000) return Math.floor(ms / 3600_000) + ' giờ trước'
  return Math.floor(ms / 86_400_000) + ' ngày trước'
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const ref = useRef(null)
  const navigate = useNavigate()

  const refresh = async () => {
    try {
      const r = await api.get('/notifications')
      setItems(r.data.items || [])
      setUnread(r.data.unread || 0)
    } catch {}
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 30_000)
    return () => clearInterval(iv)
  }, [])

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const markRead = async (id) => {
    await api.post(`/notifications/${id}/read`)
    refresh()
  }

  const ack = async (id) => {
    await api.post(`/notifications/${id}/ack`)
    refresh()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) refresh() }}
        className="relative p-2 text-gray-300 hover:text-white"
        title="Thông báo"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.5-1.5V11a6.5 6.5 0 10-13 0v4.5L4 17h5m6 0a3 3 0 11-6 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-lg shadow-2xl border z-50 max-h-[70vh] overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <strong className="text-sm text-gray-800">Thông báo</strong>
            <span className="text-xs text-gray-500">{unread} chưa đọc</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">Không có thông báo</div>
            ) : items.map(n => {
              const sev = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info
              const isUnread = !(n.readBy || []).includes('me-placeholder') && !n.readBy?.length
              return (
                <div key={n._id} className={`px-3 py-2 border-b ${sev.cls} ${isUnread ? 'bg-blue-50/40' : ''} hover:bg-gray-50`}>
                  <div className="flex items-start gap-2">
                    <div className={`mt-1.5 w-2 h-2 rounded-full ${sev.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{n.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</div>
                      <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-2">
                        <span>{TYPE_LABELS[n.type] || n.type}</span>
                        <span>·</span>
                        <span>{timeAgo(n.ts)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {n.type === 'critical_finding' && (
                        <button onClick={() => ack(n._id)} className="text-[10px] bg-red-100 hover:bg-red-200 text-red-700 px-2 py-0.5 rounded">Xác nhận</button>
                      )}
                      <button onClick={() => markRead(n._id)} className="text-[10px] text-gray-500 hover:text-gray-700">Đánh dấu</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="px-3 py-2 border-t bg-gray-50 text-center">
            <button onClick={() => { setOpen(false); navigate('/ris?view=critical') }} className="text-xs text-blue-600 hover:underline">
              Xem tab phát hiện nghiêm trọng →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
