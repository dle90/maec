const express = require('express')
const KVStore = require('../models/KVStore')

const router = express.Router()

router.get('/annual', async (req, res) => {
  try {
    const doc = await KVStore.findById('annual-pl')
    res.json(doc ? doc.data : [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/annual', async (req, res) => {
  try {
    const doc = await KVStore.findByIdAndUpdate('annual-pl', { data: req.body }, { upsert: true, new: true })
    res.json(doc.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/monthly', async (req, res) => {
  try {
    const doc = await KVStore.findById('monthly-pl')
    res.json(doc ? doc.data : [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/monthly', async (req, res) => {
  try {
    const doc = await KVStore.findByIdAndUpdate('monthly-pl', { data: req.body }, { upsert: true, new: true })
    res.json(doc.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
