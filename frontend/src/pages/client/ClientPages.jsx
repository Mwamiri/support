import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { visitsApi, ticketsApi, reportsApi, clientsApi } from '../../utils/api'
import { useAuth } from '../../context/AuthContext'
import { KpiCard, StatusBadge, PriorityBadge, Table, Tr, Td, EmptyState, SectionHeader, Page, PageLoader } from '../../components/ui/index'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  ClipboardList, Ticket, CheckCircle, BarChart3, ArrowRight,
  Plus, Send, Loader2, AlertTriangle
} from 'lucide-react'
import { format, startOfMonth } from 'date-fns'
import toast from 'react-hot-toast'

// ══════════════════════════════════════════════════════════════════════════════
// CLIENT DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
export function ClientDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: visits } = useQuery({
    queryKey: ['my-visits'],
    queryFn:  () => visitsApi.list({ limit: 5 }).then(r => r.data),
  })
  const { data: tickets } = useQuery({
    queryKey: ['my-tickets'],
    queryFn:  () => ticketsApi.list({ limit: 5 }).then(r => r.data),
  })
  const { data: report } = useQuery({
    queryKey: ['my-report'],
    queryFn:  () => reportsApi.summary({
      date_from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      date_to:   format(new Date(), 'yyyy-MM-dd'),
    }).then(r => r.data),
  })

  const kpis  = report?.kpis || {}
  const open  = (tickets?.data || []).filter(t => ['open','assigned','in_progress'].includes(t.status)).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{user?.client?.name} · {format(new Date(), 'd MMMM yyyy')}</p>
        </div>
        <Link to="/client/tickets/new" className="btn-primary">
          <Plus className="w-4 h-4" /> Submit Ticket
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Visits"   value={visits?.total ?? 0}       icon={ClipboardList} iconBg="bg-blue-600"   onClick={() => navigate('/client/visits')} />
        <KpiCard label="Open Tickets"   value={open}                     icon={Ticket}        iconBg="bg-orange-500" onClick={() => navigate('/client/tickets')} />
        <KpiCard label="Issues Resolved"value={kpis.resolved ?? 0}       icon={CheckCircle}   iconBg="bg-green-600" />
        <KpiCard label="This Month"     value={kpis.total_issues ?? 0}   icon={BarChart3}     iconBg="bg-purple-600" onClick={() => navigate('/client/reports')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent visits */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent Site Visits</h2>
            <Link to="/client/visits" className="text-xs text-blue-600 hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="divide-y divide-gray-50">
            {visits?.data?.map(v => (
              <Link key={v.id} to={`/client/visits/${v.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-800">{v.visit_reference}</p>
                  <p className="text-xs text-gray-400">{format(new Date(v.visit_date), 'd MMM yyyy')} · {v.technician_name}</p>
                </div>
                <StatusBadge status={v.status} />
              </Link>
            ))}
            {!visits?.data?.length && <p className="text-sm text-gray-400 text-center py-8">No visits yet</p>}
          </div>
        </div>

        {/* My tickets */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">My Tickets</h2>
            <Link to="/client/tickets" className="text-xs text-blue-600 hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="divide-y divide-gray-50">
            {tickets?.data?.map(t => (
              <Link key={t.id} to={`/client/tickets/${t.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                  <p className="text-xs text-gray-400">{t.ticket_number} · {format(new Date(t.created_at), 'd MMM')}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                </div>
              </Link>
            ))}
            {!tickets?.data?.length && (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-400 mb-3">No tickets submitted yet</p>
                <Link to="/client/tickets/new" className="text-xs text-blue-600 hover:underline">Submit your first ticket →</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CLIENT VISITS
// ══════════════════════════════════════════════════════════════════════════════
export function ClientVisits() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['my-visits-all'],
    queryFn:  () => visitsApi.list({ limit: 100 }).then(r => r.data),
  })

  return (
    <Page>
      <SectionHeader title="Visit Reports" subtitle="All site visits conducted at your premises" />
      <div className="card">
        <Table
          headers={['Reference','Date','Technician','Issues','Status','Signed']}
          empty={!isLoading && !data?.data?.length && (
            <EmptyState icon={ClipboardList} title="No visits yet" message="Site visits will appear here once logged by your technician" />
          )}
        >
          {(data?.data || []).map(v => (
            <Tr key={v.id} onClick={() => navigate(`/client/visits/${v.id}`)}>
              <Td><span className="font-mono text-xs text-blue-600">{v.visit_reference}</span></Td>
              <Td>{v.visit_date ? format(new Date(v.visit_date), 'd MMM yyyy') : '—'}</Td>
              <Td className="text-gray-500">{v.technician_name}</Td>
              <Td><span className="badge badge-blue">{v.issue_count || 0}</span></Td>
              <Td><StatusBadge status={v.status} /></Td>
              <Td>{v.client_signed_at ? <span className="badge badge-green">✓ Signed</span> : <span className="badge badge-gray">Pending</span>}</Td>
            </Tr>
          ))}
        </Table>
      </div>
    </Page>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CLIENT TICKETS
// ══════════════════════════════════════════════════════════════════════════════
export function ClientTickets() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const { data } = useQuery({
    queryKey: ['my-tickets-all', status],
    queryFn:  () => ticketsApi.list({ status: status||undefined, limit: 100 }).then(r => r.data),
  })

  return (
    <Page>
      <SectionHeader title="My Tickets" subtitle="Track your support requests"
        action={<Link to="/client/tickets/new" className="btn-primary"><Plus className="w-4 h-4" />New Ticket</Link>} />

      <div className="flex gap-2 flex-wrap">
        {['','open','in_progress','resolved','closed'].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`btn-secondary text-xs capitalize ${status === s ? 'bg-blue-50 border-blue-400 text-blue-600' : ''}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      <div className="card">
        <Table
          headers={['Ticket #','Title','Priority','Status','Assigned To','Date']}
          empty={!data?.data?.length && (
            <EmptyState icon={Ticket} title="No tickets" message="Submit a ticket when you have an IT issue"
              action={<Link to="/client/tickets/new" className="btn-primary text-xs">Submit Ticket</Link>} />
          )}
        >
          {(data?.data || []).map(t => (
            <Tr key={t.id} onClick={() => navigate(`/client/tickets/${t.id}`)}>
              <Td><span className="font-mono text-xs text-blue-600">{t.ticket_number}</span></Td>
              <Td><span className="font-medium text-gray-800 truncate max-w-[200px] block">{t.title}</span></Td>
              <Td><PriorityBadge priority={t.priority} /></Td>
              <Td><StatusBadge status={t.status} /></Td>
              <Td className="text-gray-500 text-xs">{t.assignee_name || '—'}</Td>
              <Td className="text-gray-400 text-xs">{format(new Date(t.created_at), 'd MMM yyyy')}</Td>
            </Tr>
          ))}
        </Table>
      </div>
    </Page>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW TICKET PAGE
// ══════════════════════════════════════════════════════════════════════════════
export function NewTicketPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title:'', description:'', department_id:'', equipment:'', location:'', priority:'medium'
  })

  const { data: depts } = useQuery({
    queryKey: ['departments', user?.client_id],
    queryFn:  () => clientsApi.depts(user.client_id).then(r => r.data),
    enabled:  !!user?.client_id,
  })

  const PRIORITIES = [
    { v:'low',      e:'🟢', label:'Low',      desc:'Non-urgent, can wait' },
    { v:'medium',   e:'🟡', label:'Medium',   desc:'Needs attention soon' },
    { v:'high',     e:'🟠', label:'High',     desc:'Impacting work' },
    { v:'critical', e:'🔴', label:'Critical', desc:'System down / urgent' },
  ]

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.title || !form.description) { toast.error('Title and description required'); return }
    setSaving(true)
    try {
      const r = await ticketsApi.create(form)
      toast.success(`Ticket ${r.data.ticket_number} submitted!`)
      qc.invalidateQueries(['my-tickets'])
      navigate(`/client/tickets/${r.data.id}`)
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to submit') }
    finally { setSaving(false) }
  }

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <SectionHeader title="Submit Support Ticket"
        subtitle="Describe your issue and our IT team will respond promptly" />

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        <div>
          <label className="label">Issue Title *</label>
          <input className="input" required value={form.title}
            placeholder="e.g. Printer not working in Finance office"
            onChange={e => set('title', e.target.value)} />
        </div>

        <div>
          <label className="label">Description *</label>
          <textarea className="input resize-none" rows={5} required value={form.description}
            placeholder="Describe the issue in detail — when it started, what happens, any error messages..."
            onChange={e => set('description', e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Department</label>
            <select className="input bg-white" value={form.department_id} onChange={e => set('department_id', e.target.value)}>
              <option value="">Select...</option>
              {depts?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Location / Office</label>
            <input className="input" value={form.location} placeholder="e.g. Block B, Room 3"
              onChange={e => set('location', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Equipment / Device</label>
            <input className="input" value={form.equipment} placeholder="e.g. HP LaserJet, Dell Laptop"
              onChange={e => set('equipment', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Priority</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
            {PRIORITIES.map(p => (
              <label key={p.v} className={`flex flex-col gap-1 px-3 py-3 rounded-xl border-2 cursor-pointer transition-colors ${
                form.priority === p.v ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input type="radio" className="sr-only" checked={form.priority === p.v} onChange={() => set('priority', p.v)} />
                <span className="text-lg">{p.e}</span>
                <span className="text-xs font-semibold text-gray-800">{p.label}</span>
                <span className="text-xs text-gray-400">{p.desc}</span>
              </label>
            ))}
          </div>
        </div>

        {form.priority === 'critical' && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">
              <strong>Critical priority</strong> — For system-down emergencies, also contact your IT technician directly by phone for the fastest response.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {saving ? 'Submitting...' : 'Submit Ticket'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CLIENT REPORTS
// ══════════════════════════════════════════════════════════════════════════════
export function ClientReports() {
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo]     = useState(format(new Date(), 'yyyy-MM-dd'))

  const { data: report, isLoading } = useQuery({
    queryKey: ['client-report', from, to],
    queryFn:  () => reportsApi.summary({ date_from: from, date_to: to }).then(r => r.data),
  })

  const kpis   = report?.kpis || {}
  const byDept = report?.by_department || []

  return (
    <Page>
      <SectionHeader title="Reports" subtitle="Summary of IT support activity at your site" />

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div><label className="label">From</label><input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Total Issues"  value={kpis.total_issues ?? 0}  icon={ClipboardList} iconBg="bg-blue-600" />
            <KpiCard label="Resolved"      value={kpis.resolved ?? 0}      icon={CheckCircle}   iconBg="bg-green-600" sub={kpis.total_issues > 0 ? `${kpis.resolution_rate ?? 0}% rate` : undefined} />
            <KpiCard label="Critical"      value={kpis.critical ?? 0}      icon={AlertTriangle} iconBg="bg-red-600" />
            <KpiCard label="Parts Cost"    value={`KES ${Number(kpis.total_parts_cost ?? 0).toLocaleString()}`} icon={BarChart3} iconBg="bg-purple-600" />
          </div>

          {byDept.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-4">Issues by Department</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byDept} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="total"    fill="#2E75B6" radius={[4,4,0,0]} name="Total" />
                  <Bar dataKey="resolved" fill="#70AD47" radius={[4,4,0,0]} name="Resolved" />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {report?.recent_visits?.length > 0 && (
            <div className="card">
              <div className="px-5 py-4 border-b"><h2 className="text-sm font-semibold">Recent Visits</h2></div>
              <Table headers={['Reference','Date','Technician','Status']}>
                {report.recent_visits.map(v => (
                  <Tr key={v.visit_reference}>
                    <Td><span className="font-mono text-xs text-blue-600">{v.visit_reference}</span></Td>
                    <Td>{format(new Date(v.visit_date), 'd MMM yyyy')}</Td>
                    <Td className="text-gray-500">{v.technician}</Td>
                    <Td><StatusBadge status={v.status} /></Td>
                  </Tr>
                ))}
              </Table>
            </div>
          )}
        </>
      )}
    </Page>
  )
}

export default ClientDashboard
