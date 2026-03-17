import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { visitsApi, clientsApi } from '../utils/api'
import { StatusBadge, Table, Tr, Td, EmptyState, SectionHeader, Page, ConfirmDialog } from '../components/ui/index'
import { Plus, ClipboardList, Trash2, Eye, FileDown, Search } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function VisitsPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [clientId, setClient] = useState('')
  const [delId, setDelId]     = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['visits', status, clientId],
    queryFn:  () => visitsApi.list({ status: status||undefined, client_id: clientId||undefined, limit: 50 }).then(r => r.data),
  })
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn:  () => clientsApi.list().then(r => r.data),
    enabled:  ['super_admin','manager'].includes(user?.role),
  })

  const filtered = (data?.data || []).filter(v =>
    !search || v.visit_reference?.toLowerCase().includes(search.toLowerCase()) ||
    v.client_name?.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async () => {
    try {
      await visitsApi.delete(delId)
      toast.success('Visit deleted')
      qc.invalidateQueries(['visits'])
    } catch { toast.error('Failed to delete') }
    finally { setDelId(null) }
  }

  return (
    <Page>
      <SectionHeader
        title="Site Visits"
        subtitle="All logged maintenance and support visits"
        action={
          ['super_admin','technician'].includes(user?.role) &&
          <Link to="/visits/new" className="btn-primary"><Plus className="w-4 h-4" /> New Visit</Link>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search ref, client..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto bg-white" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['draft','in_progress','completed','signed'].map(s =>
            <option key={s} value={s} className="capitalize">{s.replace('_',' ')}</option>
          )}
        </select>
        {['super_admin','manager'].includes(user?.role) && (
          <select className="input w-auto bg-white" value={clientId} onChange={e => setClient(e.target.value)}>
            <option value="">All clients</option>
            {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="card">
        <Table
          headers={['Reference','Client','Date','Technician','Issues','Status','Actions']}
          empty={!isLoading && !filtered.length && (
            <EmptyState icon={ClipboardList} title="No visits found"
              message="Start by logging a new site visit"
              action={
                ['super_admin','technician'].includes(user?.role) &&
                <Link to="/visits/new" className="btn-primary text-xs">New Visit</Link>
              }
            />
          )}
        >
          {filtered.map(v => (
            <Tr key={v.id} onClick={() => navigate(`/visits/${v.id}`)}>
              <Td><span className="font-mono text-xs text-blue-600">{v.visit_reference}</span></Td>
              <Td><span className="font-medium">{v.client_name}</span></Td>
              <Td>{v.visit_date ? format(new Date(v.visit_date), 'd MMM yyyy') : '—'}</Td>
              <Td className="text-gray-500">{v.technician_name}</Td>
              <Td><span className="badge badge-blue">{v.issue_count || 0} issues</span></Td>
              <Td><StatusBadge status={v.status} /></Td>
              <Td>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => navigate(`/visits/${v.id}`)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  {user?.role === 'super_admin' && (
                    <button onClick={() => setDelId(v.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      </div>

      <ConfirmDialog
        open={!!delId} onClose={() => setDelId(null)} onConfirm={handleDelete}
        title="Delete Visit" confirmLabel="Delete"
        message="This will permanently delete the visit and all its issues and network points. This cannot be undone."
      />
    </Page>
  )
}
