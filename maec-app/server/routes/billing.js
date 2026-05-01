const express = require('express')
const crypto = require('crypto')
const router = express.Router()
const Invoice = require('../models/Invoice')
const Payment = require('../models/Payment')
const Appointment = require('../models/Appointment')
const { requireAuth, requirePermission } = require('../middleware/auth')
const { resolveEffectiveSalesperson, nextInvoiceNumber } = require('../lib/invoicing')

const now = () => new Date().toISOString()
const today = () => now().slice(0, 10)

// ── List invoices ────────────────────────────────────────
router.get('/invoices', requireAuth, async (req, res) => {
  try {
    const { site, date, dateFrom, dateTo, status, patientId, q, limit = 50, skip = 0 } = req.query
    const filter = {}
    if (site) filter.site = site
    if (status) {
      if (status.includes(',')) {
        filter.status = { $in: status.split(',') }
      } else {
        filter.status = status
      }
    }
    if (patientId) filter.patientId = patientId
    if (date) filter.createdAt = { $regex: `^${date}` }
    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = dateFrom
      if (dateTo) filter.createdAt.$lte = dateTo + 'T23:59:59'
    }
    if (q) {
      filter.$or = [
        { patientName: { $regex: q, $options: 'i' } },
        { invoiceNumber: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ]
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(filter).sort({ createdAt: -1 }).skip(+skip).limit(+limit).lean(),
      Invoice.countDocuments(filter),
    ])
    res.json({ invoices, total })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Get single invoice with payments ─────────────────────
router.get('/invoices/:id', requireAuth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).lean()
    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' })
    const payments = await Payment.find({ invoiceId: req.params.id }).sort({ createdAt: -1 }).lean()
    res.json({ ...invoice, payments })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Create invoice ───────────────────────────────────────
router.post('/invoices', requireAuth, async (req, res) => {
  try {
    const { patientId, patientName, phone, appointmentId, site, items, notes, totalDiscount = 0 } = req.body
    if (!patientName || !items || items.length === 0) {
      return res.status(400).json({ error: 'Thiếu thông tin bệnh nhân hoặc dịch vụ' })
    }

    const subtotal = items.reduce((s, it) => s + (it.unitPrice * (it.quantity || 1)), 0)
    const totalTax = items.reduce((s, it) => s + (it.taxAmount || 0), 0)
    const grandTotal = subtotal - totalDiscount + totalTax

    // Snapshot referral attribution from the linked appointment (immutable after creation)
    let referral = {
      sourceCode: '', sourceName: '',
      referralType: '', referralId: '', referralName: '',
      effectiveSalespersonId: '', effectiveSalespersonName: '',
    }
    if (appointmentId) {
      const appt = await Appointment.findById(appointmentId).lean()
      if (appt) {
        const eff = await resolveEffectiveSalesperson(appt.referralType, appt.referralId)
        referral = {
          sourceCode: appt.sourceCode || '',
          sourceName: appt.sourceName || '',
          referralType: appt.referralType || '',
          referralId: appt.referralId || '',
          referralName: appt.referralName || '',
          effectiveSalespersonId: eff.id,
          effectiveSalespersonName: eff.name,
        }
      }
    }

    const invoice = new Invoice({
      _id: `INV-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      invoiceNumber: await nextInvoiceNumber(),
      patientId,
      patientName,
      phone,
      appointmentId,
      site: site || req.user.department,
      ...referral,
      items: items.map(it => ({
        serviceCode: it.serviceCode || '',
        serviceName: it.serviceName,
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice,
        discountAmount: it.discountAmount || 0,
        taxRate: it.taxRate || 0,
        taxAmount: it.taxAmount || 0,
        amount: it.unitPrice * (it.quantity || 1),
      })),
      subtotal,
      totalDiscount,
      totalTax,
      grandTotal,
      status: 'draft',
      createdBy: req.user.username,
      notes,
      createdAt: now(),
      updatedAt: now(),
    })
    await invoice.save()
    res.status(201).json(invoice)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Update invoice (adjust items, discount, notes) ───────
router.put('/invoices/:id', requireAuth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' })
    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      return res.status(400).json({ error: 'Không thể sửa hóa đơn đã thanh toán hoặc đã hủy' })
    }

    const { items, totalDiscount, notes } = req.body
    if (items) {
      invoice.items = items.map(it => ({
        serviceCode: it.serviceCode || '',
        serviceName: it.serviceName,
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice,
        discountAmount: it.discountAmount || 0,
        taxRate: it.taxRate || 0,
        taxAmount: it.taxAmount || 0,
        amount: it.unitPrice * (it.quantity || 1),
      }))
      invoice.subtotal = invoice.items.reduce((s, it) => s + it.amount, 0)
      invoice.totalTax = invoice.items.reduce((s, it) => s + it.taxAmount, 0)
    }
    if (totalDiscount !== undefined) invoice.totalDiscount = totalDiscount
    if (notes !== undefined) invoice.notes = notes
    invoice.grandTotal = invoice.subtotal - invoice.totalDiscount + invoice.totalTax
    invoice.updatedAt = now()
    await invoice.save()
    res.json(invoice)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Record payment ───────────────────────────────────────
router.post('/invoices/:id/pay', requireAuth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' })
    if (invoice.status === 'cancelled' || invoice.status === 'refunded') {
      return res.status(400).json({ error: 'Hóa đơn đã hủy hoặc đã hoàn tiền' })
    }

    const { amount, paymentMethod = 'cash', reference } = req.body
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Số tiền không hợp lệ' })

    const payment = new Payment({
      _id: `PAY-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      invoiceId: invoice._id,
      patientId: invoice.patientId,
      amount,
      paymentMethod,
      reference,
      receivedBy: req.user.username,
      receivedAt: now(),
      status: 'completed',
      createdAt: now(),
    })
    await payment.save()

    invoice.paidAmount += amount
    invoice.paymentMethod = paymentMethod
    if (invoice.paidAmount >= invoice.grandTotal) {
      invoice.status = 'paid'
      invoice.paidAt = now()
      invoice.changeAmount = invoice.paidAmount - invoice.grandTotal
    } else {
      invoice.status = 'partially_paid'
    }
    if (invoice.status !== 'issued' && invoice.status !== 'paid' && invoice.status !== 'partially_paid') {
      invoice.issuedAt = now()
    }
    invoice.cashierId = req.user.username
    invoice.updatedAt = now()
    await invoice.save()

    res.json({ invoice, payment })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Cancel invoice ───────────────────────────────────────
router.post('/invoices/:id/cancel', requireAuth, async (req, res) => {
  try {
    const { role } = req.user
    if (role !== 'admin' && role !== 'truongphong' && role !== 'giamdoc') {
      return res.status(403).json({ error: 'Không có quyền hủy hóa đơn' })
    }
    const invoice = await Invoice.findById(req.params.id)
    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' })
    if (invoice.status === 'cancelled') return res.status(400).json({ error: 'Hóa đơn đã bị hủy' })

    invoice.status = 'cancelled'
    invoice.cancelledAt = now()
    invoice.cancelReason = req.body.reason || ''
    invoice.updatedAt = now()
    await invoice.save()
    res.json(invoice)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Refund invoice ───────────────────────────────────────
router.post('/invoices/:id/refund', requireAuth, requirePermission('billing.refund'), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' })
    if (invoice.status !== 'paid' && invoice.status !== 'partially_paid') {
      return res.status(400).json({ error: 'Chỉ hoàn tiền hóa đơn đã thanh toán' })
    }

    // Mark all payments as refunded
    await Payment.updateMany(
      { invoiceId: invoice._id, status: 'completed' },
      { $set: { status: 'refunded', refundedAt: now(), refundReason: req.body.reason || '' } }
    )

    invoice.status = 'refunded'
    invoice.updatedAt = now()
    await invoice.save()
    res.json(invoice)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Revenue report ───────────────────────────────────────
router.get('/revenue-report', requireAuth, async (req, res) => {
  try {
    const { role } = req.user
    if (role !== 'admin' && role !== 'giamdoc' && role !== 'truongphong') {
      return res.status(403).json({ error: 'Không có quyền xem báo cáo' })
    }
    const { dateFrom, dateTo, site } = req.query
    const match = { status: { $in: ['paid', 'partially_paid'] } }
    if (site) match.site = site
    if (dateFrom || dateTo) {
      match.createdAt = {}
      if (dateFrom) match.createdAt.$gte = dateFrom
      if (dateTo) match.createdAt.$lte = dateTo + 'T23:59:59'
    }

    const invoices = await Invoice.find(match).lean()

    // Aggregate by date
    const byDate = {}
    const bySite = {}
    let totalRevenue = 0
    let totalInvoices = 0
    invoices.forEach(inv => {
      const d = (inv.createdAt || '').slice(0, 10)
      if (!byDate[d]) byDate[d] = { date: d, revenue: 0, count: 0 }
      byDate[d].revenue += inv.grandTotal
      byDate[d].count++
      if (!bySite[inv.site]) bySite[inv.site] = { site: inv.site, revenue: 0, count: 0 }
      bySite[inv.site].revenue += inv.grandTotal
      bySite[inv.site].count++
      totalRevenue += inv.grandTotal
      totalInvoices++
    })

    res.json({
      totalRevenue,
      totalInvoices,
      byDate: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
      bySite: Object.values(bySite).sort((a, b) => b.revenue - a.revenue),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Daily close report ───────────────────────────────────
router.get('/daily-close', requireAuth, async (req, res) => {
  try {
    const date = req.query.date || today()
    const match = { createdAt: { $regex: `^${date}` } }
    if (req.query.site) match.site = req.query.site

    const payments = await Payment.find({
      ...match,
      status: 'completed',
    }).lean()

    const byCash = payments.filter(p => p.paymentMethod === 'cash').reduce((s, p) => s + p.amount, 0)
    const byTransfer = payments.filter(p => p.paymentMethod === 'transfer').reduce((s, p) => s + p.amount, 0)
    const byCard = payments.filter(p => p.paymentMethod === 'card').reduce((s, p) => s + p.amount, 0)

    const invoices = await Invoice.find({
      createdAt: { $regex: `^${date}` },
      ...(req.query.site ? { site: req.query.site } : {}),
    }).lean()

    const totalIssued = invoices.length
    const totalPaid = invoices.filter(i => i.status === 'paid').length
    const totalCancelled = invoices.filter(i => i.status === 'cancelled').length

    res.json({
      date,
      totalCollected: byCash + byTransfer + byCard,
      byCash,
      byTransfer,
      byCard,
      paymentCount: payments.length,
      totalIssued,
      totalPaid,
      totalCancelled,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
