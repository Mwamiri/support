import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { visitsApi } from '../utils/api'
import { StatusBadge, PriorityBadge, PageLoader, Modal, SectionHeader } from '../components/ui/index'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  ArrowLeft, Edit, CheckSquare, FileDown, Network, ClipboardList,
  Clock, Building2, User, Calendar, PenLine, Check
} from 'lucide-react'
import clsx from 'clsx'

const TABS = ['Overview','Issues','Network Points','Sign Off']

export default function VisitDetailPage({ clientView = false }) {
  const { id }     = useParams()
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const [tab, setTab]       = useState(0)
  const [signModal, setSign] = useState(false)
  const [sigName, setSigName]= useState('')
  const [signing, setSigning]= useState(false)

  const { data: visit, isLoading } = useQuery({
    queryKey: ['visit', id],
    queryFn:  () => visitsApi.get(id).then(r => r.data),
  })

  const handleSign = async (signerType) => {
    if (!sigName.trim()) { toast.error('Enter your name'); return }
    setSigning(true)
    try {
      await visitsApi.sign(id, { signer_type: signerType, signer_name: sigName })
      if (signerType === 'technician') {
        await visitsApi.update(id, { status: 'completed' })
      }
      toast.success('Signature recorded!')
      qc.invalidateQueries(['visit', id])
      setSign(false)
      setSigName('')
    } catch { toast.error('Failed to record signature') }
    finally { setSigning(false) }
  }

  if (isLoading) return <PageLoader />
  if (!visit) return <div className="text-center py-20 text-gray-400">Visit not found</div>

  const canSign = !clientView && ['super_admin','technician'].includes(user?.role)
  const canClientSign = clientView || user?.role === 'client'

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost p-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              {visit.visit_reference}
              <StatusBadge status={visit.status} />
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{visit.client_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canSign && visit.status !== 'signed' && (
            <button onClick={() => setSign(true)} className="btn-primary">
              <PenLine className="w-4 h-4" /> Sign Off
            </button>
          )}
        </div>
      </div>

      {/* Meta cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Calendar, label: 'Visit Date', value: visit.visit_date ? format(new Date(visit.visit_date), 'd MMM yyyy') : '—' },
          { icon: User,     label: 'Technician', value: visit.technician_name },
          { icon: Building2,label: 'Site',       value: visit.site_name || 'Main Site' },
          { icon: Clock,    label: 'Time',        value: visit.time_in ? `${visit.time_in} – ${visit.time_out || '?'}` : '—' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="text-sm font-semibold text-gray-900 truncate">{value || '—'}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className={clsx(
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                i === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}>
              {t}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Overview */}
      {tab === 0 && (
        <div className="space-y-4">
          {visit.summary && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Visit Summary</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{visit.summary}</p>
            </div>
          )}
          {visit.scope?.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Scope of Visit</h3>
              <div className="flex flex-wrap gap-2">
                {visit.scope.map(s => (
                  <span key={s} className="badge badge-blue">✓ {s}</span>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Issue Summary</h3>
              <div className="space-y-2">
                {[
                  ['Total Issues', visit.issues?.length || 0, 'text-gray-900'],
                  ['Resolved',     visit.issues?.filter(i=>i.resolved==='yes').length||0, 'text-green-600'],
                  ['Unresolved',   visit.issues?.filter(i=>i.resolved==='no').length||0, 'text-red-600'],
                  ['Critical',     visit.issues?.filter(i=>i.priority==='critical').length||0, 'text-red-600'],
                ].map(([label, val, cls]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-500">{label}</span>
                    <span className={clsx('font-semibold', cls)}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Client Representative</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name</span>
                  <span className="font-medium">{visit.client_representative || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Designation</span>
                  <span className="font-medium">{visit.client_designation || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Next Visit</span>
                  <span className="font-medium">
                    {visit.next_visit_date ? format(new Date(visit.next_visit_date), 'd MMM yyyy') : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Issues */}
      {tab === 1 && (
        <div className="space-y-3">
          {!visit.issues?.length && (
            <div className="card p-12 text-center text-gray-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No issues logged for this visit</p>
            </div>
          )}
          {visit.issues?.map((issue, i) => (
            <div key={issue.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400">#{i+1}</span>
                  <span className="text-sm font-semibold text-gray-800">{issue.dept_name || 'No Dept'}</span>
                  {issue.sub_area && <span className="text-xs text-gray-400">· {issue.sub_area}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={issue.priority} />
                  <StatusBadge status={issue.status} />
                  <StatusBadge status={issue.resolved} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Issue</p>
                  <p className="text-gray-700">{issue.issue_description}</p>
                </div>
                {issue.action_taken && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Action Taken</p>
                    <p className="text-gray-700">{issue.action_taken}</p>
                  </div>
                )}
                {issue.equip_name && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Equipment</p>
                    <p className="text-gray-700">{issue.equip_name}{issue.equipment_custom ? ` — ${issue.equipment_custom}` : ''}</p>
                  </div>
                )}
                {issue.parts_used && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Parts Used</p>
                    <p className="text-gray-700">{issue.parts_used}
                      {issue.parts_cost ? <span className="text-gray-400"> · KES {Number(issue.parts_cost).toLocaleString()}</span> : ''}
                    </p>
                  </div>
                )}
                {issue.further_request && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-orange-500 mb-1 font-medium">Further Request</p>
                    <p className="text-gray-700">{issue.further_request}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Network Points */}
      {tab === 2 && (
        <div className="space-y-3">
          {!visit.network_points?.length && (
            <div className="card p-12 text-center text-gray-400">
              <Network className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No network points logged</p>
            </div>
          )}
          {visit.network_points?.map((pt, i) => (
            <div key={pt.id} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-blue-600">{pt.point_id}</span>
                  {pt.office_room && <span className="text-xs text-gray-400">· {pt.office_room}</span>}
                  {pt.dept_name   && <span className="badge badge-blue">{pt.dept_name}</span>}
                </div>
                <StatusBadge status={pt.port_status} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[
                  ['Device', pt.device_type],
                  ['Connected To', pt.connected_to],
                  ['Port / VLAN', pt.switch_port],
                  ['Speed', pt.speed_mbps ? `${pt.speed_mbps} Mbps` : null],
                ].map(([label, val]) => val ? (
                  <div key={label}>
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="font-medium text-gray-700">{val}</p>
                  </div>
                ) : null)}
              </div>
              {pt.issue && <p className="text-sm text-red-600 mt-2 bg-red-50 rounded-lg px-3 py-2">⚠ {pt.issue}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Sign Off */}
      {tab === 3 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Technician */}
          <div className={clsx('card p-6', visit.tech_signed_at ? 'border-green-300 bg-green-50' : 'border-gray-200')}>
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              🔧 Technician Sign-Off
              {visit.tech_signed_at && <Check className="w-4 h-4 text-green-600" />}
            </h3>
            {visit.tech_signed_at ? (
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-gray-900">{visit.tech_signature_name}</p>
                <p className="text-gray-500">Signed {format(new Date(visit.tech_signed_at), 'd MMM yyyy, HH:mm')}</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500 mb-3">Not yet signed</p>
                {canSign && (
                  <button onClick={() => setSign('technician')} className="btn-primary text-xs">
                    <PenLine className="w-3.5 h-3.5" /> Sign as Technician
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Client */}
          <div className={clsx('card p-6', visit.client_signed_at ? 'border-green-300 bg-green-50' : 'border-gray-200')}>
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              ✅ Client Counter-Signature
              {visit.client_signed_at && <Check className="w-4 h-4 text-green-600" />}
            </h3>
            {visit.client_signed_at ? (
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-gray-900">{visit.client_signature_name}</p>
                {visit.client_signature_designation && <p className="text-gray-500">{visit.client_signature_designation}</p>}
                <p className="text-gray-500">Signed {format(new Date(visit.client_signed_at), 'd MMM yyyy, HH:mm')}</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500 mb-3">Awaiting client signature</p>
                {canClientSign && (
                  <button onClick={() => setSign('client')} className="btn-primary text-xs">
                    <PenLine className="w-3.5 h-3.5" /> Sign as Client
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Declaration */}
          <div className="sm:col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 text-center">
            I/We confirm that the issues, actions and findings documented in this report are accurate and reflect the work carried out during this visit. Outstanding items have been communicated to all parties.
          </div>
        </div>
      )}

      {/* Sign off modal */}
      <Modal open={!!signModal} onClose={() => { setSign(false); setSigName('') }}
             title="Record Signature" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Full Name *</label>
            <input className="input" value={sigName} autoFocus
              placeholder="Enter your full name"
              onChange={e => setSigName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSign(signModal === 'client' ? 'client' : 'technician')} />
          </div>
          <p className="text-xs text-gray-400">
            By entering your name, you confirm the contents of this report are accurate.
          </p>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => { setSign(false); setSigName('') }}>Cancel</button>
            <button className="btn-primary" disabled={signing || !sigName.trim()}
              onClick={() => handleSign(signModal === 'client' ? 'client' : 'technician')}>
              {signing ? 'Signing...' : 'Confirm & Sign'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
