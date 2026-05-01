const express = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../middleware/auth')
const Task = require('../models/Task')
const User = require('../models/User')

const router = express.Router()

// Filter tasks by role
const visibleFilter = (user) => {
  if (user.role === 'giamdoc' || user.role === 'admin') return {}
  if (user.role === 'truongphong') return { department: user.department }
  if (user.role === 'nhanvien') return { assignee: user.username }
  return { _id: null } // guest sees nothing
}

// GET /api/tasks
router.get('/', requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find(visibleFilter(req.user)).lean()
    const users = await User.find().lean()
    const userList = users.map(u => ({
      username: u._id,
      displayName: u.displayName || u._id,
      role: u.role,
      department: u.department,
    }))
    res.json({ tasks, users: userList })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/tasks
router.post('/', requireAuth, async (req, res) => {
  try {
    const { role, username, department } = req.user
    if (role === 'guest') return res.status(403).json({ error: 'Guest không thể tạo công việc' })

    const { title, description, deadline, priority, assignee, category } = req.body
    if (!title || !title.trim()) return res.status(400).json({ error: 'Tiêu đề công việc không được trống' })

    let taskAssignee = username
    let taskDept = department
    if ((role === 'truongphong' || role === 'giamdoc' || role === 'admin') && assignee) {
      taskAssignee = assignee
      const assigneeUser = await User.findById(assignee)
      taskDept = assigneeUser?.department || department
    }

    const assigneeUser = await User.findById(taskAssignee)
    const now = new Date().toISOString()
    const task = await Task.create({
      _id: crypto.randomUUID(),
      title: title.trim(),
      description: (description || '').trim(),
      deadline: deadline || null,
      priority: priority || 'medium',
      status: 'todo',
      result: '',
      assignee: taskAssignee,
      assigneeName: assigneeUser?.displayName || taskAssignee,
      department: taskDept,
      category: category || '',
      createdAt: now,
      updatedAt: now,
      comments: [],
    })
    res.json(task.toObject())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/tasks/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { role, username, department } = req.user
    const task = await Task.findById(req.params.id)
    if (!task) return res.status(404).json({ error: 'Không tìm thấy công việc' })

    if (role === 'guest') return res.status(403).json({ error: 'Không có quyền' })
    if (role === 'nhanvien' && task.assignee !== username) return res.status(403).json({ error: 'Không có quyền chỉnh sửa công việc của người khác' })
    if (role === 'truongphong' && task.department !== department) return res.status(403).json({ error: 'Không có quyền chỉnh sửa công việc phòng khác' })

    const { status, result, title, description, deadline, priority, category } = req.body
    if (status !== undefined) task.status = status
    if (result !== undefined) task.result = result
    if (role !== 'nhanvien' || task.assignee === username) {
      if (title !== undefined) task.title = title
      if (description !== undefined) task.description = description
      if (deadline !== undefined) task.deadline = deadline
      if (priority !== undefined) task.priority = priority
      if (category !== undefined) task.category = category
    }
    task.updatedAt = new Date().toISOString()
    await task.save()
    res.json(task.toObject())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/tasks/:id/comments
router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const { role, username, department, displayName } = req.user
    if (role === 'nhanvien' || role === 'guest') return res.status(403).json({ error: 'Chỉ trưởng phòng và giám đốc mới có thể thêm nhận xét' })

    const task = await Task.findById(req.params.id)
    if (!task) return res.status(404).json({ error: 'Không tìm thấy công việc' })
    if (role === 'truongphong' && task.department !== department) return res.status(403).json({ error: 'Không có quyền nhận xét công việc phòng khác' })

    const { text } = req.body
    if (!text || !text.trim()) return res.status(400).json({ error: 'Nội dung nhận xét không được trống' })

    task.comments.push({
      id: crypto.randomUUID(),
      author: username,
      authorName: displayName,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    })
    task.updatedAt = new Date().toISOString()
    await task.save()
    res.json(task.toObject())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/tasks/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { role, username, department } = req.user
    const task = await Task.findById(req.params.id)
    if (!task) return res.status(404).json({ error: 'Không tìm thấy công việc' })

    if (role === 'guest') return res.status(403).json({ error: 'Không có quyền' })
    if (role === 'nhanvien' && task.assignee !== username) return res.status(403).json({ error: 'Không có quyền xóa công việc của người khác' })
    if (role === 'truongphong' && task.department !== department) return res.status(403).json({ error: 'Không có quyền xóa công việc phòng khác' })

    await Task.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
