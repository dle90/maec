const express = require('express')
const KVStore = require('../models/KVStore')

const router = express.Router()
const KEY = 'sites'

router.get('/', async (req, res) => {
  try {
    const doc = await KVStore.findById(KEY)
    res.json(doc ? doc.data : [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/', async (req, res) => {
  try {
    const doc = await KVStore.findByIdAndUpdate(KEY, { data: req.body }, { upsert: true, new: true })
    res.json(doc.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
