import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'

// ── Sidebar menu ────────────────────────────────────────
const MENU = [
  { group: 'Nhân sự', items: [
    { key: 'employees', label: 'Danh sách nhân viên' },
    { key: 'departments', label: 'Phòng ban / Chi nhánh' },
  ]},
  { group: 'Phân quyền', items: [
    { key: 'permissions', label: 'Ma trận quyền' },
  ]},
]

const STATUS_BADGE = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  resigned: 'bg-red-100 text-red-700',
}
const STATUS_LABEL = { active: 'Đang làm', inactive: 'Ngừng', resigned: 'Nghỉ việc' }
const DEPT_TYPE_LABEL = { branch: 'Chi nhánh', hq: 'Phòng ban' }

// ═══════════════════════════════════════════════════════
// EMPLOYEE LIST & FORM
// ═══════════════════════════════════════════════════════
export function EmployeeSection() {
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | employee object
  const [form, setForm] = useState({})
  const [assignments, setAssignments] = useState([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.q = search
      if (deptFilter) params.departmentId = deptFilter
      if (statusFilter) params.status = statusFilter
      const [emps, depts, rols] = await Promise.all([
        api.get('/hr/employees', { params }).then(r => r.data),
        api.get('/hr/departments').then(r => r.data),
        api.get('/hr/roles').then(r => r.data).catch(() => []),
      ])
      setEmployees(emps)
      setDepartments(depts)
      setRoles(rols)
    } catch {}
    setLoading(false)
  }, [search, deptFilter, statusFilter])

  useEffect(() => { load() }, [load])

  const startNew = () => {
    setEditing('new')
    setForm({ _id: '', password: '', displayName: '', phone: '', email: '', position: '', departmentId: '', joinDate: '', dob: '', gender: 'M', address: '', idCard: '', notes: '', role: 'nhanvien', employmentStatus: 'active' })
    setAssignments([])
  }

  const startEdit = (emp) => {
    setEditing(emp)
    setForm({ ...emp, password: '' })
    setAssignments(emp.assignments || [])
  }

  const save = async () => {
    setSaving(true)
    try {
      const dept = departments.find(d => d._id === form.departmentId)
      const payload = { ...form, department: dept ? dept.name : form.department }

      let savedId
      if (editing === 'new') {
        const r = await api.post('/hr/employees', payload)
        savedId = r.data?.employee?._id || payload._id
      } else {
        await api.put(`/hr/employees/${editing._id}`, payload)
        savedId = editing._id
      }
      if (savedId) {
        try {
          await api.put(`/hr/users/${savedId}/assignments`, { assignments })
        } catch (e) {
          alert('Lưu nhân viên thành công, nhưng lỗi lưu vai trò: ' + (e.response?.data?.error || e.message))
        }
      }
      setEditing(null)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi lưu')
    }
    setSaving(false)
  }

  const remove = async (emp) => {
    if (!confirm(`Ngừng nhân viên ${emp.displayName}?`)) return
    await api.delete(`/hr/employees/${emp._id}`)
    load()
  }

  const F = (key, label, opts = {}) => (
    <div className={opts.wide ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label} {opts.required && <span className="text-red-500">*</span>}</label>
      {opts.type === 'select' ? (
        <select value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400">
          <option value="">—</option>
          {opts.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : opts.type === 'textarea' ? (
        <textarea value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 resize-none" rows={2} />
      ) : (
        <input type={opts.type || 'text'} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400" required={opts.required} />
      )}
    </div>
  )

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm kiếm..."
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-56 outline-none focus:border-blue-400" />
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none">
          <option value="">Tất cả phòng ban</option>
          {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none">
          <option value="">Tất cả TT</option>
          <option value="active">Đang làm</option><option value="inactive">Ngừng</option><option value="resigned">Nghỉ việc</option>
        </select>
        <div className="flex-1" />
        <button onClick={startNew} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg">+ Thêm nhân viên</button>
      </div>

      {/* Table */}
      {loading ? <div className="text-gray-400 py-8 text-center">Đang tải...</div> : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
              <th className="px-3 py-2">Mã NV</th><th className="px-3 py-2">Họ tên</th><th className="px-3 py-2">Chức vụ</th>
              <th className="px-3 py-2">Phòng ban</th><th className="px-3 py-2">SĐT</th><th className="px-3 py-2">Ngày vào</th>
              <th className="px-3 py-2">TT</th><th className="px-3 py-2 w-20"></th>
            </tr></thead>
            <tbody>
              {employees.map(emp => {
                const dept = departments.find(d => d._id === emp.departmentId)
                return (
                  <tr key={emp._id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => startEdit(emp)}>
                    <td className="px-3 py-2 font-mono text-xs">{emp._id}</td>
                    <td className="px-3 py-2 font-medium">{emp.displayName}</td>
                    <td className="px-3 py-2">{emp.position}</td>
                    <td className="px-3 py-2">{dept?.name || emp.department || ''}</td>
                    <td className="px-3 py-2">{emp.phone}</td>
                    <td className="px-3 py-2">{emp.joinDate}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[emp.employmentStatus] || 'bg-gray-100'}`}>
                        {STATUS_LABEL[emp.employmentStatus] || emp.employmentStatus || 'active'}
                      </span>
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => remove(emp)} className="text-xs text-red-500 hover:text-red-700">Ngừng</button>
                    </td>
                  </tr>
                )
              })}
              {employees.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Không có nhân viên</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editing === 'new' ? 'Thêm nhân viên' : `Sửa: ${editing._id}`}</h3>
            <div className="grid grid-cols-2 gap-3">
              {editing === 'new' && F('_id', 'Mã nhân viên (username)', { required: true })}
              {editing === 'new' && F('password', 'Mật khẩu (mặc định = mã NV)')}
              {F('displayName', 'Họ tên', { required: true })}
              {F('position', 'Chức vụ')}
              {F('departmentId', 'Phòng ban', { type: 'select', options: departments.map(d => ({ value: d._id, label: `${d.name} (${DEPT_TYPE_LABEL[d.type] || d.type})` })) })}
              {F('phone', 'SĐT')}
              {F('email', 'Email')}
              {F('gender', 'Giới tính', { type: 'select', options: [{ value: 'M', label: 'Nam' }, { value: 'F', label: 'Nữ' }, { value: 'other', label: 'Khác' }] })}
              {F('dob', 'Ngày sinh', { type: 'date' })}
              {F('joinDate', 'Ngày vào làm', { type: 'date' })}
              {F('idCard', 'Số CCCD/CMND')}
              {F('address', 'Địa chỉ', { wide: true })}
              {F('notes', 'Ghi chú', { wide: true, type: 'textarea' })}
              {editing !== 'new' && F('employmentStatus', 'Trạng thái', { type: 'select', options: [{ value: 'active', label: 'Đang làm' }, { value: 'inactive', label: 'Ngừng' }, { value: 'resigned', label: 'Nghỉ việc' }] })}
            </div>

            {/* Assignments (multi-role) */}
            <div className="mt-5 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">Vai trò chức năng</h4>
                  <p className="text-xs text-gray-500">Gán nhiều vai trò. Vai trò phạm vi chi nhánh cần chọn cơ sở.</p>
                </div>
                <button type="button" onClick={() => setAssignments(a => [...a, { roleId: '', siteId: null }])}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded">+ Thêm vai trò</button>
              </div>
              {assignments.length === 0 && <div className="text-xs text-gray-400 italic">Chưa gán vai trò nào.</div>}
              {assignments.length > 0 && (
                <div className="space-y-1.5">
                  {assignments.map((a, i) => {
                    const role = roles.find(r => r._id === a.roleId)
                    const isSite = role?.scope === 'site'
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <select value={a.roleId}
                          onChange={e => {
                            const r = roles.find(x => x._id === e.target.value)
                            setAssignments(arr => arr.map((x, j) => j === i ? { roleId: e.target.value, siteId: r?.scope === 'site' ? x.siteId : null } : x))
                          }}
                          className="border border-gray-200 rounded px-2 py-1 text-sm flex-1">
                          <option value="">-- Chọn vai trò --</option>
                          {roles.map(r => (
                            <option key={r._id} value={r._id}>{r.label}{r.scope === 'site' ? ' (chi nhánh)' : ' (tập đoàn)'}</option>
                          ))}
                        </select>
                        <select value={a.siteId || ''}
                          disabled={!isSite}
                          onChange={e => setAssignments(arr => arr.map((x, j) => j === i ? { ...x, siteId: e.target.value || null } : x))}
                          className="border border-gray-200 rounded px-2 py-1 text-sm flex-1 disabled:bg-gray-50 disabled:text-gray-400">
                          <option value="">{isSite ? '-- Chọn cơ sở --' : 'Không áp dụng'}</option>
                          {departments.filter(d => d.type === 'branch').map(d => (
                            <option key={d._id} value={d._id}>{d.name}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => setAssignments(arr => arr.filter((_, j) => j !== i))}
                          className="text-red-400 hover:text-red-600 text-lg leading-none px-1">×</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2 rounded-lg disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button onClick={() => setEditing(null)} className="bg-gray-100 hover:bg-gray-200 text-sm px-5 py-2 rounded-lg">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// DEPARTMENT LIST & FORM
// ═══════════════════════════════════════════════════════
export function DepartmentSection() {
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setDepartments((await api.get('/hr/departments')).data) } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const startNew = () => {
    setEditing('new')
    setForm({ code: '', name: '', type: 'hq', headUserId: '', headName: '', phone: '', address: '', description: '' })
  }
  const startEdit = (d) => { setEditing(d); setForm({ ...d }) }

  const save = async () => {
    setSaving(true)
    try {
      if (editing === 'new') await api.post('/hr/departments', form)
      else await api.put(`/hr/departments/${editing._id}`, form)
      setEditing(null); load()
    } catch (err) { alert(err.response?.data?.error || 'Lỗi lưu') }
    setSaving(false)
  }

  const remove = async (d) => {
    if (!confirm(`Ngừng phòng ban ${d.name}?`)) return
    await api.delete(`/hr/departments/${d._id}`)
    load()
  }

  const F = (key, label, opts = {}) => (
    <div className={opts.wide ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {opts.type === 'select' ? (
        <select value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400">
          <option value="">—</option>
          {opts.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type="text" value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
      )}
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Phòng ban / Chi nhánh</h3>
        <div className="flex-1" />
        <button onClick={startNew} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg">+ Thêm</button>
      </div>

      {loading ? <div className="text-gray-400 py-8 text-center">Đang tải...</div> : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
              <th className="px-3 py-2">Mã</th><th className="px-3 py-2">Tên</th><th className="px-3 py-2">Loại</th>
              <th className="px-3 py-2">Trưởng phòng</th><th className="px-3 py-2">SĐT</th><th className="px-3 py-2">TT</th><th className="px-3 py-2 w-20"></th>
            </tr></thead>
            <tbody>
              {departments.map(d => (
                <tr key={d._id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => startEdit(d)}>
                  <td className="px-3 py-2 font-mono text-xs">{d.code}</td>
                  <td className="px-3 py-2 font-medium">{d.name}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${d.type === 'branch' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {DEPT_TYPE_LABEL[d.type] || d.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">{d.headName || '—'}</td>
                  <td className="px-3 py-2">{d.phone || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${d.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {d.status === 'active' ? 'Hoạt động' : 'Ngừng'}
                    </span>
                  </td>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => remove(d)} className="text-xs text-red-500 hover:text-red-700">Ngừng</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editing === 'new' ? 'Thêm phòng ban' : `Sửa: ${editing.name}`}</h3>
            <div className="grid grid-cols-2 gap-3">
              {F('code', 'Mã')}
              {F('name', 'Tên')}
              {F('type', 'Loại', { type: 'select', options: [{ value: 'branch', label: 'Chi nhánh' }, { value: 'hq', label: 'Phòng ban' }] })}
              {F('headName', 'Trưởng phòng')}
              {F('phone', 'SĐT')}
              {F('address', 'Địa chỉ')}
              {F('description', 'Mô tả', { wide: true })}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2 rounded-lg disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button onClick={() => setEditing(null)} className="bg-gray-100 hover:bg-gray-200 text-sm px-5 py-2 rounded-lg">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// PERMISSION MATRIX
// ═══════════════════════════════════════════════════════
export function PermissionMatrix() {
  const [roles, setRoles] = useState([])
  const [permDefs, setPermDefs] = useState({ permissions: {}, groups: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState({})
  const [showCreate, setShowCreate] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/hr/roles').then(r => setRoles(r.data)),
      api.get('/hr/permissions').then(r => setPermDefs(r.data)),
    ]).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const toggle = (roleId, perm) => {
    if (roleId === 'admin') return // admin always has all
    setRoles(prev => prev.map(r => {
      if (r._id !== roleId) return r
      const perms = r.permissions || []
      const next = perms.includes(perm) ? perms.filter(p => p !== perm) : [...perms, perm]
      return { ...r, permissions: next }
    }))
    setDirty(prev => ({ ...prev, [roleId]: true }))
  }

  const changeScope = (roleId, scope) => {
    setRoles(prev => prev.map(r => r._id === roleId ? { ...r, scope } : r))
    setDirty(prev => ({ ...prev, [roleId]: true }))
  }

  const saveRole = async (roleId) => {
    setSaving(true)
    try {
      const role = roles.find(r => r._id === roleId)
      await api.put(`/hr/roles/${roleId}`, { permissions: role.permissions, scope: role.scope, label: role.label })
      setDirty(prev => ({ ...prev, [roleId]: false }))
    } catch (err) { alert(err.response?.data?.error || 'Lỗi lưu') }
    setSaving(false)
  }

  const deleteRole = async (role) => {
    if (!confirm(`Xóa vai trò "${role.label || role._id}"? Thao tác không thể hoàn tác.`)) return
    try {
      await api.delete(`/hr/roles/${role._id}`)
      load()
    } catch (err) { alert(err.response?.data?.error || 'Lỗi xóa') }
  }

  if (loading) return <div className="text-gray-400 py-8 text-center">Đang tải...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Ma trận phân quyền</h3>
          <p className="text-sm text-gray-500">Tick để cấp quyền cho vai trò. Admin luôn có tất cả quyền. Vai trò phạm vi <b>site</b> chỉ áp dụng cho chi nhánh được gán.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium">+ Thêm vai trò</button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left text-xs text-gray-500 sticky left-0 bg-gray-50 min-w-[140px]">Vai trò</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500 min-w-[80px]">Phạm vi</th>
              {(permDefs.groups || []).map(g => (
                <th key={g.key} colSpan={g.perms.length} className="px-2 py-2 text-center text-xs text-gray-600 border-l border-gray-200">
                  {g.label}
                </th>
              ))}
              <th className="px-3 py-2 w-28"></th>
            </tr>
            <tr className="bg-gray-50 border-t border-gray-100">
              <th className="sticky left-0 bg-gray-50"></th>
              <th></th>
              {(permDefs.groups || []).flatMap(g => g.perms.map(p => {
                const full = permDefs.permissions[p] || p
                const m = full.match(/^(Xem|Quản lý|Nhập)\s+(.+)$/)
                const verb = m ? (m[1] === 'Quản lý' ? 'QL' : m[1]) : ''
                const noun = (m ? m[2] : full).replace(/\s*\([^)]*\)\s*$/, '').slice(0, 14)
                return (
                  <th key={p} className="px-1 py-1 text-center border-l border-gray-100 min-w-[64px] whitespace-nowrap" title={full}>
                    {verb && <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide">{verb}</div>}
                    <div className="text-[10px] text-gray-600">{noun}</div>
                  </th>
                )
              }))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roles.map(role => (
              <tr key={role._id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium sticky left-0 bg-white">
                  {role.label || role._id}
                  <div className="text-[10px] text-gray-400">{role._id}{role.isSystem ? ' · hệ thống' : ''}</div>
                </td>
                <td className="text-center text-xs">
                  <select value={role.scope || 'group'}
                    disabled={role._id === 'admin'}
                    onChange={e => changeScope(role._id, e.target.value)}
                    className="border border-gray-200 rounded px-1.5 py-0.5 text-xs">
                    <option value="group">Tập đoàn</option>
                    <option value="site">Chi nhánh</option>
                  </select>
                </td>
                {(permDefs.groups || []).flatMap(g => g.perms.map(p => (
                  <td key={p} className="text-center border-l border-gray-100">
                    <input
                      type="checkbox"
                      checked={role._id === 'admin' || (role.permissions || []).includes(p)}
                      disabled={role._id === 'admin'}
                      onChange={() => toggle(role._id, p)}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </td>
                )))}
                <td className="px-2 text-right whitespace-nowrap">
                  {dirty[role._id] && (
                    <button onClick={() => saveRole(role._id)} disabled={saving}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50 mr-1">Lưu</button>
                  )}
                  {!role.isSystem && (
                    <button onClick={() => deleteRole(role)}
                      className="text-xs text-red-600 hover:text-red-800 px-1">Xóa</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateRoleModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} />}
    </div>
  )
}

function CreateRoleModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ _id: '', label: '', description: '', scope: 'site' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const submit = async () => {
    if (!form._id.trim() || !form.label.trim()) return setErr('Mã và tên là bắt buộc')
    if (!/^[a-z0-9_]+$/.test(form._id)) return setErr('Mã chỉ cho phép chữ thường, số và _')
    setSaving(true); setErr('')
    try {
      await api.post('/hr/roles', { ...form, permissions: [] })
      onCreated()
    } catch (e) { setErr(e.response?.data?.error || 'Lỗi'); setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Thêm vai trò mới</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{err}</div>}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mã vai trò (ASCII, dùng để định danh)</label>
            <input value={form._id} onChange={e => setForm(f => ({ ...f, _id: e.target.value.toLowerCase() }))}
              placeholder="vd: truongnhom_xn" className="w-full border rounded px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tên hiển thị *</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="Trưởng nhóm XN" className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Phạm vi</label>
            <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm">
              <option value="group">Tập đoàn (áp dụng mọi chi nhánh)</option>
              <option value="site">Chi nhánh (gán riêng theo từng cơ sở)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mô tả</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <p className="text-xs text-gray-400">Sau khi tạo, quay về ma trận để tick các quyền cần thiết.</p>
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded">Hủy</button>
          <button onClick={submit} disabled={saving}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Đang tạo…' : 'Tạo vai trò'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function HRManagement() {
  const { hrKey } = useParams()
  const section = hrKey || 'employees'

  return (
    <div>
      {section === 'employees' && <EmployeeSection />}
      {section === 'departments' && <DepartmentSection />}
      {section === 'permissions' && <PermissionMatrix />}
    </div>
  )
}
