import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTasks, createTask, updateTask, addComment, deleteTask, getSites, getWorkCategories, saveWorkCategories } from '../api'

const FIXED_DEPTS = ['Ops', 'HR', 'Kế toán']

const STATUS_CONFIG = {
  todo:       { label: 'Chưa bắt đầu', color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
  inprogress: { label: 'Đang thực hiện', color: 'bg-blue-100 text-blue-700',  dot: 'bg-blue-500' },
  done:       { label: 'Hoàn thành',    color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
}
const PRIORITY_CONFIG = {
  high:   { label: 'Cao',     color: 'bg-red-100 text-red-700',      border: 'border-l-red-400' },
  medium: { label: 'Trung bình', color: 'bg-yellow-100 text-yellow-700', border: 'border-l-yellow-400' },
  low:    { label: 'Thấp',    color: 'bg-gray-100 text-gray-500',    border: 'border-l-gray-300' },
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}
const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')} ${d.getDate()}/${d.getMonth()+1}`
}
const isOverdue = (deadline, status) => {
  if (!deadline || status === 'done') return false
  return new Date(deadline) < new Date()
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.todo
  return <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${c.color}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
    {c.label}
  </span>
}

function PriorityBadge({ priority }) {
  const c = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${c.color}`}>{c.label}</span>
}

function ProgressBar({ tasks }) {
  const total = tasks.length
  if (total === 0) return <span className="text-xs text-gray-400">Chưa có công việc</span>
  const done = tasks.filter(t => t.status === 'done').length
  const prog = tasks.filter(t => t.status === 'inprogress').length
  const pct = Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full flex">
          <div className="bg-green-500 h-full transition-all" style={{ width: `${(done/total)*100}%` }} />
          <div className="bg-blue-400 h-full transition-all" style={{ width: `${(prog/total)*100}%` }} />
        </div>
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">{done}/{total} ({pct}%)</span>
    </div>
  )
}

// ─── Task Card ──────────────────────────────────────────────────────────────
function TaskCard({ task, onClick, showAssignee }) {
  const overdue = isOverdue(task.deadline, task.status)
  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium
  return (
    <div
      onClick={() => onClick(task)}
      className={`bg-white rounded-lg border-l-4 ${pc.border} border border-gray-200 p-3 cursor-pointer hover:shadow-md transition-shadow space-y-1.5`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-800 leading-snug">{task.title}</p>
        <StatusBadge status={task.status} />
      </div>
      {task.description && <p className="text-xs text-gray-500 line-clamp-2">{task.description}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        <PriorityBadge priority={task.priority} />
        {showAssignee && (
          <span className="text-xs text-indigo-600 font-medium">{task.assigneeName || task.assignee}</span>
        )}
        {task.deadline && (
          <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
            {overdue ? '⚠ ' : ''}Hạn: {fmtDate(task.deadline)}
          </span>
        )}
        {task.comments?.length > 0 && (
          <span className="text-xs text-gray-400">{task.comments.length} nhận xét</span>
        )}
      </div>
    </div>
  )
}

// ─── Add Task Modal ─────────────────────────────────────────────────────────
function AddTaskModal({ onClose, onSave, users, userRole, userDept, categories }) {
  const [form, setForm] = useState({ title: '', description: '', deadline: '', priority: 'medium', assignee: '', category: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canAssign = userRole === 'truongphong' || userRole === 'giamdoc' || userRole === 'admin'
  const assignableUsers = useMemo(() => {
    if (!canAssign) return []
    return users.filter(u => {
      if (u.role !== 'nhanvien') return false
      if (userRole === 'truongphong') return u.department === userDept
      return true
    })
  }, [users, canAssign, userRole, userDept])

  // Determine which dept to use for category dropdown
  const assigneeDept = useMemo(() => {
    if (form.assignee) {
      const u = users.find(u => u.username === form.assignee)
      return u?.department || userDept
    }
    return userDept
  }, [form.assignee, users, userDept])

  const deptCategories = (categories || {})[assigneeDept] || []

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Vui lòng nhập tiêu đề'); return }
    setSaving(true)
    try {
      const payload = { ...form }
      if (!canAssign) delete payload.assignee
      await onSave(payload)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi lưu công việc')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Thêm công việc mới</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tiêu đề *</label>
            <input value={form.title} onChange={e => setF('title', e.target.value)}
              placeholder="Tên công việc..."
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mô tả</label>
            <textarea value={form.description} onChange={e => setF('description', e.target.value)}
              rows={2} placeholder="Mô tả thêm (không bắt buộc)..."
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hạn hoàn thành</label>
              <input type="date" value={form.deadline} onChange={e => setF('deadline', e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ưu tiên</label>
              <select value={form.priority} onChange={e => setF('priority', e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400">
                <option value="high">Cao</option>
                <option value="medium">Trung bình</option>
                <option value="low">Thấp</option>
              </select>
            </div>
          </div>

          {canAssign && assignableUsers.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Giao cho</label>
              <select value={form.assignee} onChange={e => setF('assignee', e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400">
                <option value="">— Chọn nhân viên —</option>
                {assignableUsers.map(u => (
                  <option key={u.username} value={u.username}>{u.displayName} ({u.department})</option>
                ))}
              </select>
            </div>
          )}

          {deptCategories.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Đầu mục công việc</label>
              <select value={form.category} onChange={e => setF('category', e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400">
                <option value="">— Chọn đầu mục —</option>
                {deptCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.weight}%)</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">Hủy</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-50">
              {saving ? 'Đang lưu...' : 'Thêm công việc'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Task Detail Panel ───────────────────────────────────────────────────────
function TaskPanel({ task, onClose, onUpdate, onComment, onDelete, userRole, userDept, username }) {
  const [status, setStatus] = useState(task.status)
  const [result, setResult] = useState(task.result || '')
  const [commentText, setCommentText] = useState('')
  const [saving, setSaving] = useState(false)
  const [commenting, setCommenting] = useState(false)

  const canEdit = userRole === 'admin' ||
    (userRole === 'nhanvien' && task.assignee === username) ||
    (userRole === 'truongphong' && task.department === userDept) ||
    userRole === 'giamdoc'

  const canComment = userRole === 'truongphong' || userRole === 'giamdoc' || userRole === 'admin'
  const canDelete = userRole === 'admin' || userRole === 'giamdoc' ||
    (userRole === 'truongphong' && task.department === userDept) ||
    (userRole === 'nhanvien' && task.assignee === username)

  const handleSave = async () => {
    setSaving(true)
    await onUpdate(task.id, { status, result })
    setSaving(false)
  }

  const handleComment = async () => {
    if (!commentText.trim()) return
    setCommenting(true)
    await onComment(task.id, commentText)
    setCommentText('')
    setCommenting(false)
  }

  const overdue = isOverdue(task.deadline, task.status)
  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-end" onClick={onClose}>
      <div className="bg-white h-full w-full max-w-lg shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`px-5 py-4 border-b border-gray-200 border-l-4 ${pc.border} flex-shrink-0`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 text-base leading-snug">{task.title}</h3>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                <span className="text-xs text-indigo-600">{task.department}</span>
                <span className="text-xs text-gray-500">→ {task.assigneeName || task.assignee}</span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none flex-shrink-0">&times;</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Info row */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-gray-400 block">Hạn hoàn thành</span>
              <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-700'}>
                {overdue ? '⚠ ' : ''}{fmtDate(task.deadline)}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-400 block">Cập nhật lần cuối</span>
              <span className="text-gray-700">{fmtTime(task.updatedAt)}</span>
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mô tả</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Edit status + result */}
          {canEdit && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Cập nhật tiến độ</p>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Trạng thái</label>
                <select value={status} onChange={e => setStatus(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white">
                  <option value="todo">Chưa bắt đầu</option>
                  <option value="inprogress">Đang thực hiện</option>
                  <option value="done">Hoàn thành</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Kết quả / Ghi chú</label>
                <textarea value={result} onChange={e => setResult(e.target.value)}
                  rows={3} placeholder="Mô tả kết quả hoặc tiến độ thực hiện..."
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none bg-white" />
              </div>
              <div className="flex justify-between items-center">
                {canDelete && (
                  <button onClick={() => { onDelete(task.id); onClose() }}
                    className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded">
                    Xóa công việc
                  </button>
                )}
                <button onClick={handleSave} disabled={saving}
                  className="ml-auto px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-50">
                  {saving ? 'Đang lưu...' : 'Lưu cập nhật'}
                </button>
              </div>
            </div>
          )}

          {/* Result display (read-only for non-editors) */}
          {!canEdit && task.result && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Kết quả</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3">{task.result}</p>
            </div>
          )}

          {/* Comments */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Nhận xét ({task.comments?.length || 0})
            </p>
            <div className="space-y-2.5">
              {(task.comments || []).map(c => (
                <div key={c.id} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-amber-800">{c.authorName || c.author}</span>
                    <span className="text-xs text-amber-600">{fmtTime(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.text}</p>
                </div>
              ))}
              {(task.comments || []).length === 0 && (
                <p className="text-xs text-gray-400 italic">Chưa có nhận xét</p>
              )}
            </div>

            {canComment && (
              <div className="mt-3 flex gap-2">
                <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                  rows={2} placeholder="Thêm nhận xét..."
                  className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-amber-400 resize-none" />
                <button onClick={handleComment} disabled={commenting || !commentText.trim()}
                  className="px-3 py-2 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 font-medium disabled:opacity-50 self-end">
                  {commenting ? '...' : 'Gửi'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Nhân viên View ──────────────────────────────────────────────────────────
function NhanVienView({ tasks, users, onAddTask, onSelectTask, username }) {
  const myTasks = tasks.filter(t => t.assignee === username)
  const stats = {
    total: myTasks.length,
    done: myTasks.filter(t => t.status === 'done').length,
    inprogress: myTasks.filter(t => t.status === 'inprogress').length,
    todo: myTasks.filter(t => t.status === 'todo').length,
    overdue: myTasks.filter(t => isOverdue(t.deadline, t.status)).length,
  }

  const columns = ['todo', 'inprogress', 'done']

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Tổng công việc', value: stats.total, cls: 'text-gray-700' },
          { label: 'Hoàn thành',    value: stats.done,      cls: 'text-green-600' },
          { label: 'Đang làm',      value: stats.inprogress, cls: 'text-blue-600' },
          { label: 'Quá hạn',       value: stats.overdue,   cls: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-3 gap-4">
        {columns.map(col => {
          const colTasks = myTasks.filter(t => t.status === col)
          const sc = STATUS_CONFIG[col]
          return (
            <div key={col} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
                  <span className="text-xs font-semibold text-gray-600">{sc.label}</span>
                </div>
                <span className="text-xs text-gray-400">{colTasks.length}</span>
              </div>
              <div className="space-y-2">
                {colTasks.map(t => (
                  <TaskCard key={t.id} task={t} onClick={onSelectTask} showAssignee={false} />
                ))}
                {colTasks.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">Trống</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Trưởng phòng View ───────────────────────────────────────────────────────
function TruongPhongView({ tasks, users, department, onSelectTask, categories, onSaveCategories }) {
  const [selectedUser, setSelectedUser] = useState(null)
  const [viewMode, setViewMode] = useState('board')
  const [catModal, setCatModal] = useState(null)

  const deptUsers = useMemo(() =>
    users.filter(u => u.role === 'nhanvien' && u.department === department),
    [users, department]
  )

  const deptTasks = useMemo(() =>
    tasks.filter(t => t.department === department),
    [tasks, department]
  )

  const userTasks = useMemo(() => selectedUser
    ? deptTasks.filter(t => t.assignee === selectedUser)
    : deptTasks,
    [deptTasks, selectedUser]
  )

  const stats = {
    total: deptTasks.length,
    done: deptTasks.filter(t => t.status === 'done').length,
    inprogress: deptTasks.filter(t => t.status === 'inprogress').length,
    overdue: deptTasks.filter(t => isOverdue(t.deadline, t.status)).length,
  }

  return (
    <div className="space-y-4">
      {/* Dept stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Tổng công việc', value: stats.total,      cls: 'text-gray-700' },
          { label: 'Hoàn thành',    value: stats.done,        cls: 'text-green-600' },
          { label: 'Đang làm',      value: stats.inprogress,  cls: 'text-blue-600' },
          { label: 'Quá hạn',       value: stats.overdue,     cls: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Employee filter + view toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nhân viên — {department}</p>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedUser(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!selectedUser ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Tất cả
          </button>
          {deptUsers.map(u => {
            const uTasks = deptTasks.filter(t => t.assignee === u.username)
            const uDone = uTasks.filter(t => t.status === 'done').length
            return (
              <button key={u.username}
                onClick={() => setSelectedUser(u.username)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${selectedUser === u.username ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {u.displayName}
                <span className={`text-xs ${selectedUser === u.username ? 'text-indigo-200' : 'text-gray-400'}`}>
                  {uDone}/{uTasks.length}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Employee progress cards */}
      {!selectedUser && (
        <div className="grid grid-cols-2 gap-3">
          {deptUsers.map(u => {
            const uTasks = deptTasks.filter(t => t.assignee === u.username)
            const overdue = uTasks.filter(t => isOverdue(t.deadline, t.status)).length
            return (
              <div key={u.username} className="bg-white rounded-lg border border-gray-200 p-4 space-y-2 cursor-pointer hover:border-indigo-300 transition-colors"
                onClick={() => setSelectedUser(u.username)}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-800">{u.displayName}</span>
                  {overdue > 0 && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{overdue} quá hạn</span>}
                </div>
                <ProgressBar tasks={uTasks} />
                <div className="flex gap-2">
                  {['todo','inprogress','done'].map(s => {
                    const cnt = uTasks.filter(t => t.status === s).length
                    if (cnt === 0) return null
                    const sc = STATUS_CONFIG[s]
                    return <span key={s} className={`text-xs px-1.5 py-0.5 rounded ${sc.color}`}>{sc.label}: {cnt}</span>
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Task list / list view / gantt */}
      {viewMode === 'board' && (() => {
        const deptCats = (categories || {})[department] || []
        const catMap = {}
        deptCats.forEach(c => { catMap[c.id] = c })
        const grouped = {}
        const uncategorized = []
        userTasks.forEach(t => {
          if (t.category && catMap[t.category]) {
            if (!grouped[t.category]) grouped[t.category] = []
            grouped[t.category].push(t)
          } else {
            uncategorized.push(t)
          }
        })
        const weightedScore = deptCats.length > 0 ? (() => {
          let total = 0
          deptCats.forEach(cat => {
            const catTasks = grouped[cat.id] || []
            const done = catTasks.filter(t => t.status === 'done').length
            const pct = catTasks.length > 0 ? (done / catTasks.length) * 100 : 0
            total += (cat.weight / 100) * pct
          })
          return Math.round(total)
        })() : null

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Công việc — {department}</p>
              <div className="flex items-center gap-2">
                {weightedScore !== null && (
                  <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                    Tiến độ tổng hợp: {weightedScore}%
                  </span>
                )}
                <button onClick={() => setCatModal(department)}
                  className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg font-medium">
                  ⚙ Quản lý đầu mục
                </button>
              </div>
            </div>

            {deptCats.length > 0 ? (
              <>
                {deptCats.map(cat => {
                  const catTasks = grouped[cat.id] || []
                  const done = catTasks.filter(t => t.status === 'done').length
                  const pct = catTasks.length > 0 ? Math.round((done / catTasks.length) * 100) : 0
                  return (
                    <div key={cat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-indigo-50">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-indigo-800 text-sm">{cat.name}</span>
                          <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">
                            Trọng số {cat.weight}%
                          </span>
                          <span className="text-xs text-gray-500">{catTasks.length} công việc</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-bold text-indigo-600">{pct}%</span>
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        {catTasks.length === 0
                          ? <p className="text-xs text-gray-400 text-center py-2">Chưa có công việc nào</p>
                          : catTasks
                              .sort((a,b) => { const o={todo:0,inprogress:1,done:2}; return (o[a.status]??3)-(o[b.status]??3) })
                              .map(t => <TaskCard key={t.id} task={t} onClick={onSelectTask} showAssignee={true} />)
                        }
                      </div>
                    </div>
                  )
                })}
                {uncategorized.length > 0 && (
                  <div className="bg-white rounded-xl border border-dashed border-gray-300 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                      <span className="font-semibold text-gray-500 text-sm">Chưa phân loại</span>
                      <span className="ml-2 text-xs text-gray-400">{uncategorized.length} công việc</span>
                    </div>
                    <div className="p-3 space-y-2">
                      {uncategorized
                        .sort((a,b) => { const o={todo:0,inprogress:1,done:2}; return (o[a.status]??3)-(o[b.status]??3) })
                        .map(t => <TaskCard key={t.id} task={t} onClick={onSelectTask} showAssignee={true} />)
                      }
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <button onClick={() => setCatModal(department)}
                    className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg font-medium">
                    + Thiết lập đầu mục công việc
                  </button>
                </div>
                {userTasks.length === 0
                  ? <p className="text-sm text-gray-400 text-center py-6">Chưa có công việc nào</p>
                  : userTasks
                      .sort((a,b) => { const o={todo:0,inprogress:1,done:2}; return (o[a.status]??3)-(o[b.status]??3) })
                      .map(t => <TaskCard key={t.id} task={t} onClick={onSelectTask} showAssignee={true} />)
                }
              </div>
            )}
          </div>
        )
      })()}
      {viewMode === 'list' && (
        <ListView tasks={userTasks} onSelectTask={onSelectTask} />
      )}
      {viewMode === 'gantt' && (
        <GanttView tasks={userTasks} users={users} onSelectTask={onSelectTask} />
      )}

      {catModal && (
        <CategoryManagerModal
          dept={catModal}
          categories={categories || {}}
          onClose={() => setCatModal(null)}
          onSave={async (dept, cats) => {
            const updated = { ...(categories || {}), [dept]: cats }
            await onSaveCategories(updated)
          }}
        />
      )}
    </div>
  )
}

// ─── View Toggle ─────────────────────────────────────────────────────────────
function ViewToggle({ mode, onChange }) {
  return (
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
      {[
        { key: 'board', label: 'Kanban' },
        { key: 'list',  label: 'Danh sách' },
        { key: 'gantt', label: 'Gantt' },
      ].map(v => (
        <button key={v.key} onClick={() => onChange(v.key)}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${mode === v.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          {v.label}
        </button>
      ))}
    </div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────
function ListView({ tasks, onSelectTask }) {
  // Group: dept → assignee → tasks
  const byDept = {}
  tasks.forEach(t => {
    const dept = t.department || '(Chưa phân phòng)'
    if (!byDept[dept]) byDept[dept] = {}
    const key = t.assignee
    if (!byDept[dept][key]) byDept[dept][key] = { name: t.assigneeName || t.assignee, tasks: [] }
    byDept[dept][key].tasks.push(t)
  })
  const depts = Object.keys(byDept).sort()
  const statusOrder = { todo: 0, inprogress: 1, done: 2 }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {tasks.length === 0 ? (
        <p className="text-center py-10 text-sm text-gray-400">Chưa có công việc nào</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Công việc</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Ưu tiên</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Trạng thái</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Hạn</th>
            </tr>
          </thead>
          <tbody>
            {depts.map(dept => {
              const assignees = Object.entries(byDept[dept])
              const deptTasks = assignees.flatMap(([,v]) => v.tasks)
              const deptDone = deptTasks.filter(t => t.status === 'done').length
              const deptPct = deptTasks.length ? Math.round(deptDone / deptTasks.length * 100) : 0
              return (
                <React.Fragment key={dept}>
                  {/* Department header */}
                  <tr className="bg-indigo-700">
                    <td colSpan={4} className="px-4 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">🏢 {dept}</span>
                        <span className="text-xs text-indigo-200">
                          {deptDone}/{deptTasks.length} hoàn thành ({deptPct}%)
                        </span>
                      </div>
                    </td>
                  </tr>
                  {assignees.map(([assignee, { name, tasks: aTasks }]) => {
                    const aDone = aTasks.filter(t => t.status === 'done').length
                    const sorted = [...aTasks].sort((a,b) => (statusOrder[a.status]??3)-(statusOrder[b.status]??3))
                    return (
                      <React.Fragment key={assignee}>
                        {/* Assignee sub-header */}
                        <tr className="bg-indigo-50 border-b border-indigo-100">
                          <td colSpan={4} className="px-4 py-1.5">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                                {name.charAt(0)}
                              </span>
                              <span className="text-xs font-semibold text-indigo-800">{name}</span>
                              <span className="text-xs text-indigo-400">{aDone}/{aTasks.length} công việc</span>
                            </div>
                          </td>
                        </tr>
                        {/* Task rows */}
                        {sorted.map(task => {
                          const overdue = isOverdue(task.deadline, task.status)
                          return (
                            <tr key={task.id} onClick={() => onSelectTask(task)}
                              className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                              <td className="pl-10 pr-3 py-2 font-medium text-gray-800 max-w-xs">
                                <span className="line-clamp-1">{task.title}</span>
                                {task.description && <span className="block text-xs text-gray-400 truncate">{task.description}</span>}
                              </td>
                              <td className="px-3 py-2"><PriorityBadge priority={task.priority} /></td>
                              <td className="px-3 py-2"><StatusBadge status={task.status} /></td>
                              <td className={`px-3 py-2 whitespace-nowrap text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                                {overdue ? '⚠ ' : ''}{fmtDate(task.deadline)}
                              </td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Gantt View ───────────────────────────────────────────────────────────────
function GanttView({ tasks, users, onSelectTask }) {
  const now = new Date()
  const allDates = tasks.flatMap(t => [
    t.createdAt ? new Date(t.createdAt) : null,
    t.deadline  ? new Date(t.deadline)  : null,
  ].filter(Boolean))

  const minDate = new Date(Math.min(
    ...(allDates.length ? allDates.map(d => d.getTime()) : [now.getTime()]),
    new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
  ))
  const maxDate = new Date(Math.max(
    ...(allDates.length ? allDates.map(d => d.getTime()) : [now.getTime()]),
    new Date(now.getFullYear(), now.getMonth() + 2, 0).getTime()
  ))
  // Snap to month boundaries
  const rangeStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
  const rangeEnd   = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0)
  const totalMs    = rangeEnd - rangeStart

  const toLeft = (date) => date ? `${((new Date(date) - rangeStart) / totalMs) * 100}%` : null
  const toWidth = (start, end) => {
    const s = new Date(start || rangeStart)
    const e = end ? new Date(end) : new Date(s.getTime() + 3 * 86400000)
    return `${Math.max(((e - s) / totalMs) * 100, 0.5)}%`
  }

  // Month header labels
  const months = []
  let cur = new Date(rangeStart)
  while (cur <= rangeEnd) {
    months.push(new Date(cur))
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  const todayLeft = toLeft(now)

  // Group: dept → assignee → tasks
  const byDept = {}
  tasks.forEach(t => {
    const dept = t.department || '(Chưa phân phòng)'
    if (!byDept[dept]) byDept[dept] = {}
    const key = t.assignee
    if (!byDept[dept][key]) byDept[dept][key] = { user: users.find(u => u.username === key), tasks: [] }
    byDept[dept][key].tasks.push(t)
  })
  const depts = Object.keys(byDept).sort()

  const barColor = (task) => {
    if (task.status === 'done') return 'bg-green-400'
    if (isOverdue(task.deadline, task.status)) return 'bg-red-400'
    if (task.status === 'inprogress') return 'bg-blue-400'
    return 'bg-gray-300'
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: '700px' }}>
          {/* Month header */}
          <div className="flex border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
            <div className="w-48 shrink-0 px-3 py-2 font-semibold border-r border-gray-200">Phòng ban / Nhân viên / Công việc</div>
            <div className="flex-1 relative h-8">
              {months.map(m => (
                <div key={m.getTime()} className="absolute top-0 bottom-0 flex items-center border-l border-gray-200 px-1"
                  style={{ left: toLeft(m) }}>
                  <span className="whitespace-nowrap">{m.getMonth() + 1}/{m.getFullYear()}</span>
                </div>
              ))}
              <div className="absolute top-0 bottom-0 border-l-2 border-red-400 z-10" style={{ left: todayLeft }} />
            </div>
          </div>

          {/* Rows grouped by dept then assignee */}
          {depts.map(dept => {
            const deptAssignees = Object.entries(byDept[dept])
            return (
              <React.Fragment key={dept}>
                {/* Department band */}
                <div className="flex bg-indigo-700 border-b border-indigo-600">
                  <div className="w-48 shrink-0 px-3 py-1.5 border-r border-indigo-600">
                    <span className="text-xs font-bold text-white uppercase tracking-wide">🏢 {dept}</span>
                  </div>
                  <div className="flex-1 relative" style={{ minHeight: '24px' }}>
                    <div className="absolute top-0 bottom-0 border-l-2 border-red-300 opacity-60" style={{ left: todayLeft }} />
                  </div>
                </div>
                {deptAssignees.map(([assignee, { user, tasks: aTasks }]) => (
                  <React.Fragment key={assignee}>
                    {/* Assignee sub-header */}
                    <div className="flex bg-indigo-50 border-b border-gray-100 text-xs font-semibold text-indigo-700">
                      <div className="w-48 shrink-0 px-3 py-1.5 border-r border-gray-200 truncate flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-indigo-200 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {(user?.displayName || assignee).charAt(0)}
                        </span>
                        <span className="truncate">{user?.displayName || assignee}</span>
                        <span className="ml-1 font-normal text-indigo-400 shrink-0">({aTasks.length})</span>
                      </div>
                      <div className="flex-1 relative" style={{ minHeight: '24px' }}>
                        <div className="absolute top-0 bottom-0 border-l border-red-300" style={{ left: todayLeft }} />
                      </div>
                    </div>
                    {/* Task bars */}
                    {aTasks.map(task => (
                      <div key={task.id} className="flex border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => onSelectTask(task)}>
                        <div className="w-48 shrink-0 pl-8 pr-3 py-1 text-xs text-gray-600 border-r border-gray-200 truncate">
                          {task.title}
                        </div>
                        <div className="flex-1 relative" style={{ height: '28px' }}>
                          {months.map(m => (
                            <div key={m.getTime()} className="absolute top-0 bottom-0 border-l border-gray-100"
                              style={{ left: toLeft(m) }} />
                          ))}
                          <div className="absolute top-0 bottom-0 border-l border-red-200" style={{ left: todayLeft }} />
                          {task.createdAt && (
                            <div
                              onClick={e => { e.stopPropagation(); onSelectTask(task) }}
                              className={`absolute top-2 bottom-2 rounded ${barColor(task)} opacity-80 hover:opacity-100 transition-opacity`}
                              style={{ left: toLeft(task.createdAt), width: toWidth(task.createdAt, task.deadline) }}
                              title={`${task.title} | ${user?.displayName || assignee} | Hạn: ${fmtDate(task.deadline)}`}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </React.Fragment>
            )
          })}

          {tasks.length === 0 && (
            <div className="text-center py-10 text-sm text-gray-400">Chưa có công việc nào</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Category Manager Modal ──────────────────────────────────────────────────
function CategoryManagerModal({ dept, categories, onClose, onSave }) {
  const deptCats = categories[dept] || []
  const [cats, setCats] = useState(
    deptCats.length > 0 ? deptCats : [{ id: crypto.randomUUID?.() || Date.now().toString(), name: '', weight: 100 }]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totalWeight = cats.reduce((s, c) => s + (Number(c.weight) || 0), 0)

  const addCat = () => setCats(p => [...p, { id: Date.now().toString(), name: '', weight: 0 }])
  const removeCat = (id) => setCats(p => p.filter(c => c.id !== id))
  const updateCat = (id, field, val) => setCats(p => p.map(c => c.id === id ? { ...c, [field]: val } : c))

  const handleSave = async () => {
    if (cats.some(c => !c.name.trim())) { setError('Tên đầu mục không được trống'); return }
    if (totalWeight !== 100) { setError(`Tổng trọng số phải là 100% (hiện tại: ${totalWeight}%)`); return }
    setSaving(true)
    try {
      await onSave(dept, cats)
      onClose()
    } catch { setError('Lỗi lưu') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Đầu mục công việc</h3>
            <p className="text-xs text-gray-500 mt-0.5">{dept}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          <div className="space-y-2">
            {cats.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
                <input value={c.name} onChange={e => updateCat(c.id, 'name', e.target.value)}
                  placeholder="Tên đầu mục..."
                  className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-indigo-400" />
                <div className="flex items-center gap-1">
                  <input type="number" value={c.weight} onChange={e => updateCat(c.id, 'weight', Number(e.target.value))}
                    min={0} max={100}
                    className="w-16 border border-gray-200 rounded px-2 py-1.5 text-sm text-center outline-none focus:border-indigo-400" />
                  <span className="text-xs text-gray-400">%</span>
                </div>
                <button onClick={() => removeCat(c.id)} className="text-red-400 hover:text-red-600 text-lg leading-none px-1">×</button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs">
            <button onClick={addCat} className="text-indigo-600 hover:text-indigo-700 font-medium">+ Thêm đầu mục</button>
            <span className={`font-semibold ${totalWeight === 100 ? 'text-green-600' : 'text-red-500'}`}>
              Tổng: {totalWeight}%
            </span>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">Hủy</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium disabled:opacity-50">
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Giám đốc View ───────────────────────────────────────────────────────────
function GiamDocView({ tasks, users, sites, onSelectTask, categories, onSaveCategories }) {
  const [selectedDept, setSelectedDept] = useState(null)
  const [viewMode, setViewMode] = useState('board')
  const [catModal, setCatModal] = useState(null)

  const depts = useMemo(() => {
    const all = [...new Set(tasks.map(t => t.department).filter(Boolean))]
    // Add all sites
    sites.forEach(s => { if (!all.includes(s.name)) all.push(s.name) })
    // Add fixed functional departments
    FIXED_DEPTS.forEach(d => { if (!all.includes(d)) all.push(d) })
    return all
  }, [tasks, sites])

  const filteredTasks = selectedDept ? tasks.filter(t => t.department === selectedDept) : tasks

  const totalStats = {
    total: tasks.length,
    done: tasks.filter(t => t.status === 'done').length,
    inprogress: tasks.filter(t => t.status === 'inprogress').length,
    todo: tasks.filter(t => t.status === 'todo').length,
    overdue: tasks.filter(t => isOverdue(t.deadline, t.status)).length,
  }

  return (
    <div className="space-y-4">
      {/* Company-wide stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Tổng toàn công ty', value: totalStats.total,      cls: 'text-gray-700' },
          { label: 'Hoàn thành',        value: totalStats.done,        cls: 'text-green-600' },
          { label: 'Đang làm',          value: totalStats.inprogress,  cls: 'text-blue-600' },
          { label: 'Chưa bắt đầu',      value: totalStats.todo,        cls: 'text-gray-500' },
          { label: 'Quá hạn',           value: totalStats.overdue,     cls: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* View toggle + site filter header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSelectedDept(null)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${!selectedDept ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Tất cả
          </button>
          {depts.map(d => (
            <button key={d} onClick={() => setSelectedDept(selectedDept === d ? null : d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selectedDept === d ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {d}
            </button>
          ))}
        </div>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {/* Board: site cards (only in board mode when no dept selected) */}
      {viewMode === 'board' && !selectedDept && (() => {
        const siteNames = sites.map(s => s.name)
        const backOfficeDepts = depts.filter(d => FIXED_DEPTS.includes(d))
        const branchDepts     = depts.filter(d => siteNames.includes(d))

        const DeptCard = ({ dept }) => {
          const site    = sites.find(s => s.name === dept)
          const dTasks  = tasks.filter(t => t.department === dept)
          const dUsers  = users.filter(u => u.role === 'nhanvien' && u.department === dept)
          const done    = dTasks.filter(t => t.status === 'done').length
          const prog    = dTasks.filter(t => t.status === 'inprogress').length
          const overdue = dTasks.filter(t => isOverdue(t.deadline, t.status)).length
          const pct     = dTasks.length > 0 ? Math.round((done / dTasks.length) * 100) : 0
          const isBO    = FIXED_DEPTS.includes(dept)

          const weightedPct = (() => {
            const cats = (categories || {})[dept] || []
            if (cats.length === 0) return pct
            let total = 0
            cats.forEach(cat => {
              const catTasks = dTasks.filter(t => t.category === cat.id)
              const catDone = catTasks.filter(t => t.status === 'done').length
              const catPct = catTasks.length > 0 ? (catDone / catTasks.length) * 100 : 0
              total += (cat.weight / 100) * catPct
            })
            return Math.round(total)
          })()

          return (
            <div key={dept}
              onClick={() => setSelectedDept(selectedDept === dept ? null : dept)}
              className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all space-y-3 ${selectedDept === dept ? 'border-indigo-500 shadow-lg' : 'border-gray-200 hover:border-indigo-200 hover:shadow-md'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isBO ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {isBO ? 'BackOffice' : 'Chi nhánh'}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-800 mt-1">{dept}</p>
                  {site?.location && <p className="text-xs text-gray-400">{site.location}</p>}
                  <p className="text-xs text-gray-500 mt-0.5">{dUsers.length} nhân viên · {dTasks.length} công việc</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-2xl font-bold ${weightedPct === 100 ? 'text-green-500' : weightedPct > 50 ? 'text-indigo-600' : 'text-gray-400'}`}>{weightedPct}%</p>
                  <p className="text-xs text-gray-400">% hoàn thành</p>
                </div>
              </div>
              <ProgressBar tasks={dTasks} />
              <div className="flex gap-1.5 flex-wrap">
                {done > 0    && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ {done}</span>}
                {prog > 0    && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">▶ {prog}</span>}
                {overdue > 0 && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">⚠ {overdue}</span>}
              </div>
              {dUsers.length > 0 && (
                <div className="border-t border-gray-100 pt-2 space-y-1.5">
                  {dUsers.map(u => {
                    const uTasks = dTasks.filter(t => t.assignee === u.username)
                    const uDone  = uTasks.filter(t => t.status === 'done').length
                    return (
                      <div key={u.username} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-28 shrink-0 truncate">{u.displayName}</span>
                        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-400 rounded-full transition-all"
                            style={{ width: uTasks.length > 0 ? `${(uDone/uTasks.length)*100}%` : '0%' }} />
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{uDone}/{uTasks.length}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {((categories || {})[dept] || []).length > 0 && (
                <div className="border-t border-gray-100 pt-2 space-y-1">
                  {((categories || {})[dept] || []).map(cat => {
                    const catTasks = dTasks.filter(t => t.category === cat.id)
                    const catDone = catTasks.filter(t => t.status === 'done').length
                    const catPct = catTasks.length > 0 ? Math.round((catDone / catTasks.length) * 100) : 0
                    return (
                      <div key={cat.id} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-24 shrink-0 truncate">{cat.name}</span>
                        <span className="text-xs text-gray-400 w-8 text-right shrink-0">{cat.weight}%</span>
                        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-400 rounded-full transition-all"
                            style={{ width: `${catPct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap w-8 text-right">{catPct}%</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }

        return (
          <div className="space-y-5">
            {/* Khối BackOffice */}
            {backOfficeDepts.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5">
                    <span className="text-purple-600 font-bold text-sm">🏢 Khối BackOffice</span>
                    <span className="text-xs text-purple-400">{backOfficeDepts.length} bộ phận</span>
                  </div>
                  <div className="flex-1 h-px bg-purple-100" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {backOfficeDepts.map(d => <DeptCard key={d} dept={d} />)}
                </div>
              </div>
            )}

            {/* Khối Chi nhánh */}
            {branchDepts.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                    <span className="text-blue-700 font-bold text-sm">📍 Khối Chi nhánh</span>
                    <span className="text-xs text-blue-400">{branchDepts.length} chi nhánh</span>
                  </div>
                  <div className="flex-1 h-px bg-blue-100" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {branchDepts.map(d => <DeptCard key={d} dept={d} />)}
                </div>
              </div>
            )}
          </div>
        )
      })()}
      {/* end board-mode site cards */}

      {/* List view */}
      {viewMode === 'list' && (
        <ListView tasks={filteredTasks} onSelectTask={onSelectTask} />
      )}

      {/* Gantt view */}
      {viewMode === 'gantt' && (
        <GanttView tasks={filteredTasks} users={users} onSelectTask={onSelectTask} />
      )}

      {/* Board: filtered task cards when a dept is selected */}
      {viewMode === 'board' && selectedDept && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Công việc — {selectedDept}
            <button onClick={() => setSelectedDept(null)} className="ml-2 text-xs text-gray-400 hover:text-gray-600">✕ Bỏ lọc</button>
          </p>
          <div className="space-y-2">
            {filteredTasks.length === 0
              ? <p className="text-sm text-gray-400 text-center py-6">Chưa có công việc nào</p>
              : filteredTasks
                  .sort((a,b) => {
                    const o = { todo:0, inprogress:1, done:2 }
                    return (o[a.status]??3) - (o[b.status]??3)
                  })
                  .map(t => <TaskCard key={t.id} task={t} onClick={onSelectTask} showAssignee={true} />)
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Workflow Page ──────────────────────────────────────────────────────
export default function Workflow() {
  const { auth } = useAuth()
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)

  const { role, username, department, displayName } = auth || {}

  const ROLE_CONFIG = {
    nhanvien:    { label: 'Nhân viên',   color: 'bg-blue-100 text-blue-700' },
    truongphong: { label: 'Trưởng phòng', color: 'bg-indigo-100 text-indigo-700' },
    giamdoc:     { label: 'Giám đốc',    color: 'bg-purple-100 text-purple-700' },
    admin:       { label: 'Admin',        color: 'bg-yellow-100 text-yellow-700' },
    guest:       { label: 'Guest',        color: 'bg-gray-100 text-gray-500' },
  }

  const load = useCallback(async () => {
    try {
      const [taskData, siteData] = await Promise.all([getTasks(), getSites()])
      setTasks(taskData.tasks || [])
      setUsers(taskData.users || [])
      setSites(siteData || [])
    } catch {
      // 401 is handled by the api interceptor (auto-logout)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAddTask = useCallback(async (form) => {
    await createTask(form)
    await load()
  }, [load])

  const handleUpdateTask = useCallback(async (id, data) => {
    const updated = await updateTask(id, data)
    setTasks(prev => prev.map(t => t.id === id ? updated : t))
    setSelectedTask(updated)
  }, [])

  const handleComment = useCallback(async (id, text) => {
    const updated = await addComment(id, text)
    setTasks(prev => prev.map(t => t.id === id ? updated : t))
    setSelectedTask(updated)
  }, [])

  const handleDelete = useCallback(async (id) => {
    await deleteTask(id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }, [])

  const canAddTask = role && role !== 'guest'

  const rc = ROLE_CONFIG[role] || ROLE_CONFIG.guest

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Đang tải...</div>

  if (role === 'guest') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500 space-y-2">
        <p className="text-lg font-medium">Không có quyền truy cập</p>
        <p className="text-sm">Guest không thể xem module quản lý công việc</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Quản lý Công việc</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rc.color}`}>{rc.label}</span>
            <span className="text-sm text-gray-500">{displayName || username}</span>
            {department && <span className="text-xs text-gray-400">· {department}</span>}
          </div>
        </div>
        {canAddTask && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Thêm công việc
          </button>
        )}
      </div>

      {/* Role-based view */}
      {(role === 'nhanvien') && (
        <NhanVienView
          tasks={tasks} users={users} username={username}
          onAddTask={handleAddTask}
          onSelectTask={setSelectedTask}
        />
      )}
      {(role === 'truongphong') && (
        <TruongPhongView
          tasks={tasks} users={users} department={department}
          onSelectTask={setSelectedTask}
        />
      )}
      {(role === 'giamdoc' || role === 'admin') && (
        <GiamDocView
          tasks={tasks} users={users} sites={sites}
          onSelectTask={setSelectedTask}
        />
      )}

      {/* Modals */}
      {showAdd && (
        <AddTaskModal
          onClose={() => setShowAdd(false)}
          onSave={handleAddTask}
          users={users}
          userRole={role}
          userDept={department}
        />
      )}

      {selectedTask && (
        <TaskPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdateTask}
          onComment={handleComment}
          onDelete={handleDelete}
          userRole={role}
          userDept={department}
          username={username}
        />
      )}
    </div>
  )
}
