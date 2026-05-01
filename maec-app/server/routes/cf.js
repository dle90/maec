const express = require('express')
const KVStore = require('../models/KVStore')

const router = express.Router()

router.get('/annual', async (req, res) => {
  try {
    const doc = await KVStore.findById('annual-cf')
    res.json(doc ? doc.data : [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/annual', async (req, res) => {
  try {
    const doc = await KVStore.findByIdAndUpdate('annual-cf', { data: req.body }, { upsert: true, new: true })
    res.json(doc.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/monthly', async (req, res) => {
  try {
    const doc = await KVStore.findById('monthly-cf')
    res.json(doc ? doc.data : [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/monthly', async (req, res) => {
  try {
    const doc = await KVStore.findByIdAndUpdate('monthly-cf', { data: req.body }, { upsert: true, new: true })
    res.json(doc.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
