import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { visitsApi, ticketsApi, reportsApi } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { KpiCard, StatusBadge, PageLoader } from '../components/ui/index'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import {
  ClipboardList, Ticket, CheckCircle, AlertTriangle,
  ArrowRight, Plus, BarChart3, Wrench
} from 'lucide-react'
import { format } from 'date-fns'

const PIE_COLORS = ['#70AD47','#ED7D31','#C00000','#2E75B6','#7030A0']

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const today    = format(new Date(), 'yyyy-MM-dd')
  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')

  const { data: report, isLoading: repLoading } = useQuery({
    queryKey: ['report-summary', monthStart, today],
    queryFn:  () => reportsApi.summary({ date_from: monthStart, date_to: today }).then(r => r.data),
  })
  const { data: visits } = useQuery({
    queryKey: ['visits-recent'],
    queryFn:  () => visitsApi.list({ limit: 6 }).then(r => r.data),
  })
  const { data: tickets } = useQuery({
    queryKey: ['tickets-recent'],
    queryFn:  () => ticketsApi.list({ limit: 6 }).then(r => r.data),
  })

  const kpis  = report?.kpis || {}
  const byDept= report?.by_department || []
  const pieData = [
    { name:'Resolved',    value: Number(kpis.resolved)    || 0 },
    { name:'In Progress', value: Number(kpis.in_progress) || 0 },
    { name:'Unresolved',  value: Number(kpis.unresolved)  || 0 },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {format(new Date(), 'EEEE, d MMMM yyyy')} · Welcome, {user?.name}
          </p>
        </div>
        {['super_admin','technician'].includes(user?.role) && (
          <Link to="/visits/new" className="btn-primary">
            <Plus className="w-4 h-4" /> New Visit
          </Link>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Issues (Month)" value={kpis.total_issues ?? 0}
          icon={Wrench} iconBg="bg-blue-600"
          onClick={() => navigate('/visits')} />
        <KpiCard label="Resolved" value={kpis.resolved ?? 0}
          icon={CheckCircle} iconBg="bg-green-600"
          sub={kpis.total_issues > 0 ? `${kpis.resolution_rate ?? 0}% rate` : undefined} />
        <KpiCard label="Critical Issues" value={kpis.critical ?? 0}
          icon={AlertTriangle} iconBg="bg-red-600"
          onClick={() => navigate('/tickets')} />
        <KpiCard label="Parts Cost" value={`KES ${Number(kpis.total_parts_cost ?? 0).toLocaleString()}`}
          icon={BarChart3} iconBg="bg-purple-600" />
      </div>

      {/* Charts */}
      {!repLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bar chart */}
          <div className="card p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Issues by Department (This Month)</h2>
            {byDept.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byDept.slice(0,8)} margin={{ left:-20, right:0, top:0, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="department" tick={{ fontSize:10 }} />
                  <YAxis tick={{ fontSize:10 }} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#2E75B6" radius={[4,4,0,0]} name="Total" />
                  <Bar dataKey="resolved" fill="#70AD47" radius={[4,4,0,0]} name="Resolved" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">
                No data for this month yet
              </div>
            )}
          </div>

          {/* Pie chart */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Status Breakdown</h2>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                       dataKey="value" paddingAngle={3}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">
                No issues logged yet
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent visits + tickets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent visits */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent Visits</h2>
            <Link to="/visits" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {visits?.data?.map(v => (
              <Link key={v.id} to={`/visits/${v.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-800">{v.client_name}</p>
                  <p className="text-xs text-gray-400">
                    {v.visit_reference} · {format(new Date(v.visit_date), 'd MMM yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{v.issue_count} issues</span>
                  <StatusBadge status={v.status} />
                </div>
              </Link>
            ))}
            {!visits?.data?.length && (
              <p className="text-sm text-gray-400 text-center py-8">No visits yet</p>
            )}
          </div>
        </div>

        {/* Recent tickets */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent Tickets</h2>
            <Link to="/tickets" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {tickets?.data?.map(t => (
              <Link key={t.id} to={`/tickets/${t.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                  <p className="text-xs text-gray-400">{t.ticket_number} · {t.client_name}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={t.priority} />
                  <StatusBadge status={t.status} />
                </div>
              </Link>
            ))}
            {!tickets?.data?.length && (
              <p className="text-sm text-gray-400 text-center py-8">No tickets yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
