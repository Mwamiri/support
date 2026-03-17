import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import SiteSettingsPage from './pages/SiteSettingsPage'
import Layout from './components/layout/Layout'
import { PageLoader } from './components/ui/index'

// ── PAGES ─────────────────────────────────────────────────────────────────────
import LoginPage        from './pages/LoginPage'
import DashboardPage    from './pages/DashboardPage'
import VisitsPage       from './pages/VisitsPage'
import VisitDetailPage  from './pages/VisitDetailPage'
import NewVisitPage     from './pages/NewVisitPage'
import TicketsPage      from './pages/TicketsPage'
import TicketDetailPage from './pages/TicketDetailPage'
import EquipmentPage    from './pages/EquipmentPage'
import CredentialsPage  from './pages/CredentialsPage'
import ReportsPage      from './pages/ReportsPage'
import ClientsPage      from './pages/ClientsPage'
import UsersPage        from './pages/UsersPage'
import ProfilePage      from './pages/ProfilePage'
import PluginsPage              from './pages/PluginsPage'
import TechnicianAccessPage    from './pages/TechnicianAccessPage'

// Client portal
import ClientDashboard  from './pages/client/ClientDashboard'
import ClientVisits     from './pages/client/ClientVisits'
import ClientTickets    from './pages/client/ClientTickets'
import NewTicketPage    from './pages/client/NewTicketPage'
import ClientReports    from './pages/client/ClientReports'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } }
})

function Guard({ children, roles }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function RoleRedirect() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'client' ? '/client' : '/dashboard'} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/"      element={<RoleRedirect />} />

            {/* ── STAFF PORTAL ── */}
            <Route element={
              <Guard roles={['super_admin','manager','technician']}>
                <Layout />
              </Guard>
            }>
              <Route path="/dashboard"   element={<DashboardPage />} />
              <Route path="/visits"      element={<VisitsPage />} />
              <Route path="/visits/new"  element={<NewVisitPage />} />
              <Route path="/visits/:id"  element={<VisitDetailPage />} />
              <Route path="/tickets"     element={<TicketsPage />} />
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
              <Route path="/equipment"   element={<EquipmentPage />} />
              <Route path="/credentials" element={
                <Guard roles={['super_admin','technician']}><CredentialsPage /></Guard>
              } />
              <Route path="/reports"     element={
                <Guard roles={['super_admin','manager']}><ReportsPage /></Guard>
              } />
              <Route path="/clients"     element={
                <Guard roles={['super_admin','manager']}><ClientsPage /></Guard>
              } />
              <Route path="/users"      element={
                <Guard roles={['super_admin']}><UsersPage /></Guard>
              } />
              <Route path="/technicians" element={
                <Guard roles={['super_admin']}><TechnicianAccessPage /></Guard>
              } />
                <Guard roles={['super_admin']}><UsersPage /></Guard>
              } />
              <Route path="/site-settings" element={
                <Guard roles={['super_admin']}><SiteSettingsPage /></Guard>
              } />
              <Route path="/plugins"    element={
                <Guard roles={['super_admin']}><PluginsPage /></Guard>
              } />
              <Route path="/profile"     element={<ProfilePage />} />
            </Route>

            {/* ── CLIENT PORTAL ── */}
            <Route element={
              <Guard roles={['client']}>
                <Layout isClient />
              </Guard>
            }>
              <Route path="/client"                element={<ClientDashboard />} />
              <Route path="/client/visits"         element={<ClientVisits />} />
              <Route path="/client/visits/:id"     element={<VisitDetailPage clientView />} />
              <Route path="/client/tickets"        element={<ClientTickets />} />
              <Route path="/client/tickets/new"    element={<NewTicketPage />} />
              <Route path="/client/tickets/:id"    element={<TicketDetailPage clientView />} />
              <Route path="/client/reports"        element={<ClientReports />} />
              <Route path="/client/profile"        element={<ProfilePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      </SettingsProvider>
    </QueryClientProvider>
  )
}
