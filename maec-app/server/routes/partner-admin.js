const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const { requireAuth, requirePermission } = require('../middleware/auth')
const managePartners = requirePermission('partners.manage')
const PartnerAccount = require('../models/PartnerAccount')
const PartnerFacility = require('../models/PartnerFacility')
const PartnerReferral = require('../models/PartnerReferral')
const Patient = require('../models/Patient')
const Appointment = require('../models/Appointment')
const Encounter = require('../models/Encounter')

const now = () => new Date().toISOString()

// ── Admin: list partner accounts ────────────────────────
router.get('/accounts', managePartners, async (req, res) => {
  try {
    const accounts = await PartnerAccount.find({}).select('-password').sort({ createdAt: -1 }).lean()
    res.json(accounts)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Admin: create partner account ───────────────────────
router.post('/accounts', managePartners, async (req, res) => {
  try {
    const { username, password, facilityId, displayName, email, phone, commissionGroupId } = req.body
    if (!username || !password || !facilityId) {
      return res.status(400).json({ error: 'username, password, facilityId required' })
    }

    const account = await PartnerAccount.findOneAndUpdate(
      { username },
      {
        $setOnInsert: { _id: crypto.randomUUID(), createdAt: now() },
        $set: { username, password, facilityId, displayName: displayName || username, email: email || '', phone: phone || '', commissionGroupId: commissionGroupId || '', status: 'active', updatedAt: now() },
      },
      { upsert: true, new: true }
    )
    res.json({ ok: true, account: { ...account.toObject(), password: undefined } })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Admin: update partner account ───────────────────────
router.put('/accounts/:id', managePartners, async (req, res) => {
  try {
    const { displayName, email, phone, commissionGroupId, status, password } = req.body
    const update = { updatedAt: now() }
    if (displayName !== undefined) update.displayName = displayName
    if (email !== undefined) update.email = email
    if (phone !== undefined) update.phone = phone
    if (commissionGroupId !== undefined) update.commissionGroupId = commissionGroupId
    if (status !== undefined) update.status = status
    if (password) update.password = password

    const account = await PartnerAccount.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password')
    if (!account) return res.status(404).json({ error: 'Không tìm thấy tài khoản' })
    res.json({ ok: true, account })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Staff: list referrals (enriched with facility + partner name) ──
router.get('/referrals', requireAuth, async (req, res) => {
  try {
    const { status } = req.query
    const filter = {}
    if (status) filter.status = status
    const referrals = await PartnerReferral.find(filter).sort({ createdAt: -1 }).lean()

    const facilityIds = [...new Set(referrals.map(r => r.facilityId).filter(Boolean))]
    const accountIds = [...new Set(referrals.map(r => r.partnerAccountId).filter(Boolean))]
    const [facilities, accounts] = await Promise.all([
      PartnerFacility.find({ _id: { $in: facilityIds } }).lean(),
      PartnerAccount.find({ _id: { $in: accountIds } }).select('-password').lean(),
    ])
    const facilityMap = {}; for (const f of facilities) facilityMap[f._id] = f
    const accountMap = {}; for (const a of accounts) accountMap[a._id] = a

    const enriched = referrals.map(r => ({
      ...r,
      facilityName: facilityMap[r.facilityId]?.name || '',
      partnerDisplayName: accountMap[r.partnerAccountId]?.displayName || '',
    }))
    res.json(enriched)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Staff: pending-count (for sidebar badge) ────────────
router.get('/referrals/pending-count', requireAuth, async (req, res) => {
  try {
    const count = await PartnerReferral.countDocuments({ status: 'pending' })
    res.json({ count })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Staff: single referral (used by Registration to show source) ──
router.get('/referrals/:id', requireAuth, async (req, res) => {
  try {
    const referral = await PartnerReferral.findById(req.params.id).lean()
    if (!referral) return res.status(404).json({ error: 'Không tìm thấy chuyển gửi' })
    const [facility, account] = await Promise.all([
      referral.facilityId ? PartnerFacility.findById(referral.facilityId).lean() : null,
      referral.partnerAccountId ? PartnerAccount.findById(referral.partnerAccountId).select('-password').lean() : null,
    ])
    res.json({ ...referral, facilityName: facility?.name || '', partnerDisplayName: account?.displayName || '' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Staff: accept referral → create scheduled appointment ─────────
// Body: { scheduledAt (ISO, required), site?, modality?, room?, duration? }
// Patient is created as a shell record; full Đăng ký happens when patient arrives.
router.put('/referrals/:id/accept', requireAuth, async (req, res) => {
  try {
    const referral = await PartnerReferral.findById(req.params.id)
    if (!referral) return res.status(404).json({ error: 'Không tìm thấy chuyển gửi' })
    if (referral.status !== 'pending') {
      return res.status(400).json({ error: 'Chỉ có thể chấp nhận chuyển gửi đang chờ' })
    }

    const { scheduledAt, site, modality, room, duration } = req.body || {}
    if (!scheduledAt) {
      return res.status(400).json({ error: 'Vui lòng chọn ngày giờ hẹn' })
    }

    // Resolve facility + partner for source attribution on the appointment
    const [facility, partnerAccount] = await Promise.all([
      referral.facilityId ? PartnerFacility.findById(referral.facilityId).lean() : null,
      referral.partnerAccountId ? PartnerAccount.findById(referral.partnerAccountId).select('-password').lean() : null,
    ])

    // Find or create patient by phone (shell record — details confirmed at Đăng ký)
    let patient = await Patient.findOne({ phone: referral.patientPhone }).lean()
    if (!patient) {
      const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
      const newPatient = new Patient({
        _id: crypto.randomUUID(),
        patientId: `BN-${d}-${seq}`,
        name: referral.patientName,
        phone: referral.patientPhone,
        dob: referral.patientDob || '',
        gender: referral.patientGender || 'other',
        idCard: referral.patientIdCard || '',
        registeredSite: site || referral.site,
        createdAt: now(), updatedAt: now(),
      })
      await newPatient.save()
      patient = newPatient.toObject()
    }

    const apt = new Appointment({
      _id: `APT-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      patientId: patient._id,
      patientName: referral.patientName,
      dob: referral.patientDob || patient.dob || '',
      gender: referral.patientGender || patient.gender || 'other',
      phone: referral.patientPhone,
      site: site || referral.site,
      modality: modality || referral.modality || 'US',
      room: room || '',
      scheduledAt,
      duration: duration || 30,
      status: 'scheduled',
      referringDoctor: partnerAccount?.displayName || '',
      referralType: 'facility',
      referralId: referral.facilityId || '',
      referralName: facility?.name || '',
      clinicalInfo: referral.clinicalInfo || '',
      notes: [referral.notes || '', `Chuyển gửi từ đối tác - Ref: ${referral._id}`].filter(Boolean).join(' — '),
      createdBy: req.user.username,
      createdAt: now(), updatedAt: now(),
    })
    await apt.save()

    referral.status = 'appointment_created'
    referral.appointmentId = apt._id
    referral.patientId = patient._id
    referral.updatedAt = now()
    await referral.save()

    res.json({ ok: true, referral: referral.toObject(), appointment: apt.toObject() })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Staff: reject referral ──────────────────────────────
// Body: { reason? }
router.put('/referrals/:id/reject', requireAuth, async (req, res) => {
  try {
    const referral = await PartnerReferral.findById(req.params.id)
    if (!referral) return res.status(404).json({ error: 'Không tìm thấy chuyển gửi' })
    if (referral.status !== 'pending') {
      return res.status(400).json({ error: 'Chỉ có thể từ chối chuyển gửi đang chờ' })
    }
    const { reason } = req.body || {}
    referral.status = 'cancelled'
    referral.notes = [referral.notes, reason ? `[Từ chối] ${reason}` : ''].filter(Boolean).join(' — ')
    referral.updatedAt = now()
    await referral.save()
    res.json({ ok: true, referral: referral.toObject() })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
