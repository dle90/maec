// Deterministic red-flag gate.
//
// Each red-flag rule's trigger is checked against the structured complaint.
// All matched rules are returned — there is no narrowing here, and a rule once
// triggered never gets removed except by an explicit clinician exclusion.
//
// Matching is intentionally permissive on missing data: if the user didn't
// specify e.g. `redness`, qualifier checks for redness are skipped (treated as
// unknown rather than "no"). The cost of over-triggering a red-flag is small;
// the cost of missing one is catastrophic.

const DxRedFlag = require('../models/DxRedFlag')

const ORDINAL_SCALES = {
  pain: ['none', 'mild', 'moderate', 'severe'],
  redness: ['none', 'mild', 'moderate', 'severe'],
  onset: ['gradual', 'subacute', 'sudden'],
  visionChange: ['none', 'mild', 'severe', 'lost'],
}

function ordinalAtLeast(field, complaintValue, requiredMin) {
  const scale = ORDINAL_SCALES[field]
  if (!scale) return complaintValue === requiredMin
  const ci = scale.indexOf(complaintValue)
  const ri = scale.indexOf(requiredMin)
  if (ci < 0 || ri < 0) return false
  return ci >= ri
}

function matchQualifier(field, complaintValue, ruleValue) {
  if (typeof ruleValue === 'string') {
    if (ruleValue.endsWith('_or_worse')) {
      return ordinalAtLeast(field, complaintValue, ruleValue.replace('_or_worse', ''))
    }
    return complaintValue === ruleValue
  }
  if (ruleValue && typeof ruleValue === 'object') {
    if (ruleValue.min) return ordinalAtLeast(field, complaintValue, ruleValue.min)
    if (Array.isArray(ruleValue.anyOf)) return ruleValue.anyOf.includes(complaintValue)
  }
  return false
}

function matchPatientContext(ctx, rule) {
  for (const [key, expected] of Object.entries(rule || {})) {
    if (key.endsWith('OrUnknown')) {
      const baseKey = key.replace(/OrUnknown$/, '')
      const ctxValue = ctx?.[baseKey]
      if (ctxValue === undefined || ctxValue === null) continue
      if (ctxValue !== expected) return false
    } else if (key === 'ageMaxYears') {
      const age = ctx?.ageYears
      if (age === undefined || age === null) continue
      if (age > expected) return false
    } else if (key === 'ageMinYears') {
      const age = ctx?.ageYears
      if (age === undefined || age === null) continue
      if (age < expected) return false
    } else {
      const ctxValue = ctx?.[key]
      if (ctxValue === undefined || ctxValue === null) continue
      if (ctxValue !== expected) return false
    }
  }
  return true
}

function matchRedFlag(complaint, rule) {
  const trigger = rule.trigger || {}
  const symptoms = new Set(complaint.symptoms || [])

  for (const tag of trigger.hasAllSymptoms || []) {
    if (!symptoms.has(tag)) return null
  }
  if ((trigger.hasAnySymptoms || []).length > 0) {
    if (!trigger.hasAnySymptoms.some(tag => symptoms.has(tag))) return null
  }

  for (const [field, ruleValue] of Object.entries(trigger.qualifiers || {})) {
    const cValue = complaint[field]
    if (cValue === undefined || cValue === null || cValue === 'unknown') continue
    if (!matchQualifier(field, cValue, ruleValue)) return null
  }

  if (!matchPatientContext(complaint.patientContext, trigger.patientContext || {})) {
    return null
  }

  return {
    redFlagId: rule._id,
    name: rule.name,
    nameVi: rule.nameVi,
    urgency: rule.urgency,
    services: rule.services,
    candidateDiseases: rule.candidateDiseases || [],
    actionGuidance: rule.actionGuidance,
    actionGuidanceEn: rule.actionGuidanceEn,
    matchedBy: {
      symptoms: trigger.hasAllSymptoms || [],
      qualifiers: trigger.qualifiers || {},
    },
    triggeredAt: new Date().toISOString(),
  }
}

async function runRedFlagGate(complaint) {
  const rules = await DxRedFlag.find({}).lean()
  const matches = []
  for (const rule of rules) {
    const m = matchRedFlag(complaint, rule)
    if (m) matches.push(m)
  }
  // Stable ordering: emergency before urgent_referral before urgent.
  const URGENCY_ORDER = { emergency: 0, urgent_referral: 1, urgent: 2 }
  matches.sort((a, b) => {
    const ra = URGENCY_ORDER[a.urgency] ?? 9
    const rb = URGENCY_ORDER[b.urgency] ?? 9
    return ra - rb
  })
  return matches
}

module.exports = { runRedFlagGate, matchRedFlag }
