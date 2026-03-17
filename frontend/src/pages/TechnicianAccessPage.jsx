import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import { Page, SectionHeader, Modal, PageLoader, EmptyState, Table, Tr, Td } from '../components/ui/index'
import { Users, Shield, Building2, Check, X, ChevronDown, ChevronUp, Loader2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const ACCESS_LEVELS = [
  {
    value: 'all',
    label: 'All Clients',
    icon: '🌍',
    desc: 'Can access every client in the system — no restrictions',
    color: 'border-purple-300 bg-purple-50',
    badge: 'bg-purple-100 text-purple-700',
  },
  {
    value: 'selected',
    label: 'Selected Clients',
    icon: '🎯',
    desc: 'Can only access the specific clients assigned to them',
    color: 'border-blue-300 bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
  },
  {
    value: 'single',
    label: 'Single Client',
    icon: '🏢',
    desc: 'Locked to one primary client — cannot see any other',
    color: 'border-green-300 bg-green-50',
    badge: 'bg-green-100 text-green-700',
  },
]

function AccessBadge({ level }) {
  const l = ACCESS_LEVELS.find(a => a.value === level) || ACCESS_LEVELS[0]
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', l.badge)}>
      {l.icon} {l.label}
    </span>
  )
}

function TechnicianRow({ tech, clients, onEdit }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <Tr>
        <Td>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {tech.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-gray-800 text-sm">{tech.name}</p>
              <p className="text-xs text-gray-400">{tech.email}</p>
            </div>
          </div>
        </Td>
        <Td className="text-gray-500 text-xs">{tech.designation || '—'}</Td>
        <Td><AccessBadge level={tech.access_level} /></Td>
        <Td>
          {tech.access_level === 'single' && (
            <span className="text-sm text-gray-700">{tech.primary_client_name || '—'}</span>
          )}
          {tech.access_level === 'selected' && (
            <span className="text-sm text-gray-600">{tech.assigned_clients?.length || 0} client(s)</span>
          )}
          {tech.access_level === 'all' && (
            <span className="text-xs text-purple-600 font-medium">All {clients?.length || 0} clients</span>
          )}
        </Td>
        <Td>
          <span className={clsx('badge', tech.can_view_credentials ? 'badge-green' : 'badge-gray')}>
            {tech.can_view_credentials ? '✓ Yes' : '✗ No'}
          </span>
        </Td>
        <Td>
          <span className={clsx('badge', tech.is_active ? 'badge-green' : 'badge-red')}>
            {tech.is_active ? 'Active' : 'Inactive'}
          </span>
        </Td>
        <Td>
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(tech)} className="btn-secondary text-xs py-1 px-2">
              <Shield className="w-3 h-3" /> Manage Access
            </button>
            {tech.assigned_clients?.length > 0 && (
              <button onClick={() => setExpanded(p => !p)} className="btn-ghost p-1.5">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </Td>
      </Tr>
      {expanded && tech.assigned_clients?.length > 0 && (
        <tr>
          <td colSpan={7} className="px-4 py-2 bg-blue-50">
            <div className="flex flex-wrap gap-2">
              {tech.assigned_clients.map(ac => (
                <span key={ac.client_id} className="badge badge-blue text-xs">{ac.client_name}</span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function TechnicianAssignmentPage() {
  const qc = useQueryClient()
  const [editTech, setEditTech]     = useState(null)
  const [accessLevel, setAccessLevel] = useState('all')
  const [selectedClients, setSelectedClients] = useState([])
  const [primaryClient, setPrimaryClient]     = useState('')
  const [canViewCreds, setCanViewCreds]       = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: technicians, isLoading } = useQuery({
    queryKey: ['technician-assignments'],
    queryFn:  () => api.get('/technicians/assignments').then(r => r.data),
  })

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn:  () => api.get('/clients').then(r => r.data),
  })

  const openEdit = (tech) => {
    setEditTech(tech)
    setAccessLevel(tech.access_level || 'all')
    setPrimaryClient(tech.primary_client_id || '')
    setCanViewCreds(tech.can_view_credentials || false)
    setSelectedClients(tech.assigned_clients?.map(c => c.client_id) || [])
  }

  const toggleClient = (clientId) => {
    setSelectedClients(prev =>
      prev.includes(clientId) ? prev.filter(id => id !== clientId) : [...prev, clientId]
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/technicians/${editTech.id}/access`, {
        access_level:         accessLevel,
        primary_client_id:    accessLevel === 'single' ? primaryClient : null,
        client_ids:           accessLevel === 'selected' ? selectedClients : [],
        can_view_credentials: canViewCreds,
      })
      toast.success(`Access updated for ${editTech.name}`)
      qc.invalidateQueries(['technician-assignments'])
      setEditTech(null)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update')
    } finally { setSaving(false) }
  }

  const stats = {
    all:      technicians?.filter(t => t.access_level === 'all').length || 0,
    selected: technicians?.filter(t => t.access_level === 'selected').length || 0,
    single:   technicians?.filter(t => t.access_level === 'single').length || 0,
  }

  return (
    <Page>
      <SectionHeader
        title="Technician Access Management"
        subtitle="Control which clients each technician can see and work with"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {ACCESS_LEVELS.map(l => (
          <div key={l.value} className={clsx('card p-4 border-2', l.color)}>
            <div className="text-2xl mb-1">{l.icon}</div>
            <p className="text-xl font-bold text-gray-900">{stats[l.value]}</p>
            <p className="text-sm font-medium text-gray-700">{l.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{l.desc}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="card p-5 bg-slate-50">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-600" /> How Technician Access Works
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <span className="text-xl">🌍</span>
            <div>
              <p className="font-medium text-gray-800">All Clients</p>
              <p className="text-gray-500 text-xs mt-0.5">Sees every client. Use for senior/lead technicians who handle all accounts.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xl">🎯</span>
            <div>
              <p className="font-medium text-gray-800">Selected Clients</p>
              <p className="text-gray-500 text-xs mt-0.5">Can only see the specific clients you assign. Best for regional technicians.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xl">🏢</span>
            <div>
              <p className="font-medium text-gray-800">Single Client</p>
              <p className="text-gray-500 text-xs mt-0.5">Locked to one firm only. Use for dedicated in-house technicians.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Technicians table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">All Technicians ({technicians?.length || 0})</h2>
        </div>
        {isLoading ? <PageLoader /> : (
          <Table headers={['Technician','Designation','Access Level','Clients','View Credentials','Status','Actions']}
            empty={!technicians?.length && <EmptyState icon={Users} title="No technicians yet" message="Add technician users from the Users page" />}
          >
            {technicians?.map(tech => (
              <TechnicianRow key={tech.id} tech={tech} clients={clients} onEdit={openEdit} />
            ))}
          </Table>
        )}
      </div>

      {/* ── EDIT ACCESS MODAL ───────────────────────────────────────────────── */}
      <Modal open={!!editTech} onClose={() => setEditTech(null)}
        title={`Manage Access — ${editTech?.name}`} size="lg">
        {editTech && (
          <div className="space-y-6">
            {/* Technician info */}
            <div className="flex items-center gap-3 pb-4 border-b">
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
                {editTech.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{editTech.name}</p>
                <p className="text-sm text-gray-500">{editTech.email}</p>
                {editTech.designation && <p className="text-xs text-gray-400">{editTech.designation}</p>}
              </div>
            </div>

            {/* Access level selector */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Client Access Level</label>
              <div className="grid grid-cols-1 gap-3">
                {ACCESS_LEVELS.map(l => (
                  <label key={l.value}
                    className={clsx(
                      'flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all',
                      accessLevel === l.value ? l.color : 'border-gray-200 bg-white hover:border-gray-300'
                    )}>
                    <input type="radio" className="sr-only" value={l.value}
                      checked={accessLevel === l.value} onChange={() => setAccessLevel(l.value)} />
                    <span className="text-2xl">{l.icon}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">{l.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{l.desc}</p>
                    </div>
                    {accessLevel === l.value && (
                      <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Single client selector */}
            {accessLevel === 'single' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Primary Client</label>
                <select className="input bg-white" value={primaryClient} onChange={e => setPrimaryClient(e.target.value)}>
                  <option value="">Select the client...</option>
                  {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1.5">
                  This technician will ONLY see data for this client. Cannot be changed without super admin.
                </p>
              </div>
            )}

            {/* Selected clients multi-picker */}
            {accessLevel === 'selected' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Assigned Clients ({selectedClients.length} selected)
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedClients(clients?.map(c => c.id) || [])}
                      className="text-xs text-blue-600 hover:underline">Select all</button>
                    <span className="text-gray-300">|</span>
                    <button onClick={() => setSelectedClients([])}
                      className="text-xs text-gray-400 hover:underline">Clear</button>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-xl divide-y max-h-60 overflow-y-auto">
                  {clients?.map(client => (
                    <label key={client.id}
                      className={clsx(
                        'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                        selectedClients.includes(client.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                      )}>
                      <input type="checkbox"
                        className="w-4 h-4 rounded text-blue-600 border-gray-300"
                        checked={selectedClients.includes(client.id)}
                        onChange={() => toggleClient(client.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{client.name}</p>
                        {client.contact_person && <p className="text-xs text-gray-400 truncate">{client.contact_person}</p>}
                      </div>
                      {selectedClients.includes(client.id) && (
                        <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      )}
                    </label>
                  ))}
                </div>
                {selectedClients.length === 0 && (
                  <div className="flex items-center gap-2 mt-2 text-amber-600 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    No clients selected — technician won't see any data
                  </div>
                )}
              </div>
            )}

            {/* Credentials permission */}
            <div className="border-t pt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded text-blue-600"
                  checked={canViewCreds} onChange={e => setCanViewCreds(e.target.checked)} />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Allow viewing device credentials</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    If enabled, this technician can view (masked) passwords for routers, APs, NVRs etc.
                    Only super admin can see full unmasked passwords.
                  </p>
                </div>
              </label>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button className="btn-secondary" onClick={() => setEditTech(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving ||
                (accessLevel === 'single' && !primaryClient) ||
                (accessLevel === 'selected' && selectedClients.length === 0)
              }>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Access Settings
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  )
}
