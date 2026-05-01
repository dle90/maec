const Invoice = require('../models/Invoice')
const ReferralDoctor = require('../models/ReferralDoctor')
const PartnerFacility = require('../models/PartnerFacility')
const User = require('../models/User')

const now = () => new Date().toISOString()
const today = () => now().slice(0, 10)

// Resolve the NVKD who should be credited for a given referral.
// - salesperson referral → the NVKD directly
// - doctor/facility referral → the assignedStaff on that partner record
async function resolveEffectiveSalesperson(referralType, referralId) {
  if (!referralType || !referralId) return { id: '', name: '' }
  try {
    if (referralType === 'salesperson') {
      const u = await User.findById(referralId).select('_id displayName').lean()
      return { id: referralId, name: u?.displayName || referralId }
    }
    const partner = referralType === 'doctor'
      ? await ReferralDoctor.findById(referralId).select('assignedStaff').lean()
      : referralType === 'facility'
        ? await PartnerFacility.findById(referralId).select('assignedStaff').lean()
        : null
    const staffId = partner?.assignedStaff
    if (!staffId) return { id: '', name: '' }
    const u = await User.findById(staffId).select('_id displayName').lean()
    return { id: staffId, name: u?.displayName || staffId }
  } catch { return { id: '', name: '' } }
}

async function nextInvoiceNumber() {
  const d = today().replace(/-/g, '')
  const count = await Invoice.countDocuments({ invoiceNumber: { $regex: `^HD-${d}` } })
  return `HD-${d}-${String(count + 1).padStart(4, '0')}`
}

module.exports = { resolveEffectiveSalesperson, nextInvoiceNumber }
