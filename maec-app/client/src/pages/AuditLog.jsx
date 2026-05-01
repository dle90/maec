import React, { useState, useEffect } from 'react'
import api from '../api'

const fmtTs = (t) => t ? new Date(t).toLocaleString('vi-VN') : '-'

const METHOD_COLORS = {
  POST:   'bg-green-100 text-green-700',
  PUT:    'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
  PATCH:  'bg-blue-100 text-blue-700',
}

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ username: '', resource: '', method: '', dateFrom: '', dateTo: '' })
  const [expanded, setExpanded] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/audit-log', { params: filters })
      setLogs(r.data || [])
    } catch (e) { setLogs([]) }
    setLoading(false)
  }

  useEffect(() => { load() }, [JSON.stringify(filters)])

  const upd = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const reset = () => setFilters({ username: '', resource: '', method: '', dateFrom: '', dateTo: '' })

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-800">Nhật ký hệ thống</h2>
        <p className="text-sm text-gray-500">500 thao tác ghi gần nhất. Đọc (GET) không được ghi.</p>
      </div>

      <div className="bg-white rounded-lg border p-3 mb-3 flex gap-2 flex-wrap items-end">
        <div>
          <div className="text-xs text-gray-500 mb-1">Người dùng</div>
          <input value={filters.username} onChange={e => upd('username', e.target.value)} placeholder="username" className="border rounded px-2 py-1 text-sm w-32" />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Tài nguyên</div>
          <input value={filters.resource} onChange={e => upd('resource', e.target.value)} placeholder="billing, ris..." className="border rounded px-2 py-1 text-sm w-36" />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Method</div>
          <select value={filters.method} onChange={e => upd('method', e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">All</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
            <option value="PATCH">PATCH</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Từ ngày</div>
          <input type="date" value={filters.dateFrom} onChange={e => upd('dateFrom', e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Đến ngày</div>
          <input type="date" value={filters.dateTo} onChange={e => upd('dateTo', e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <button onClick={reset} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700">↺ Reset</button>
        <div className="ml-auto text-xs text-gray-500 self-center">{logs.length} bản ghi</div>
      </div>

      <div className="bg-white rounded-lg border overflow-auto" style={{ maxHeight: 'calc(100vh - 18rem)' }}>
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="sticky top-0 bg-[#1e3a5f] text-white">
            <tr>
              <th className="text-left px-3 py-2">Thời gian</th>
              <th className="text-left px-3 py-2">Người dùng</th>
              <th className="text-left px-3 py-2">Vai trò</th>
              <th className="text-left px-3 py-2">Method</th>
              <th className="text-left px-3 py-2">Tài nguyên</th>
              <th className="text-left px-3 py-2">Path</th>
              <th className="text-right px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">IP</th>
              <th className="text-center px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">Đang tải...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">Không có dữ liệu</td></tr>
            ) : logs.map(log => (
              <React.Fragment key={log._id}>
                <tr className="border-t hover:bg-blue-50/30">
                  <td className="px-3 py-1.5 text-xs text-gray-600">{fmtTs(log.ts)}</td>
                  <td className="px-3 py-1.5 text-gray-800 font-medium">{log.username || '-'}</td>
                  <td className="px-3 py-1.5 text-xs text-gray-500">{log.role || '-'}</td>
                  <td className="px-3 py-1.5"><span className={`text-xs font-mono px-2 py-0.5 rounded ${METHOD_COLORS[log.method] || 'bg-gray-100'}`}>{log.method}</span></td>
                  <td className="px-3 py-1.5 text-gray-700">{log.resource}</td>
                  <td className="px-3 py-1.5 text-xs text-gray-500 font-mono">{log.path}</td>
                  <td className={`px-3 py-1.5 text-right font-mono text-xs ${log.status >= 400 ? 'text-red-600' : 'text-gray-600'}`}>{log.status}</td>
                  <td className="px-3 py-1.5 text-xs text-gray-500 font-mono">{log.ip}</td>
                  <td className="px-3 py-1.5 text-center">
                    {log.payload && Object.keys(log.payload).length > 0 && (
                      <button onClick={() => setExpanded(expanded === log._id ? null : log._id)} className="text-xs text-blue-500 hover:text-blue-700">
                        {expanded === log._id ? '▼' : '▶'}
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === log._id && log.payload && (
                  <tr className="bg-gray-50">
                    <td colSpan={9} className="px-3 py-2">
                      <div className="text-xs text-gray-600 mb-1">Payload:</div>
                      <pre className="text-xs bg-white border rounded p-2 overflow-x-auto">{JSON.stringify(log.payload, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
