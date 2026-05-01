const express = require('express')
const crypto = require('crypto')
const router = express.Router()
const Promotion = require('../models/Promotion')
const PromoCode = require('../models/PromoCode')
const { requireAuth, requirePermission } = require('../middleware/auth')
const manageCatalogs = requirePermission('catalogs.manage')

const now = () => new Date().toISOString()
const today = () => now().slice(0, 10)

// ── List promotions ──────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.status) filter.status = req.query.status
    if (req.query.q) filter.name = { $regex: req.query.q, $options: 'i' }
    const promotions = await Promotion.find(filter).sort({ createdAt: -1 }).lean()
    res.json(promotions)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Get active promotions (for billing dropdown) ─────────
router.get('/active', requireAuth, async (req, res) => {
  try {
    const d = today()
    const promotions = await Promotion.find({
      status: 'active',
      $or: [
        { startDate: { $exists: false } },
        { startDate: '' },
        { startDate: { $lte: d } },
      ],
    }).lean()
    // Filter out expired by endDate
    const valid = promotions.filter(p => !p.endDate || p.endDate >= d)
    // Filter out maxed usage
    const available = valid.filter(p => !p.maxUsageTotal || p.currentUsage < p.maxUsageTotal)
    res.json(available)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Create promotion ─────────────────────────────────────
router.post('/', manageCatalogs, async (req, res) => {
  try {
    const { code, name, description, type, discountValue, maxDiscountAmount,
      applicableServiceTypes, applicableServiceIds, applicableSites,
      minOrderAmount, startDate, endDate, maxUsageTotal, maxUsagePerPatient } = req.body
    if (!name) return res.status(400).json({ error: 'Tên chương trình là bắt buộc' })

    const promo = new Promotion({
      _id: `PROMO-${Date.now()}`,
      code: code || `KM-${Date.now().toString().slice(-6)}`,
      name, description,
      type: type || 'percentage',
      discountValue: discountValue || 0,
      maxDiscountAmount: maxDiscountAmount || 0,
      applicableServiceTypes: applicableServiceTypes || [],
      applicableServiceIds: applicableServiceIds || [],
      applicableSites: applicableSites || [],
      minOrderAmount: minOrderAmount || 0,
      startDate: startDate || '',
      endDate: endDate || '',
      maxUsageTotal: maxUsageTotal || 0,
      maxUsagePerPatient: maxUsagePerPatient || 0,
      currentUsage: 0,
      status: 'active',
      createdBy: req.user.username,
      createdAt: now(), updatedAt: now(),
    })
    await promo.save()
    res.status(201).json(promo)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Update promotion ─────────────────────────────────────
router.put('/:id', manageCatalogs, async (req, res) => {
  try {
    const update = { ...req.body, updatedAt: now() }
    delete update._id
    delete update.currentUsage
    const promo = await Promotion.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!promo) return res.status(404).json({ error: 'Không tìm thấy chương trình' })
    res.json(promo)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Generate promo codes ─────────────────────────────────
router.post('/:id/codes/generate', manageCatalogs, async (req, res) => {
  try {
    const promo = await Promotion.findById(req.params.id).lean()
    if (!promo) return res.status(404).json({ error: 'Không tìm thấy chương trình' })

    const { count = 1, prefix = '', maxUsage = 1 } = req.body
    const codes = []
    for (let i = 0; i < Math.min(count, 100); i++) {
      const codeStr = `${prefix}${crypto.randomUUID().slice(0, 8).toUpperCase()}`
      const pc = new PromoCode({
        _id: `PC-${Date.now()}-${i}`,
        code: codeStr,
        promotionId: promo._id,
        promotionName: promo.name,
        maxUsage,
        status: 'active',
        createdAt: now(), updatedAt: now(),
      })
      await pc.save()
      codes.push(pc)
    }
    res.status(201).json(codes)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── List codes for a promotion ───────────────────────────
router.get('/:id/codes', requireAuth, async (req, res) => {
  try {
    const codes = await PromoCode.find({ promotionId: req.params.id }).sort({ createdAt: -1 }).lean()
    res.json(codes)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Validate a promo code (for billing) ──────────────────
router.post('/validate', requireAuth, async (req, res) => {
  try {
    const { code, totalAmount, site } = req.body
    if (!code) return res.status(400).json({ error: 'Vui lòng nhập mã giảm giá' })

    const pc = await PromoCode.findOne({ code: code.toUpperCase(), status: 'active' }).lean()
    if (!pc) return res.status(404).json({ error: 'Mã giảm giá không hợp lệ hoặc đã hết hạn' })
    if (pc.maxUsage && pc.usedCount >= pc.maxUsage) {
      return res.status(400).json({ error: 'Mã giảm giá đã được sử dụng hết' })
    }

    const promo = await Promotion.findById(pc.promotionId).lean()
    if (!promo || promo.status !== 'active') {
      return res.status(400).json({ error: 'Chương trình giảm giá không còn hiệu lực' })
    }

    const d = today()
    if (promo.startDate && promo.startDate > d) return res.status(400).json({ error: 'Chương trình chưa bắt đầu' })
    if (promo.endDate && promo.endDate < d) return res.status(400).json({ error: 'Chương trình đã hết hạn' })
    if (promo.maxUsageTotal && promo.currentUsage >= promo.maxUsageTotal) {
      return res.status(400).json({ error: 'Chương trình đã hết lượt sử dụng' })
    }
    if (promo.minOrderAmount && totalAmount < promo.minOrderAmount) {
      return res.status(400).json({ error: `Đơn hàng tối thiểu ${promo.minOrderAmount.toLocaleString('vi-VN')} VND` })
    }
    if (promo.applicableSites?.length > 0 && site && !promo.applicableSites.includes(site)) {
      return res.status(400).json({ error: 'Chương trình không áp dụng tại chi nhánh này' })
    }

    // Calculate discount
    let discountAmount = 0
    if (promo.type === 'percentage') {
      discountAmount = Math.round((totalAmount || 0) * promo.discountValue / 100)
      if (promo.maxDiscountAmount && discountAmount > promo.maxDiscountAmount) {
        discountAmount = promo.maxDiscountAmount
      }
    } else {
      discountAmount = promo.discountValue
    }

    res.json({
      valid: true,
      promotion: { _id: promo._id, name: promo.name, type: promo.type, discountValue: promo.discountValue },
      promoCode: { _id: pc._id, code: pc.code },
      discountAmount,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Apply promo code (increment usage) ───────────────────
router.post('/apply', requireAuth, async (req, res) => {
  try {
    const { promoCodeId, promotionId } = req.body
    if (promoCodeId) {
      await PromoCode.findByIdAndUpdate(promoCodeId, { $inc: { usedCount: 1 }, updatedAt: now() })
    }
    if (promotionId) {
      await Promotion.findByIdAndUpdate(promotionId, { $inc: { currentUsage: 1 }, updatedAt: now() })
    }
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
