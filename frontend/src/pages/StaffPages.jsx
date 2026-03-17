import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { reportsApi, clientsApi, equipApi, credentialsApi, usersApi } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { KpiCard, StatusBadge, Page, SectionHeader, Modal, Table, Tr, Td, EmptyState, PageLoader } from '../components/ui/index'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { BarChart3, Monitor, KeyRound, Building2, Users, UserCircle, Loader2, Plus, Eye, EyeOff, Check, Pencil } from 'lucide-react'
import { format, startOfMonth, subDays } from 'date-fns'
import toast from 'react-hot-toast'

const PIE_COLORS = ['#70AD47', '#ED7D31', '#C00000', '#2E75B6']

// ── REPORTS ───────────────────────────────────────────────────────────────────
export function ReportsPage() {
  const { user } = useAuth()
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to,   setTo]   = useState(format(new Date(), 'yyyy-MM-dd'))
  const [clientId, setClient] = useState('')

  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list().then(r => r.data) })
  const { data: report, isLoading } = useQuery({
    queryKey: ['report', from, to, clientId],
    queryFn:  () => reportsApi.summary({ date_from: from, date_to: to, client_id: clientId || undefined }).then(r => r.data),
  })

  const kpis    = report?.kpis || {}
  const byDept  = report?.by_department || []
  const pieData = [
    { name: 'Resolved',    value: Number(kpis.resolved)    || 0 },
    { name: 'In Progress', value: Number(kpis.in_progress) || 0 },
    { name: 'Unresolved',  value: Number(kpis.unresolved)  || 0 },
  ].filter(d => d.value > 0)

  return (
    <Page>
      <SectionHeader title="Reports" subtitle="Summary of all site activity and issues" />

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div><label className="label">From</label><input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div>
          <label className="label">Client</label>
          <select className="input bg-white" value={clientId} onChange={e => setClient(e.target.value)}>
            <option value="">All clients</option>
            {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={() => { setFrom(format(subDays(new Date(), 7), 'yyyy-MM-dd')); setTo(format(new Date(), 'yyyy-MM-dd')) }} className="btn-secondary text-xs self-end">This Week</button>
        <button onClick={() => { setFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd')); setTo(format(new Date(), 'yyyy-MM-dd')) }} className="btn-secondary text-xs self-end">This Month</button>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Total Issues"   value={kpis.total_issues ?? 0} icon={BarChart3} iconBg="bg-blue-600" />
            <KpiCard label="Resolved"        value={kpis.resolved ?? 0}     icon={Check}    iconBg="bg-green-600" sub={kpis.total_issues > 0 ? `${kpis.resolution_rate ?? 0}%` : undefined} />
            <KpiCard label="Critical"        value={kpis.critical ?? 0}     icon={BarChart3} iconBg="bg-red-600" />
            <KpiCard label="Parts Cost"      value={`KES ${Number(kpis.total_parts_cost ?? 0).toLocaleString()}`} icon={BarChart3} iconBg="bg-purple-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold mb-4">Issues by Department</h2>
              {byDept.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={byDept.slice(0, 10)} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="total"    fill="#2E75B6" radius={[4,4,0,0]} name="Total" />
                    <Bar dataKey="resolved" fill="#70AD47" radius={[4,4,0,0]} name="Resolved" />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-60 flex items-center justify-center text-sm text-gray-400">No data for this period</div>}
            </div>
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-4">Status Breakdown</h2>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip /><Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="h-60 flex items-center justify-center text-sm text-gray-400">No data</div>}
            </div>
          </div>

          {byDept.length > 0 && (
            <div className="card">
              <div className="px-5 py-4 border-b border-gray-100"><h2 className="text-sm font-semibold">Department Breakdown</h2></div>
              <Table headers={['Department', 'Total', 'Resolved', 'Unresolved', 'Critical', 'Parts Cost']}>
                {byDept.map(d => (
                  <Tr key={d.department}>
                    <Td><span className="font-medium">{d.department || 'Unknown'}</span></Td>
                    <Td>{d.total}</Td>
                    <Td><span className="text-green-600 font-medium">{d.resolved}</span></Td>
                    <Td><span className="text-red-600 font-medium">{d.unresolved}</span></Td>
                    <Td><span className="text-red-500">{d.critical}</span></Td>
                    <Td>KES {Number(d.parts_cost || 0).toLocaleString()}</Td>
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

// ── EQUIPMENT ─────────────────────────────────────────────────────────────────
export function EquipmentPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ client_id: '', department_id: '', equipment_type_id: '', custom_item: '', location_room: '', make_model: '', serial_number: '', asset_tag: '', condition: 'good', assigned_to: '', notes: '' })

  const { data: items }   = useQuery({ queryKey: ['equip-register'], queryFn: () => equipApi.register().then(r => r.data) })
  const { data: types }   = useQuery({ queryKey: ['equip-types'],    queryFn: () => equipApi.types().then(r => r.data) })
  const { data: clients } = useQuery({ queryKey: ['clients'],        queryFn: () => clientsApi.list().then(r => r.data) })

  const handleSave = async () => {
    setSaving(true)
    try { await equipApi.addItem(form); toast.success('Equipment added'); qc.invalidateQueries(['equip-register']); setModal(false) }
    catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <Page>
      <SectionHeader title="Equipment Register" subtitle="All IT assets across all clients"
        action={<button onClick={() => setModal(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Equipment</button>} />
      <div className="card">
        <Table headers={['Item', 'Make/Model', 'Department', 'Location', 'Condition', 'Serial #', 'Assigned To']}>
          {(items || []).map(i => (
            <Tr key={i.id}>
              <Td><span className="font-medium">{i.equip_type || i.custom_item || '—'}</span></Td>
              <Td className="text-gray-500 text-xs">{i.make_model || '—'}</Td>
              <Td className="text-gray-500 text-xs">{i.dept_name || '—'}</Td>
              <Td className="text-gray-500 text-xs">{i.location_room || '—'}</Td>
              <Td><StatusBadge status={i.condition} /></Td>
              <Td className="font-mono text-xs">{i.serial_number || '—'}</Td>
              <Td className="text-gray-500 text-xs">{i.assigned_to || '—'}</Td>
            </Tr>
          ))}
        </Table>
        {!items?.length && <EmptyState icon={Monitor} title="No equipment registered" message="Add your first IT asset" />}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Equipment" size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Client</label>
            <select className="input bg-white" value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
              <option value="">Select client...</option>
              {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Equipment Type</label>
            <select className="input bg-white" value={form.equipment_type_id} onChange={e => setForm(p => ({ ...p, equipment_type_id: e.target.value }))}>
              <option value="">Select type...</option>
              {types?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {[['Custom Item (if OTHER)', 'custom_item'], ['Make / Model', 'make_model'], ['Serial Number', 'serial_number'], ['Asset Tag', 'asset_tag'], ['Location / Room', 'location_room'], ['Assigned To', 'assigned_to']].map(([label, key]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input className="input" value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className="label">Condition</label>
            <select className="input bg-white" value={form.condition} onChange={e => setForm(p => ({ ...p, condition: e.target.value }))}>
              {['excellent', 'good', 'fair', 'poor', 'for_repair', 'decommissioned'].map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </Modal>
    </Page>
  )
}

// ── CREDENTIALS ───────────────────────────────────────────────────────────────
export function CredentialsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [reveal, setReveal] = useState({})
  const [cat, setCat] = useState('')
  const [saving, setSaving] = useState(false)
  const isSA = user?.role === 'super_admin'
  const [form, setForm] = useState({ client_id: '', device_category: 'router', device_label: '', make_model: '', ip_address: '', mac_address: '', location: '', ssid: '', wifi_band: '', security_type: '', hostname: '', username: '', password_masked: '', secondary_username: '', secondary_password_masked: '', notes: '' })

  const { data: creds }   = useQuery({ queryKey: ['credentials', cat], queryFn: () => credentialsApi.list({ device_category: cat || undefined }).then(r => r.data) })
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list().then(r => r.data), enabled: isSA })
  const { data: detail }  = useQuery({ queryKey: ['cred-detail', reveal.id], queryFn: () => credentialsApi.get(reveal.id).then(r => r.data), enabled: !!reveal.id && isSA })

  const CATS = ['router', 'wifi_ap', 'nvr_dvr', 'computer', 'switch', 'server', 'other']

  const handleSave = async () => {
    setSaving(true)
    try { await credentialsApi.create(form); toast.success('Credential saved'); qc.invalidateQueries(['credentials']); setModal(false) }
    catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <Page>
      <SectionHeader title="Device Credentials" subtitle="Encrypted device logins, WiFi SSIDs and network passwords"
        action={isSA && <button onClick={() => setModal(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Credential</button>} />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        🔒 <strong>Security:</strong> Passwords are AES-256 encrypted. Only Super Admin can view full credentials. All other roles see masked values (e.g. <code className="bg-amber-100 px-1 rounded">Ad••••1</code>).
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCat('')} className={`btn-secondary text-xs ${!cat ? 'bg-blue-50 border-blue-400 text-blue-600' : ''}`}>All</button>
        {CATS.map(c => (
          <button key={c} onClick={() => setCat(c)} className={`btn-secondary text-xs capitalize ${cat === c ? 'bg-blue-50 border-blue-400 text-blue-600' : ''}`}>{c.replace(/_/g, ' ')}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(creds || []).map(c => (
          <div key={c.id} className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800">{c.device_label}</p>
                <p className="text-xs text-gray-400 capitalize">{c.device_category?.replace(/_/g, ' ')} · {c.make_model || '—'}</p>
              </div>
              {isSA && (
                <button onClick={() => setReveal(v => v.id === c.id ? {} : { id: c.id })} className="btn-ghost p-2">
                  {reveal.id === c.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
            <div className="space-y-1.5 text-sm">
              {c.ip_address && <div className="flex justify-between"><span className="text-gray-400">IP</span><span className="font-mono text-xs">{c.ip_address}</span></div>}
              {c.ssid && <div className="flex justify-between"><span className="text-gray-400">SSID</span><span className="font-medium">{c.ssid}</span></div>}
              <div className="flex justify-between"><span className="text-gray-400">Username</span><span className="font-mono text-xs">{reveal.id === c.id && detail ? detail.username : c.username || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Password</span><span className="font-mono text-xs">{reveal.id === c.id && detail ? detail.password : c.password || '—'}</span></div>
            </div>
            {c.notes && <p className="text-xs text-gray-400 border-t pt-2">{c.notes}</p>}
          </div>
        ))}
        {!creds?.length && <div className="col-span-3"><EmptyState icon={KeyRound} title="No credentials" message="Add device credentials securely" /></div>}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Device Credential" size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Client *</label>
            <select className="input bg-white" value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
              <option value="">Select client...</option>
              {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Device Category *</label>
            <select className="input bg-white" value={form.device_category} onChange={e => setForm(p => ({ ...p, device_category: e.target.value }))}>
              {CATS.map(c => <option key={c} value={c} className="capitalize">{c.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          {[['Device Label *', 'device_label', false], ['Make / Model', 'make_model', false], ['IP Address', 'ip_address', false], ['MAC Address', 'mac_address', false], ['Location', 'location', false], ['SSID (WiFi)', 'ssid', false], ['Hostname', 'hostname', false], ['Username', 'username', false], ['Password', 'password_masked', true], ['Secondary Username', 'secondary_username', false], ['Secondary Password', 'secondary_password_masked', true]].map(([label, key, isPw]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input className="input" type={isPw ? 'password' : 'text'} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
            </div>
          ))}
          <div className="col-span-2">
            <label className="label">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !form.client_id || !form.device_label}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Encrypted
          </button>
        </div>
      </Modal>
    </Page>
  )
}

// ── CLIENTS ───────────────────────────────────────────────────────────────────
export function ClientsPage() {
  const qc = useQueryClient()
  const [modal, setModal]     = useState(false)
  const [deptModal, setDeptModal] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [form, setForm]       = useState({ name: '', contact_person: '', contact_email: '', contact_phone: '', address: '', contract_number: '' })
  const [deptForm, setDeptForm] = useState({ name: '', color: '#2E75B6' })

  const { data: clients }  = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list().then(r => r.data) })
  const { data: selDepts } = useQuery({ queryKey: ['departments', deptModal], queryFn: () => clientsApi.depts(deptModal).then(r => r.data), enabled: !!deptModal })

  const handleSave = async () => {
    setSaving(true)
    try { await clientsApi.create(form); toast.success('Client created'); qc.invalidateQueries(['clients']); setModal(false); setForm({ name: '', contact_person: '', contact_email: '', contact_phone: '', address: '', contract_number: '' }) }
    catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }

  const handleAddDept = async () => {
    if (!deptForm.name.trim()) return
    setSaving(true)
    try { await clientsApi.addDept(deptModal, deptForm); toast.success('Department added'); qc.invalidateQueries(['departments', deptModal]); setDeptForm({ name: '', color: '#2E75B6' }) }
    catch { toast.error('Failed') }
    finally { setSaving(false) }
  }

  return (
    <Page>
      <SectionHeader title="Clients" subtitle="Manage client organisations"
        action={<button onClick={() => setModal(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Client</button>} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(clients || []).map(c => (
          <div key={c.id} className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800">{c.name}</p>
                <p className="text-xs text-gray-400">{c.contract_number || 'No contract #'}</p>
              </div>
              <span className={`badge ${c.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{c.status}</span>
            </div>
            <div className="text-sm space-y-1">
              {c.contact_person && <p className="text-gray-600">👤 {c.contact_person}</p>}
              {c.contact_email  && <p className="text-gray-500 text-xs">✉ {c.contact_email}</p>}
              {c.contact_phone  && <p className="text-gray-500 text-xs">📞 {c.contact_phone}</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <span className="badge badge-blue">{c.user_count || 0} users</span>
              <button onClick={() => setDeptModal(c.id)} className="btn-ghost text-xs px-2 py-1">Manage Depts</button>
            </div>
          </div>
        ))}
        {!clients?.length && <EmptyState icon={Building2} title="No clients yet" message="Add your first client" />}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Client">
        <div className="space-y-4">
          {[['Organisation Name *', 'name'], ['Contact Person', 'contact_person'], ['Contact Email', 'contact_email'], ['Contact Phone', 'contact_phone'], ['Address', 'address'], ['Contract #', 'contract_number']].map(([label, key]) => (
            <div key={key}><label className="label">{label}</label><input className="input" value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} /></div>
          ))}
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !form.name}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create Client
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deptModal} onClose={() => setDeptModal(null)} title="Manage Departments" size="sm">
        <div className="space-y-4">
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selDepts?.map(d => (
              <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                <span className="text-sm font-medium flex items-center gap-2">
                  <span style={{ background: d.color }} className="w-3 h-3 rounded-full inline-block" />
                  {d.name}
                </span>
                <button onClick={async () => { await clientsApi.delDept(deptModal, d.id); qc.invalidateQueries(['departments', deptModal]) }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
              </div>
            ))}
            {!selDepts?.length && <p className="text-sm text-gray-400 text-center py-4">No departments yet</p>}
          </div>
          <div className="border-t pt-4">
            <label className="label">Add New Department</label>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="Department name" value={deptForm.name} onChange={e => setDeptForm(p => ({ ...p, name: e.target.value }))} />
              <input type="color" value={deptForm.color} onChange={e => setDeptForm(p => ({ ...p, color: e.target.value }))} className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5" />
              <button onClick={handleAddDept} disabled={!deptForm.name} className="btn-primary text-xs px-3">Add</button>
            </div>
          </div>
        </div>
      </Modal>
    </Page>
  )
}

// ── USERS ─────────────────────────────────────────────────────────────────────
export function UsersPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: 'password', role: 'technician', client_id: '', designation: '', employee_number: '' })

  const { data: users }   = useQuery({ queryKey: ['users'],   queryFn: () => usersApi.list().then(r => r.data) })
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list().then(r => r.data) })

  const ROLES = ['super_admin', 'manager', 'technician', 'client']
  const ROLE_BADGE = { super_admin: 'badge-red', manager: 'badge-purple', technician: 'badge-blue', client: 'badge-green' }

  const handleSave = async () => {
    setSaving(true)
    try { await usersApi.create(form); toast.success('User created'); qc.invalidateQueries(['users']); setModal(false) }
    catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <Page>
      <SectionHeader title="Users" subtitle="Manage system users and access roles"
        action={<button onClick={() => setModal(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add User</button>} />
      <div className="card">
        <Table headers={['Name', 'Email', 'Role', 'Client', 'Designation', 'Last Login', 'Status']}>
          {(users || []).map(u => (
            <Tr key={u.id}>
              <Td><span className="font-medium">{u.name}</span></Td>
              <Td className="text-gray-500 text-xs">{u.email}</Td>
              <Td><span className={`badge capitalize ${ROLE_BADGE[u.role] || 'badge-gray'}`}>{u.role?.replace(/_/g, ' ')}</span></Td>
              <Td className="text-gray-500 text-xs">{u.client_name || '—'}</Td>
              <Td className="text-gray-500 text-xs">{u.designation || '—'}</Td>
              <Td className="text-gray-400 text-xs">{u.last_login_at ? format(new Date(u.last_login_at), 'd MMM') : 'Never'}</Td>
              <Td><span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></Td>
            </Tr>
          ))}
        </Table>
        {!users?.length && <EmptyState icon={Users} title="No users yet" message="Add your first user" />}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add User">
        <div className="space-y-4">
          {[['Full Name *', 'name', 'text'], ['Email *', 'email', 'email'], ['Password', 'password', 'password'], ['Designation', 'designation', 'text'], ['Employee #', 'employee_number', 'text']].map(([label, key, type]) => (
            <div key={key}><label className="label">{label}</label><input className="input" type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} /></div>
          ))}
          <div><label className="label">Role</label>
            <select className="input bg-white" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r} className="capitalize">{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          {form.role === 'client' && (
            <div><label className="label">Client</label>
              <select className="input bg-white" value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
                <option value="">Select client...</option>
                {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !form.name || !form.email}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create User
            </button>
          </div>
        </div>
      </Modal>
    </Page>
  )
}

export default ReportsPage
