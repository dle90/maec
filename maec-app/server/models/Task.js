const mongoose = require('mongoose')

const commentSchema = new mongoose.Schema({
  id: String,
  author: String,
  authorName: String,
  text: String,
  createdAt: String,
}, { _id: false })

const taskSchema = new mongoose.Schema({
  _id: String,          // uuid
  title: String,
  description: String,
  deadline: String,
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: { type: String, enum: ['todo', 'inprogress', 'done'], default: 'todo' },
  result: { type: String, default: '' },
  assignee: String,
  assigneeName: String,
  department: String,
  category: { type: String, default: '' },
  createdAt: String,
  updatedAt: String,
  comments: [commentSchema],
}, { _id: false })

taskSchema.set('_id', true)

module.exports = mongoose.model('Task', taskSchema)
