const express = require('express')
const KVStore = require('../models/KVStore')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()
const KEY = 'work-categories'

router.get('/', requireAuth, async (req, res) => {
  try {
    const doc = await KVStore.findById(KEY)
    res.json(doc?.data || {})
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/', requireAuth, async (req, res) => {
  try {
    const { role, department } = req.user
    const existing = await KVStore.findById(KEY)
    const current = existing?.data || {}
    let updated
    if (role === 'admin' || role === 'giamdoc') {
      updated = req.body
    } else if (role === 'truongphong') {
      updated = { ...current, [department]: req.body[department] }
    } else {
      return res.status(403).json({ error: 'Không có quyền' })
    }
    await KVStore.findByIdAndUpdate(KEY, { data: updated }, { upsert: true, new: true })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
