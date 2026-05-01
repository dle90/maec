import React, { useState, useEffect } from 'react'
import api from '../api'

const fmtDate = (d) => d ? new Date(d).toLocaleString('vi-VN') : '-'

export default function CriticalFindings() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('unacked')

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/notifications', { params: { severity: 'critical' } })
      setItems(r.data.items || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const ack = async (id) => {
    await api.post(`/notifications/${id}/ack`)
    load()
  }

  const filtered = items.filter(n => {
    if (filter === 'unacked') return !(n.ackedBy || []).length
    if (filter === 'acked') return (n.ackedBy || []).length > 0
    return true
  }).filter(n => n.type === 'critical_finding')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">⚠ Phát hiện nghiêm trọng</h2>
          <p className="text-sm text-gray-500">Cần xác nhận và liên hệ bác sĩ chỉ định.</p>
        </div>
        <div className="flex gap-1 text-xs">
          {[
            { k: 'unacked', label: 'Chưa xác nhận' },
            { k: 'acked',   label: 'Đã xác nhận' },
            { k: 'all',     label: 'Tất cả' },
          ].map(t => (
            <button key={t.k} onClick={() => setFilter(t.k)}
              className={`px-3 py-1.5 rounded ${filter === t.k ? 'bg-red-600 text-white' : 'bg-white border text-gray-600 hover:bg-red-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-center py-8">Đang tải...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
          {filter === 'unacked' ? '✓ Không có phát hiện nghiêm trọng nào chưa xác nhận' : 'Không có dữ liệu'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(n => {
            const isAcked = (n.ackedBy || []).length > 0
            return (
              <div key={n._id} className={`bg-white rounded-lg border-l-4 ${isAcked ? 'border-gray-300' : 'border-red-500'} border border-gray-200 p-4`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold uppercase tracking-wide ${isAcked ? 'text-gray-500' : 'text-red-600'}`}>
                        {isAcked ? 'Đã xác nhận' : 'Chờ xác nhận'}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDate(n.ts)}</span>
                    </div>
                    <h3 className="font-semibold text-gray-800">{n.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{n.message}</p>
                    {isAcked && (
                      <div className="mt-2 text-xs text-gray-500">
                        Xác nhận bởi: <strong>{(n.ackedBy || []).join(', ')}</strong>
                      </div>
                    )}
                  </div>
                  {!isAcked && (
                    <button onClick={() => ack(n._id)} className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap">
                      ✓ Xác nhận
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
