const express = require('express')
const KVStore = require('../models/KVStore')

const router = express.Router()
const KEY = 'actuals'

const load = async () => {
  const doc = await KVStore.findById(KEY)
  return doc ? doc.data : {}
}

// GET all actuals
router.get('/', async (req, res) => {
  try {
    res.json(await load())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT a single month entry
router.put('/:key', async (req, res) => {
  try {
    const all = await load()
    all[req.params.key] = req.body
    const doc = await KVStore.findByIdAndUpdate(KEY, { data: all }, { upsert: true, new: true })
    res.json(doc.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE a single month
router.delete('/:key', async (req, res) => {
  try {
    const all = await load()
    delete all[req.params.key]
    const doc = await KVStore.findByIdAndUpdate(KEY, { data: all }, { upsert: true, new: true })
    res.json(doc.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
