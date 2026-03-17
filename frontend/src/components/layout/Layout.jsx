import { Outlet, NavLink } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../context/SettingsContext'
import {
  LayoutDashboard, ClipboardList, Network, Monitor, KeyRound,
  Ticket, BarChart3, Users, Building2, UserCircle, LogOut,
  Menu, X, Wrench, Bell, FileText, PlusCircle, Plug, Shield, Settings
} from 'lucide-react'
import clsx from 'clsx'
import { Toaster } from 'react-hot-toast'

const STAFF_NAV = [
  { to:'/dashboard',   label:'Dashboard',        icon:LayoutDashboard, roles:['super_admin','manager','technician'] },
  { to:'/visits',      label:'Site Visits',      icon:ClipboardList,   roles:['super_admin','manager','technician'] },
  { to:'/tickets',     label:'Tickets',          icon:Ticket,          roles:['super_admin','manager','technician'] },
  { to:'/equipment',   label:'Equipment',        icon:Monitor,         roles:['super_admin','manager','technician'] },
  { to:'/credentials', label:'Credentials',      icon:KeyRound,        roles:['super_admin','technician'] },
  { to:'/reports',     label:'Reports',          icon:BarChart3,       roles:['super_admin','manager'] },
  { to:'/clients',     label:'Clients',          icon:Building2,       roles:['super_admin','manager'] },
  { to:'/users',      label:'Users',          icon:Users,           roles:['super_admin'] },
  { to:'/site-settings',label:'Site Settings',   icon:Settings,        roles:['super_admin'] },
  { to:'/technicians', label:'Technician Access',icon:Shield,          roles:['super_admin'] },
  { to:'/plugins',    label:'Plugins',        icon:Plug,            roles:['super_admin'] },
]

const CLIENT_NAV = [
  { to:'/client',         label:'Dashboard',    icon:LayoutDashboard },
  { to:'/client/visits',  label:'Visit Reports',icon:FileText },
  { to:'/client/tickets', label:'My Tickets',   icon:Ticket },
  { to:'/client/reports', label:'Reports',      icon:BarChart3 },
]

const ROLE_STYLE = {
  super_admin:{ bg:'bg-red-600',    label:'Super Admin' },
  manager:    { bg:'bg-purple-600', label:'Manager' },
  technician: { bg:'bg-blue-600',   label:'Technician' },
  client:     { bg:'bg-green-600',  label:'Client' },
}

function NavItem({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => clsx(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </NavLink>
  )
}

export default function Layout({ isClient = false }) {
  const { user, logout } = useAuth()
  const { settings } = useSettings()
  const [open, setOpen]  = useState(false)

  const navItems = isClient
    ? CLIENT_NAV
    : STAFF_NAV.filter(n => n.roles.includes(user?.role))

  const roleStyle = ROLE_STYLE[user?.role] || ROLE_STYLE.client

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Toaster position="top-right" />

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 flex flex-col transition-transform duration-300 lg:static lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700/50">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-lg">{settings.logo_icon || '🔧'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">{settings.logo_text || 'IT Support'}</p>
            <p className="text-slate-400 text-xs">{isClient ? 'Client Portal' : (settings.logo_subtext || 'Management')}</p>
          </div>
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Client badge */}
        {isClient && user?.client && (
          <div className="mx-4 mt-4 px-3 py-2 bg-slate-800 rounded-lg">
            <p className="text-xs text-slate-400">Organisation</p>
            <p className="text-sm text-white font-medium truncate">{user.client.name}</p>
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map(item => (
            <NavItem
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              end={item.to === '/client' || item.to === '/dashboard'}
            />
          ))}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-slate-700/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <span className={clsx('text-xs text-white px-2 py-0.5 rounded-full', roleStyle.bg)}>
                {roleStyle.label}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <NavLink to={isClient ? '/client/profile' : '/profile'}
              className="flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-white py-2 rounded-lg hover:bg-slate-800 transition-colors">
              <UserCircle className="w-3.5 h-3.5" /> Profile
            </NavLink>
            <button onClick={logout}
              className="flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-red-400 py-2 rounded-lg hover:bg-slate-800 transition-colors">
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 flex-shrink-0">
          <button className="lg:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                  onClick={() => setOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          {isClient && (
            <NavLink to="/client/tickets/new"
              className="btn-primary text-xs py-1.5 px-3">
              <PlusCircle className="w-3.5 h-3.5" /> New Ticket
            </NavLink>
          )}
          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <Bell className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
