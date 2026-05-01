import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PL from './pages/PL'
import CF from './pages/CF'
import BalanceSheet from './pages/BalanceSheet'
import Breakeven from './pages/Breakeven'
import SiteList from './pages/SiteList'
import Actuals from './pages/Actuals'
import Workflow from './pages/Workflow'
import RIS from './pages/RIS'
import Registration from './pages/Registration'
import CRM from './pages/CRM'
import KPISales from './pages/KPISales'
import Marketing from './pages/Marketing'
import Billing from './pages/Billing'
import Inventory from './pages/Inventory'
import Catalogs from './pages/Catalogs'
import BookingForm from './pages/BookingForm'
import PatientLogin from './pages/PatientLogin'
import PatientPortal from './pages/PatientPortal'
import PartnerLogin from './pages/PartnerLogin'
import PartnerPortal from './pages/PartnerPortal'
import HRManagement from './pages/HRManagement'
import Reports from './pages/Reports'
import RadiologyReports from './pages/RadiologyReports'
import TodayDashboard from './pages/TodayDashboard'
import DashboardClinical from './pages/DashboardClinical'
import DashboardOps from './pages/DashboardOps'
import DashboardFinance from './pages/DashboardFinance'
import CriticalFindings from './pages/CriticalFindings'
import AuditLog from './pages/AuditLog'
import ReportTemplates from './pages/ReportTemplates'

function AuthenticatedRoutes() {
  const { auth } = useAuth()

  if (!auth) return <Login />

  const isWorkflowUser = auth.role && auth.role !== 'guest'
  const isRISUser = auth.role && auth.role !== 'guest'

  return (
    <Routes>
      {/* All routes wrapped in Layout */}
      <Route path="*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            {auth.role === 'admin' && <Route path="/actuals" element={<Actuals />} />}
            {isWorkflowUser && <Route path="/workflow" element={<Workflow />} />}
            {isRISUser && <Route path="/ris" element={<RIS />} />}
            {isWorkflowUser && <Route path="/registration" element={<Registration />} />}
            {isWorkflowUser && <Route path="/billing" element={<Billing />} />}

            {isWorkflowUser && <Route path="/inventory" element={<Inventory />} />}
            {isWorkflowUser && <Route path="/catalogs" element={<Catalogs />} />}
            {isWorkflowUser && <Route path="/catalogs/:catalogKey" element={<Catalogs />} />}
            {isWorkflowUser && <Route path="/reports" element={<Reports />} />}
            {isWorkflowUser && <Route path="/reports/:reportKey" element={<Reports />} />}
            {/* R1 2026-04-24: Báo cáo consolidated — old /rad-reports/* and
                 /dashboard/{clinical,ops,finance} redirect into the new tree.
                 The 15 legacy rad/business report sub-keys map to the two
                 unified reports; users arriving from bookmarks land on the
                 right group and can pick their dimension from the in-page
                 group-by picker. */}
            {isWorkflowUser && <Route path="/rad-reports" element={<Navigate to="/reports/ca-chup-doc" replace />} />}
            {isWorkflowUser && <Route path="/rad-reports/:reportKey" element={<Navigate to="/reports/ca-chup-doc" replace />} />}
            {isWorkflowUser && <Route path="/dashboard/clinical" element={<Navigate to="/reports/lam-sang-overview" replace />} />}
            {isWorkflowUser && <Route path="/dashboard/ops" element={<Navigate to="/reports/van-hanh-overview" replace />} />}
            {(auth.role === 'admin' || auth.role === 'giamdoc') && <Route path="/dashboard/finance" element={<Navigate to="/reports/tai-chinh-overview" replace />} />}
            {isWorkflowUser && <Route path="/today" element={<TodayDashboard />} />}
            {/* MWL + Critical findings now live as tabs inside /ris.
                Old standalone routes redirect for backward compatibility (search/links). */}
            {isWorkflowUser && <Route path="/critical-findings" element={<Navigate to="/ris?view=critical" replace />} />}
            {isWorkflowUser && <Route path="/mwl" element={<Navigate to="/ris?view=mwl" replace />} />}
            {(auth.role === 'admin' || auth.role === 'giamdoc') && <Route path="/audit-log" element={<AuditLog />} />}
            {isRISUser && <Route path="/report-templates" element={<ReportTemplates />} />}
            {auth.role === 'admin' && <Route path="/hr" element={<HRManagement />} />}
            {auth.role === 'admin' && <Route path="/hr/:hrKey" element={<HRManagement />} />}
            <Route path="/pl" element={<PL />} />
            <Route path="/cf" element={<CF />} />
            <Route path="/bs" element={<BalanceSheet />} />
            <Route path="/breakeven" element={<Breakeven />} />
            <Route path="/sites" element={<SiteList />} />
            <Route path="/crm" element={<CRM />} />
            <Route path="/kpi-sales" element={<KPISales />} />
            <Route path="/marketing" element={<Marketing />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  )
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes - no auth required */}
      <Route path="/booking" element={<BookingForm />} />
      <Route path="/patient-login" element={<PatientLogin />} />
      <Route path="/patient-portal" element={<PatientPortal />} />
      <Route path="/partner-login" element={<PartnerLogin />} />
      <Route path="/partner-portal" element={<PartnerPortal />} />
      {/* All other routes require auth */}
      <Route path="/*" element={<AuthenticatedRoutes />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
