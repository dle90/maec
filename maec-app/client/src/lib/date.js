// Shared date formatting — Vietnamese dd/mm/yyyy display.
//
// Display only. Stored values and <input type="date"> stay YYYY-MM-DD —
// sorting, range filters, and HTML date inputs all depend on that format.

const pad = (n) => String(n).padStart(2, '0')

// Format a date as dd/mm/yyyy. Accepts an ISO string, a YYYY-MM-DD string,
// a Date, or an epoch number. Returns '' for empty; echoes unparseable input.
export function formatDate(value) {
  if (value == null || value === '') return ''
  const s = String(value)
  // Plain YYYY-MM-DD, or an ISO string starting with it — slice directly so a
  // date-only value never shifts across a timezone boundary.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return s
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

// Format as dd/mm/yyyy HH:MM.
export function formatDateTime(value) {
  if (value == null || value === '') return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return String(value)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
