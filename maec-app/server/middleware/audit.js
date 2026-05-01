const AuditLog = require('../models/AuditLog')
const { verify } = require('../routes/auth')

// Routes/methods that should NEVER be audited (high-frequency reads, sensitive)
const SKIP_PATTERNS = [
  /^\/api\/auth\/(login|verify)/,
  /^\/api\/dashboard\/today/,         // polled frequently
  /^\/api\/notifications/,            // polled
  /^\/api\/audit-log/,                // don't audit the audit viewer
]

// Sanitize sensitive fields out of req.body before persisting
const REDACT_KEYS = new Set(['password', 'oldPassword', 'newPassword', 'token', 'apiKey', 'secret'])
function sanitize(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return obj
  if (Array.isArray(obj)) return obj.slice(0, 50).map(v => sanitize(v, depth + 1))
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_KEYS.has(k)) out[k] = '***'
    else if (typeof v === 'string' && v.length > 1000) out[k] = v.slice(0, 1000) + '…(truncated)'
    else out[k] = sanitize(v, depth + 1)
  }
  return out
}

// Derive friendly resource name from path: "/api/billing/invoices/123" → "billing"
function resourceFromPath(p) {
  const m = (p || '').match(/^\/api\/([^/?]+)/)
  return m ? m[1] : 'unknown'
}

function auditMiddleware(req, res, next) {
  // Only capture writes
  if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') return next()
  if (SKIP_PATTERNS.some(re => re.test(req.path))) return next()

  // Resolve user (best-effort — don't block if missing)
  const token = (req.headers['authorization'] || '').replace('Bearer ', '')
  const session = token ? verify(token) : null

  // Capture response status by hooking res.send
  const origSend = res.send.bind(res)
  res.send = function (body) {
    try {
      const log = new AuditLog({
        ts:         new Date().toISOString(),
        userId:     session?.username || '',
        username:   session?.username || '',
        role:       session?.role || '',
        method:     req.method,
        path:       req.originalUrl || req.url || '',
        resource:   resourceFromPath(req.path),
        resourceId: req.params?.id || '',
        status:     res.statusCode,
        ip:         (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().slice(0, 64),
        userAgent:  (req.headers['user-agent'] || '').slice(0, 200),
        payload:    sanitize(req.body),
      })
      // fire-and-forget; never block the response
      log.save().catch(err => console.warn('[audit] save failed:', err.message))
    } catch (e) { /* swallow */ }
    return origSend(body)
  }
  next()
}

module.exports = { auditMiddleware }
