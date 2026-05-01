import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Attach auth token to every request
api.interceptors.request.use(config => {
  try {
    const stored = localStorage.getItem('linkrad_auth')
    if (stored) {
      const { token } = JSON.parse(stored)
      config.headers['Authorization'] = `Bearer ${token}`
    }
  } catch {}
  return config
})

// On 401, clear stale session and reload to login screen
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('linkrad_auth')
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

export const loginUser  = (username, password) => api.post('/auth/login', { username, password }).then(r => r.data)
export const logoutUser = () => api.post('/auth/logout').then(r => r.data)

export const getDashboardToday  = () => api.get('/dashboard/today').then(r => r.data)
export const getDashboardExtras = () => api.get('/dashboard/extras').then(r => r.data)

export const getSites = () => api.get('/sites').then(r => r.data)
export const updateSites = (data) => api.put('/sites', data).then(r => r.data)

export const getAnnualPL = () => api.get('/pl/annual').then(r => r.data)
export const updateAnnualPL = (data) => api.put('/pl/annual', data).then(r => r.data)

export const getMonthlyPL = () => api.get('/pl/monthly').then(r => r.data)
export const updateMonthlyPL = (data) => api.put('/pl/monthly', data).then(r => r.data)

export const getAnnualCF = () => api.get('/cf/annual').then(r => r.data)
export const updateAnnualCF = (data) => api.put('/cf/annual', data).then(r => r.data)

export const getMonthlyCF = () => api.get('/cf/monthly').then(r => r.data)
export const updateMonthlyCF = (data) => api.put('/cf/monthly', data).then(r => r.data)

export const getBS = () => api.get('/bs').then(r => r.data)
export const updateBS = (data) => api.put('/bs', data).then(r => r.data)

export const getBreakeven = () => api.get('/breakeven').then(r => r.data)
export const updateBreakeven = (data) => api.put('/breakeven', data).then(r => r.data)

export const getActuals = () => api.get('/actuals').then(r => r.data)
export const saveActual = (key, data) => api.put(`/actuals/${key}`, data).then(r => r.data)
export const deleteActual = (key) => api.delete(`/actuals/${key}`).then(r => r.data)

export const getCRM  = () => api.get('/crm').then(r => r.data)
export const saveCRM = (data) => api.put('/crm', data).then(r => r.data)

export const getTasks       = () => api.get('/tasks').then(r => r.data)
export const createTask     = (data) => api.post('/tasks', data).then(r => r.data)
export const updateTask     = (id, data) => api.put(`/tasks/${id}`, data).then(r => r.data)
export const addComment     = (id, text) => api.post(`/tasks/${id}/comments`, { text }).then(r => r.data)
export const deleteTask     = (id) => api.delete(`/tasks/${id}`).then(r => r.data)

export const getWorkCategories  = () => api.get('/work-categories').then(r => r.data)
export const saveWorkCategories = (data) => api.put('/work-categories', data).then(r => r.data)

export const getKPI  = () => api.get('/kpi').then(r => r.data)
export const saveKPI = (data) => api.put('/kpi', data).then(r => r.data)

export const getMarketing  = () => api.get('/marketing').then(r => r.data)
export const saveMarketing = (data) => api.put('/marketing', data).then(r => r.data)

// Billing
export const getInvoices = (params) => api.get('/billing/invoices', { params }).then(r => r.data)
export const getInvoice = (id) => api.get(`/billing/invoices/${id}`).then(r => r.data)
export const createInvoice = (data) => api.post('/billing/invoices', data).then(r => r.data)
export const updateInvoice = (id, data) => api.put(`/billing/invoices/${id}`, data).then(r => r.data)
export const payInvoice = (id, data) => api.post(`/billing/invoices/${id}/pay`, data).then(r => r.data)
export const cancelInvoice = (id, data) => api.post(`/billing/invoices/${id}/cancel`, data).then(r => r.data)
export const refundInvoice = (id, data) => api.post(`/billing/invoices/${id}/refund`, data).then(r => r.data)
export const getRevenueReport = (params) => api.get('/billing/revenue-report', { params }).then(r => r.data)
export const getDailyClose = (params) => api.get('/billing/daily-close', { params }).then(r => r.data)

// Promotions
export const getPromotions = (params) => api.get('/promotions', { params }).then(r => r.data)
export const getActivePromotions = () => api.get('/promotions/active').then(r => r.data)
export const createPromotion = (data) => api.post('/promotions', data).then(r => r.data)
export const updatePromotion = (id, data) => api.put(`/promotions/${id}`, data).then(r => r.data)
export const generatePromoCodes = (id, data) => api.post(`/promotions/${id}/codes/generate`, data).then(r => r.data)
export const getPromoCodes = (id) => api.get(`/promotions/${id}/codes`).then(r => r.data)
export const validatePromoCode = (data) => api.post('/promotions/validate', data).then(r => r.data)
export const applyPromoCode = (data) => api.post('/promotions/apply', data).then(r => r.data)

// Catalogs
export const getServiceTypes = (params) => api.get('/catalogs/service-types', { params }).then(r => r.data)
export const createServiceType = (data) => api.post('/catalogs/service-types', data).then(r => r.data)
export const updateServiceType = (id, data) => api.put(`/catalogs/service-types/${id}`, data).then(r => r.data)
export const getServices = (params) => api.get('/catalogs/services', { params }).then(r => r.data)
export const getPublicServices = () => api.get('/catalogs/services/public').then(r => r.data)
export const createService = (data) => api.post('/catalogs/services', data).then(r => r.data)
export const updateService = (id, data) => api.put(`/catalogs/services/${id}`, data).then(r => r.data)
export const getSpecialties = (params) => api.get('/catalogs/specialties', { params }).then(r => r.data)
export const createSpecialty = (data) => api.post('/catalogs/specialties', data).then(r => r.data)
export const updateSpecialty = (id, data) => api.put(`/catalogs/specialties/${id}`, data).then(r => r.data)

// Inventory
export const getSuppliers = (params) => api.get('/inventory/suppliers', { params }).then(r => r.data)
export const createSupplier = (data) => api.post('/inventory/suppliers', data).then(r => r.data)
export const updateSupplier = (id, data) => api.put(`/inventory/suppliers/${id}`, data).then(r => r.data)
export const getSupplyCategories = () => api.get('/inventory/categories').then(r => r.data)
export const getSupplies = (params) => api.get('/inventory/supplies', { params }).then(r => r.data)
export const createSupply = (data) => api.post('/inventory/supplies', data).then(r => r.data)
export const updateSupply = (id, data) => api.put(`/inventory/supplies/${id}`, data).then(r => r.data)
export const getInventoryTransactions = (params) => api.get('/inventory/transactions', { params }).then(r => r.data)
export const createInventoryTransaction = (data) => api.post('/inventory/transactions', data).then(r => r.data)
export const confirmInventoryTransaction = (id) => api.put(`/inventory/transactions/${id}/confirm`).then(r => r.data)
export const getStockReport = (params) => api.get('/inventory/reports/stock', { params }).then(r => r.data)
export const getStockCard = (supplyId) => api.get(`/inventory/reports/card/${supplyId}`).then(r => r.data)

export default api
