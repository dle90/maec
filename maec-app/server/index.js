const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const express = require('express')
const cors = require('cors')

require('./db') // Connect to MongoDB

const { router: authRouter } = require('./routes/auth')
const sitesRouter = require('./routes/sites')
const tasksRouter = require('./routes/tasks')
const risRouter = require('./routes/ris')
const encountersRouter = require('./routes/encounters')
const crmRouter = require('./routes/crm')
const registrationRouter = require('./routes/registration')
const workCatRouter = require('./routes/work-categories')
const kpiRouter = require('./routes/kpi')
const marketingRouter = require('./routes/marketing')
const billingRouter = require('./routes/billing')
const inventoryRouter = require('./routes/inventory')
const catalogsRouter = require('./routes/catalogs')
const bookingRouter = require('./routes/booking')
const appointmentsRouter = require('./routes/appointments')
const promotionsRouter = require('./routes/promotions')
const patientPortalRouter = require('./routes/patient-portal')
const partnerPortalRouter = require('./routes/partner-portal')
const partnerAdminRouter = require('./routes/partner-admin')
const hrRouter = require('./routes/hr')
const reportsRouter = require('./routes/reports')
const enhancementsRouter = require('./routes/enhancements')
const { requireAdmin } = require('./middleware/auth')
const { auditMiddleware } = require('./middleware/audit')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '20mb' }))

// Audit middleware: capture writes after body is parsed, before route handlers
app.use('/api', auditMiddleware)

// Auth routes (public — no token required)
app.use('/api/auth', authRouter)

// Middleware: protect PUT/DELETE across all /api routes
const guardWrites = (req, res, next) => {
  if (req.method === 'GET') return next()
  return requireAdmin(req, res, next)
}

app.use('/api/sites', guardWrites, sitesRouter)
// Tasks: auth handled inside the router per endpoint
app.use('/api/tasks', tasksRouter)
// RIS: auth handled inside the router per endpoint
app.use('/api/ris', risRouter)
// Encounters: clinical workflow APIs (assign package, save service result, bill items)
app.use('/api/encounters', encountersRouter)
app.use('/api/crm', guardWrites, crmRouter)
// Registration: auth handled inside the router per endpoint
app.use('/api/registration', registrationRouter)
// Work categories: auth handled inside the router per endpoint
app.use('/api/work-categories', workCatRouter)
// KPI: auth handled inside the router
app.use('/api/kpi', kpiRouter)
// Marketing: auth handled inside the router
app.use('/api/marketing', marketingRouter)
// Billing: auth handled inside the router
app.use('/api/billing', billingRouter)
// Inventory: auth handled inside the router
app.use('/api/inventory', inventoryRouter)
// Catalogs: auth handled inside the router (has one public endpoint)
app.use('/api/catalogs', catalogsRouter)
// Booking: public routes (no auth required)
app.use('/api/booking', bookingRouter)
// Appointments: ophth-shaped staff scheduling (Lịch hẹn tab)
app.use('/api/appointments', appointmentsRouter)
// Promotions: auth handled inside the router
app.use('/api/promotions', promotionsRouter)
// Portals: auth handled inside the routers
app.use('/api/patient-portal', patientPortalRouter)
app.use('/api/partner-portal', partnerPortalRouter)
app.use('/api/partner-admin', partnerAdminRouter)
// HR: auth handled inside the router
app.use('/api/hr', hrRouter)

app.use('/api/reports', reportsRouter)

// Templates, audit log, notifications, today dashboard, search, MWL
app.use('/api', enhancementsRouter)

// Serve React build in production
const clientDist = path.join(__dirname, '../client/dist')
app.use(express.static(clientDist))
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`MAEC server running on http://localhost:${PORT}`)
})
