// Timezone-aware date helpers. The clinic operates in Asia/Ho_Chi_Minh (UTC+7,
// no DST), but the server may run anywhere (Railway picks an arbitrary host).
// Without these helpers, "today" filters use UTC and silently drift 7 hours
// out of sync — every day from UTC midnight (~7am local) until local midnight
// the day's queries would diverge from cashier reality.
//
// Two flavours:
//   localDate()         → HCM-local YYYY-MM-DD for "today"
//   localDayStartUtcZ() → UTC ISO Z-string at HCM-local midnight, ready to
//                          drop into a Mongo $gte filter on a paidAt/createdAt
//                          string field
//   localDayEndUtcZ()   → same for end-of-day
//
// HCM = UTC+7 fixed (no DST). The +07:00 offset is hard-coded; revisit only
// if the clinic ever opens a branch in another timezone.

const TZ = 'Asia/Ho_Chi_Minh'

function localDate(d = new Date()) {
  // sv-SE locale gives ISO YYYY-MM-DD format.
  return d.toLocaleDateString('sv-SE', { timeZone: TZ })
}

function localDayStartUtcZ(localYmd) {
  // localYmd e.g. "2026-05-02"; build a Date at HCM midnight, then export
  // its UTC ISO. e.g. "2026-05-01T17:00:00.000Z".
  return new Date(`${localYmd}T00:00:00.000+07:00`).toISOString()
}

function localDayEndUtcZ(localYmd) {
  return new Date(`${localYmd}T23:59:59.999+07:00`).toISOString()
}

// Helper for "N days ago" / "N days ahead" anchored to local-today.
function addDaysLocal(localYmd, n) {
  const [y, m, d] = localYmd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

// First day of the local month containing `localYmd` (default: today).
function localMonthStart(localYmd = localDate()) {
  return localYmd.slice(0, 8) + '01'
}

// First day of the local year containing `localYmd` (default: today).
function localYearStart(localYmd = localDate()) {
  return localYmd.slice(0, 4) + '-01-01'
}

// Monday of the local week containing `localYmd` (default: today).
function localWeekStart(localYmd = localDate()) {
  const [y, m, d] = localYmd.split('-').map(Number)
  // Use UTC arithmetic to avoid host-tz double-shifting; the resulting Date's
  // weekday in UTC matches HCM's because HCM has no DST.
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() || 7 // 1 = Mon .. 7 = Sun
  if (dow !== 1) dt.setUTCDate(dt.getUTCDate() - (dow - 1))
  return dt.toISOString().slice(0, 10)
}

module.exports = {
  TZ,
  localDate,
  localDayStartUtcZ,
  localDayEndUtcZ,
  addDaysLocal,
  localMonthStart,
  localYearStart,
  localWeekStart,
}
