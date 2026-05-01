const express = require('express')
const { requireAuth } = require('../middleware/auth')
const KVStore = require('../models/KVStore')

const router = express.Router()
const KEY = 'kpi'

router.get('/', requireAuth, async (req, res) => {
  try {
    const doc = await KVStore.findById(KEY)
    res.json(doc?.data || {})
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/', requireAuth, async (req, res) => {
  try {
    await KVStore.findByIdAndUpdate(KEY, { data: req.body }, { upsert: true, new: true })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
