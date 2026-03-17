import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { visitsApi, issuesApi, networkApi, clientsApi, equipApi } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { Spinner, Page } from '../components/ui/index'
import toast from 'react-hot-toast'
import { Plus, Trash2, ChevronRight, ChevronLeft, CheckCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'

const STEPS = ['Site Cover','Issues','Network Points','Sign Off']

const BLANK_ISSUE = { department_id:'', sub_area:'', equipment_type_id:'', equipment_custom:'', network_point_id:'', issue_description:'', root_cause:'', action_taken:'', status:'in_progress', resolved:'no', resolution_hours:'', parts_used:'', parts_cost:'', further_request:'', priority:'medium', followup_date:'', remarks:'' }
const BLANK_NET   = { point_id:'', office_room:'', department_id:'', device_type:'', connected_to:'', switch_port:'', port_status:'active', speed_mbps:'', device_connected:'', issue:'', remarks:'', accompanied_by:'' }

const SCOPE_ITEMS = ['General IT Support','Network / Cabling Audit','CCTV / NVR Check','Printer Maintenance','Access Point Config','Server / UPS Check','Laptop / Desktop Repair','Software / OS Issues','New Equipment Setup','User Training','Procurement / Quotation','Emergency Callout']
const STATUSES    = ['resolved','in_progress','unresolved','recurring','pending_parts']
const PRIORITIES  = ['critical','high','medium','low']
const PORT_ST     = ['active','dead','intermittent','not_patched','disabled','reterminate']

function Step({ steps, current }) {
  return (
    <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center flex-1 min-w-0">
          <div className="flex flex-col items-center flex-shrink-0">
            <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all',
              i < current  ? 'bg-blue-600 border-blue-600 text-white'
            : i === current ? 'bg-white border-blue-600 text-blue-600'
            : 'bg-white border-gray-200 text-gray-400')}>
              {i < current ? <CheckCircle className="w-4 h-4" /> : i + 1}
            </div>
            <span className={clsx('text-xs mt-1 whitespace-nowrap hidden sm:block',
              i === current ? 'text-blue-600 font-medium' : 'text-gray-400')}>{s}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={clsx('h-0.5 flex-1 mx-1', i < current ? 'bg-blue-600' : 'bg-gray-200')} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function NewVisitPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [step, setStep]   = useState(0)
  const [visitId, setVisitId] = useState(null)
  const [saving, setSaving]   = useState(false)

  const [cover, setCover] = useState({ client_id:'', site_id:'', visit_date: new Date().toISOString().split('T')[0], time_in:'', time_out:'', next_visit_date:'', contract_number:'', client_representative:'', client_designation:'', scope:[], summary:'' })
  const [issues, setIssues] = useState([{ ...BLANK_ISSUE }])
  const [nets, setNets]     = useState([{ ...BLANK_NET }])
  const [sigName, setSigName] = useState('')

  const { data: clients } = useQuery({ queryKey:['clients'], queryFn:()=>clientsApi.list().then(r=>r.data) })
  const { data: depts }   = useQuery({ queryKey:['depts', cover.client_id], queryFn:()=>clientsApi.depts(cover.client_id).then(r=>r.data), enabled:!!cover.client_id })
  const { data: equipTypes } = useQuery({ queryKey:['equip-types'], queryFn:()=>equipApi.types().then(r=>r.data) })

  const setC = (k, v) => setCover(p => ({ ...p, [k]: v }))
  const toggleScope = s => setC('scope', cover.scope.includes(s) ? cover.scope.filter(x=>x!==s) : [...cover.scope, s])
  const setIssue = (i, k, v) => setIssues(p => p.map((x, idx) => idx===i ? {...x,[k]:v} : x))
  const setNet   = (i, k, v) => setNets(p => p.map((x, idx) => idx===i ? {...x,[k]:v} : x))

  const ic = 'input'
  const lc = 'label'
  const sc = 'input bg-white'

  // ── STEP 0: Create visit ──────────────────────────────────────────────────
  const handleCoverNext = async () => {
    if (!cover.client_id || !cover.visit_date) { toast.error('Client and date required'); return }
    setSaving(true)
    try {
      const r = await visitsApi.create(cover)
      setVisitId(r.data.id)
      toast.success(`Visit ${r.data.visit_reference} created`)
      setStep(1)
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }

  // ── STEP 1: Save issues ───────────────────────────────────────────────────
  const handleIssuesNext = async () => {
    const valid = issues.filter(i => i.issue_description.trim())
    if (!valid.length) { toast.error('Add at least one issue'); return }
    setSaving(true)
    try {
      for (const issue of valid) await issuesApi.create(visitId, { ...issue, client_id: cover.client_id })
      toast.success(`${valid.length} issue(s) saved`)
      setStep(2)
    } catch { toast.error('Failed to save issues') }
    finally { setSaving(false) }
  }

  // ── STEP 2: Save network points ───────────────────────────────────────────
  const handleNetNext = async () => {
    const valid = nets.filter(n => n.point_id.trim())
    setSaving(true)
    try {
      for (const pt of valid) await networkApi.create(visitId, { ...pt, client_id: cover.client_id })
      if (valid.length) toast.success(`${valid.length} network point(s) saved`)
      setStep(3)
    } catch { toast.error('Failed to save network points') }
    finally { setSaving(false) }
  }

  // ── STEP 3: Sign off ──────────────────────────────────────────────────────
  const handleSignOff = async () => {
    if (!sigName.trim()) { toast.error('Enter your name to sign'); return }
    setSaving(true)
    try {
      await visitsApi.sign(visitId, { signer_type: 'technician', signer_name: sigName })
      await visitsApi.update(visitId, { status: 'completed' })
      toast.success('Visit completed and signed!')
      qc.invalidateQueries(['visits'])
      navigate(`/visits/${visitId}`)
    } catch { toast.error('Failed to sign off') }
    finally { setSaving(false) }
  }

  return (
    <Page>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Site Visit</h1>
        <p className="text-gray-500 text-sm mt-0.5">Log a complete site visit report in 4 steps</p>
      </div>

      <Step steps={STEPS} current={step} />

      {/* ── STEP 0 ──────────────────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="card p-6 space-y-5 max-w-3xl">
          <h2 className="text-base font-semibold text-gray-900">Site Cover Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={lc}>Client *</label>
              <select className={sc} value={cover.client_id} onChange={e=>setC('client_id',e.target.value)}>
                <option value="">Select client...</option>
                {clients?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className={lc}>Visit Date *</label><input type="date" className={ic} value={cover.visit_date} onChange={e=>setC('visit_date',e.target.value)}/></div>
            <div><label className={lc}>Next Visit</label><input type="date" className={ic} value={cover.next_visit_date} onChange={e=>setC('next_visit_date',e.target.value)}/></div>
            <div><label className={lc}>Time In</label><input type="time" className={ic} value={cover.time_in} onChange={e=>setC('time_in',e.target.value)}/></div>
            <div><label className={lc}>Time Out</label><input type="time" className={ic} value={cover.time_out} onChange={e=>setC('time_out',e.target.value)}/></div>
            <div><label className={lc}>Contract #</label><input className={ic} value={cover.contract_number} onChange={e=>setC('contract_number',e.target.value)}/></div>
            <div><label className={lc}>Client Representative</label><input className={ic} value={cover.client_representative} onChange={e=>setC('client_representative',e.target.value)}/></div>
            <div><label className={lc}>Designation</label><input className={ic} value={cover.client_designation} onChange={e=>setC('client_designation',e.target.value)}/></div>
          </div>
          <div>
            <label className={lc}>Scope of Visit</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {SCOPE_ITEMS.map(s=>(
                <label key={s} className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors',
                  cover.scope.includes(s) ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                  <input type="checkbox" className="rounded" checked={cover.scope.includes(s)} onChange={()=>toggleScope(s)}/>
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div><label className={lc}>Summary / Notes</label><textarea className={ic} rows={3} value={cover.summary} onChange={e=>setC('summary',e.target.value)} placeholder="Overall visit notes..."/></div>
          <div className="flex justify-end">
            <button onClick={handleCoverNext} disabled={saving} className="btn-primary">
              {saving&&<Loader2 className="w-4 h-4 animate-spin"/>} Next: Log Issues <ChevronRight className="w-4 h-4"/>
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 1 ──────────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4 max-w-4xl">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
            💡 Enter a <strong>Network Point ID</strong> in any row — it will auto-link to the network audit in Step 3
          </div>
          {issues.map((iss, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-gray-700">Issue #{i+1}</span>
                {issues.length > 1 && <button onClick={()=>setIssues(p=>p.filter((_,idx)=>idx!==i))} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div><label className={lc}>Department</label><select className={sc} value={iss.department_id} onChange={e=>setIssue(i,'department_id',e.target.value)}><option value="">Select...</option>{depts?.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                <div><label className={lc}>Sub-Area / Room</label><input className={ic} value={iss.sub_area} onChange={e=>setIssue(i,'sub_area',e.target.value)}/></div>
                <div><label className={lc}>Equipment Type</label><select className={sc} value={iss.equipment_type_id} onChange={e=>setIssue(i,'equipment_type_id',e.target.value)}><option value="">Select...</option>{equipTypes?.map(et=><option key={et.id} value={et.id}>{et.name}</option>)}</select></div>
                <div><label className={lc}>Custom Equipment (if OTHER)</label><input className={ic} value={iss.equipment_custom} placeholder="Describe equipment..." onChange={e=>setIssue(i,'equipment_custom',e.target.value)}/></div>
                <div><label className={lc}>Network Point ID</label><input className={ic} value={iss.network_point_id} placeholder="AP-01, SW-B2..." onChange={e=>setIssue(i,'network_point_id',e.target.value)}/></div>
                <div><label className={lc}>Priority</label><select className={sc} value={iss.priority} onChange={e=>setIssue(i,'priority',e.target.value)}>{PRIORITIES.map(p=><option key={p} value={p} className="capitalize">{p}</option>)}</select></div>
                <div><label className={lc}>Status</label><select className={sc} value={iss.status} onChange={e=>setIssue(i,'status',e.target.value)}>{STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}</select></div>
                <div><label className={lc}>Resolved</label><select className={sc} value={iss.resolved} onChange={e=>setIssue(i,'resolved',e.target.value)}><option value="yes">Yes</option><option value="no">No</option><option value="partial">Partial</option></select></div>
                <div><label className={lc}>Res. Time (hrs)</label><input type="number" min="0" step="0.5" className={ic} value={iss.resolution_hours} onChange={e=>setIssue(i,'resolution_hours',e.target.value)}/></div>
                <div className="sm:col-span-2 lg:col-span-3"><label className={lc}>Issue Description *</label><textarea className={ic} rows={2} value={iss.issue_description} placeholder="Describe the issue clearly..." onChange={e=>setIssue(i,'issue_description',e.target.value)}/></div>
                <div className="sm:col-span-2 lg:col-span-3"><label className={lc}>Action Taken</label><textarea className={ic} rows={2} value={iss.action_taken} onChange={e=>setIssue(i,'action_taken',e.target.value)}/></div>
                <div><label className={lc}>Parts Used</label><input className={ic} value={iss.parts_used} onChange={e=>setIssue(i,'parts_used',e.target.value)}/></div>
                <div><label className={lc}>Parts Cost (KES)</label><input type="number" className={ic} value={iss.parts_cost} onChange={e=>setIssue(i,'parts_cost',e.target.value)}/></div>
                <div><label className={lc}>Follow-up Date</label><input type="date" className={ic} value={iss.followup_date} onChange={e=>setIssue(i,'followup_date',e.target.value)}/></div>
                <div className="sm:col-span-2 lg:col-span-3"><label className={lc}>Further Request</label><textarea className={ic} rows={2} value={iss.further_request} placeholder="Any follow-up procurement or action needed..." onChange={e=>setIssue(i,'further_request',e.target.value)}/></div>
              </div>
            </div>
          ))}
          <button onClick={()=>setIssues(p=>[...p,{...BLANK_ISSUE}])} className="btn-secondary text-sm w-full">
            <Plus className="w-4 h-4"/> Add Another Issue
          </button>
          <div className="flex justify-between">
            <button onClick={()=>setStep(0)} className="btn-secondary"><ChevronLeft className="w-4 h-4"/> Back</button>
            <button onClick={handleIssuesNext} disabled={saving} className="btn-primary">
              {saving&&<Loader2 className="w-4 h-4 animate-spin"/>} Save & Continue <ChevronRight className="w-4 h-4"/>
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2 ──────────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4 max-w-4xl">
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-xs text-teal-700">
            🌐 Walk each office with the admin. The <strong>Point ID</strong> you enter here auto-fills into Visit Log issues that reference it.
          </div>
          {nets.map((pt, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-teal-700">Network Point #{i+1}</span>
                {nets.length > 1 && <button onClick={()=>setNets(p=>p.filter((_,idx)=>idx!==i))} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div><label className={lc}>Point ID * (e.g. AP-01)</label><input className={ic} value={pt.point_id} placeholder="AP-01, SW-B2..." onChange={e=>setNet(i,'point_id',e.target.value)}/></div>
                <div><label className={lc}>Office / Room</label><input className={ic} value={pt.office_room} onChange={e=>setNet(i,'office_room',e.target.value)}/></div>
                <div><label className={lc}>Department</label><select className={sc} value={pt.department_id} onChange={e=>setNet(i,'department_id',e.target.value)}><option value="">Select...</option>{depts?.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                <div><label className={lc}>Device Type</label><input className={ic} value={pt.device_type} placeholder="Access Point, Switch..." onChange={e=>setNet(i,'device_type',e.target.value)}/></div>
                <div><label className={lc}>Connected To</label><input className={ic} value={pt.connected_to} placeholder="SW-01 Port 5" onChange={e=>setNet(i,'connected_to',e.target.value)}/></div>
                <div><label className={lc}>Switch Port / VLAN</label><input className={ic} value={pt.switch_port} onChange={e=>setNet(i,'switch_port',e.target.value)}/></div>
                <div><label className={lc}>Port Status</label><select className={sc} value={pt.port_status} onChange={e=>setNet(i,'port_status',e.target.value)}>{PORT_ST.map(s=><option key={s} value={s} className="capitalize">{s.replace(/_/g,' ')}</option>)}</select></div>
                <div><label className={lc}>Speed (Mbps)</label><input className={ic} value={pt.speed_mbps} placeholder="100 / 1000" onChange={e=>setNet(i,'speed_mbps',e.target.value)}/></div>
                <div><label className={lc}>Accompanied By</label><input className={ic} value={pt.accompanied_by} onChange={e=>setNet(i,'accompanied_by',e.target.value)}/></div>
                <div className="sm:col-span-2 lg:col-span-3"><label className={lc}>Issue / Remarks</label><textarea className={ic} rows={2} value={pt.issue} onChange={e=>setNet(i,'issue',e.target.value)}/></div>
              </div>
            </div>
          ))}
          <button onClick={()=>setNets(p=>[...p,{...BLANK_NET}])} className="btn-secondary text-sm w-full">
            <Plus className="w-4 h-4"/> Add Network Point
          </button>
          <div className="flex justify-between">
            <button onClick={()=>setStep(1)} className="btn-secondary"><ChevronLeft className="w-4 h-4"/> Back</button>
            <button onClick={handleNetNext} disabled={saving} className="btn-primary bg-teal-600 hover:bg-teal-700">
              {saving&&<Loader2 className="w-4 h-4 animate-spin"/>} Save & Sign Off <ChevronRight className="w-4 h-4"/>
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3 ──────────────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="max-w-2xl space-y-5">
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600"/>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Ready to Sign Off</h2>
            <p className="text-sm text-gray-500 mt-1">All visit data saved. Sign to complete this report.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border-2 border-blue-200 bg-blue-50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-blue-800 mb-3">🔧 Technician Sign-Off</h3>
              <label className="label">Full Name *</label>
              <input className="input bg-white" value={sigName} placeholder="Your full name" onChange={e=>setSigName(e.target.value)}/>
              <div className="mt-3 h-14 border-2 border-dashed border-blue-200 rounded-lg flex items-center justify-center">
                <span className="text-xs text-blue-400">Your name acts as digital signature</span>
              </div>
            </div>
            <div className="border-2 border-green-200 bg-green-50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-green-800 mb-3">✅ Client Counter-Signature</h3>
              <p className="text-xs text-green-700">The client can sign via the <strong>Client Portal</strong> after you submit, or you can record their acknowledgement on the visit detail page.</p>
              <div className="mt-3 h-14 border-2 border-dashed border-green-200 rounded-lg flex items-center justify-center">
                <span className="text-xs text-green-400">Client signs via portal or on detail page</span>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 text-center">
            I confirm the issues, actions and findings in this report are accurate and reflect work carried out during this visit.
          </div>
          <div className="flex justify-between">
            <button onClick={()=>setStep(2)} className="btn-secondary"><ChevronLeft className="w-4 h-4"/> Back</button>
            <button onClick={handleSignOff} disabled={saving||!sigName.trim()} className="btn-primary bg-green-600 hover:bg-green-700">
              {saving&&<Loader2 className="w-4 h-4 animate-spin"/>}
              <CheckCircle className="w-4 h-4"/> Complete & Sign Visit
            </button>
          </div>
        </div>
      )}
    </Page>
  )
}
