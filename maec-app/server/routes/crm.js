const express = require('express')
const KVStore = require('../models/KVStore')

const router = express.Router()
const KEY    = 'crm'

const load = async () => {
  const doc = await KVStore.findById(KEY)
  return doc ? doc.data : {}
}

// GET /api/crm
router.get('/', async (req, res) => {
  try {
    res.json(await load())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/crm  — save full CRM dataset (admin only, guarded by server middleware)
router.put('/', async (req, res) => {
  try {
    await KVStore.findByIdAndUpdate(KEY, { data: req.body }, { upsert: true, new: true })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
